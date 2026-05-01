/**
 * Cloudflare Workers adapter for phone validation.
 * Supports Workers, Pages Functions, and Durable Objects.
 *
 * The Worker auto-installs a `KvResourceLoader` if `env.PHONE_RESOURCES` is
 * bound — meaning the only deployment step is uploading the `resources/`
 * tree to KV (see `scripts/deploy-resources.ts cloudflare`). Without a KV
 * binding, callers must `setResourceLoader()` themselves before invoking the
 * worker (e.g. with the `FetchResourceLoader` pointing at an R2 bucket).
 */
import { clearCache, getCacheStats } from '../../cache';
import { setResourceLoader } from '../../core';
import { corsHeaders, jsonHeaders } from '../_shared/cors';
import { executeValidation, type PhoneValidationResult, validateSingle } from '../_shared/dispatch';
import { classifyRequest, type ValidationRequestBody } from '../_shared/validation';
import { jsonResponse, parseQueryParams } from '../_shared/web-helpers';
import { KvResourceLoader } from '../loaders/kv-loader';

/**
 * Workers KV surface — overloaded to match the runtime contract. The
 * `arrayBuffer` overload satisfies the resource loader's `KvNamespace`; the
 * `json` overload powers `KvResultCache`.
 */
interface KVNamespace {
  get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
  get<T = unknown>(key: string, type: 'json'): Promise<T | null>;
  get(key: string, type?: 'text'): Promise<string | null>;
  put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

interface DurableObjectId {
  toString(): string;
}

interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

interface DurableObjectState {
  storage: DurableObjectStorage;
}

interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface CloudflareRequest extends Request {
  cf?: {
    country?: string;
    colo?: string;
    timezone?: string;
  };
}

export interface CloudflareEnv {
  /** Optional KV namespace holding the BSON resources tree. */
  PHONE_RESOURCES?: KVNamespace;
  /** Optional KV namespace caching per-number validation results. */
  RESULT_CACHE?: KVNamespace;
  /** Optional Durable Object binding. */
  PHONE_VALIDATOR?: DurableObjectNamespace;
  [key: string]: unknown;
}

export interface CloudflareContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const POST_HEADERS = jsonHeaders(corsHeaders('POST, GET, OPTIONS'));

class KvResultCache<T> {
  constructor(
    private readonly kv: KVNamespace,
    private readonly ttl: number = 3600
  ) {}

  async get(key: string): Promise<T | undefined> {
    const value = await this.kv.get<T>(key, 'json');
    return value ?? undefined;
  }

  async set(key: string, value: T): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), { expirationTtl: this.ttl });
  }
}

function ensureLoader(env: CloudflareEnv): void {
  // Workers KV is structurally compatible with our KvNamespace surface
  // (`get(key, 'arrayBuffer')`); install the loader on first use.
  if (env.PHONE_RESOURCES) {
    setResourceLoader(new KvResourceLoader({ namespace: env.PHONE_RESOURCES }));
  }
}

async function workerHandler(
  request: CloudflareRequest,
  env: CloudflareEnv,
  ctx: CloudflareContext
): Promise<Response> {
  ensureLoader(env);
  const resultCache = env.RESULT_CACHE ? new KvResultCache<PhoneValidationResult>(env.RESULT_CACHE) : undefined;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders('POST, GET, OPTIONS') });
  }

  try {
    const body = await readBody(request);
    if (!body) return jsonResponse(405, { success: false, error: 'Method not allowed' }, POST_HEADERS);

    const classified = classifyRequest(body);
    if (classified.kind === 'invalid') {
      return jsonResponse(classified.status, { success: false, error: classified.message }, POST_HEADERS);
    }

    if (classified.kind === 'single' && resultCache) {
      const cached = await resultCache.get(`phone:${classified.phoneNumber}`);
      if (cached) return cachedResponse(cached);
    }

    const data = await executeValidation(classified);

    if (resultCache) {
      ctx.waitUntil(persistResults(resultCache, classified, data));
    }

    return freshResponse(data, classified.kind === 'single');
  } catch (error) {
    console.error('Cloudflare Workers error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonResponse(500, { success: false, error: message }, POST_HEADERS);
  }
}

async function readBody(request: Request): Promise<ValidationRequestBody | null> {
  if (request.method === 'GET') return parseQueryParams(new URL(request.url));
  if (request.method === 'POST') return (await request.json()) as ValidationRequestBody;
  return null;
}

function cachedResponse(data: PhoneValidationResult): Response {
  return new Response(JSON.stringify({ success: true, data, cached: true }), {
    status: 200,
    headers: jsonHeaders({
      ...corsHeaders('POST, GET, OPTIONS'),
      'Cache-Control': 'public, max-age=3600',
      'CF-Cache-Status': 'HIT',
    }),
  });
}

function freshResponse(data: PhoneValidationResult | PhoneValidationResult[], isSingle: boolean): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: jsonHeaders({
      ...corsHeaders('POST, GET, OPTIONS'),
      'Cache-Control': 'public, max-age=3600',
      ...(isSingle ? { 'CF-Cache-Status': 'MISS' } : {}),
    }),
  });
}

async function persistResults(
  cache: KvResultCache<PhoneValidationResult>,
  classified: ReturnType<typeof classifyRequest>,
  data: PhoneValidationResult | PhoneValidationResult[]
): Promise<void> {
  if (classified.kind === 'invalid') return;
  if (classified.kind === 'single') {
    await cache.set(`phone:${classified.phoneNumber}`, data as PhoneValidationResult);
    return;
  }
  await Promise.all(
    (data as PhoneValidationResult[]).map((result, i) => cache.set(`phone:${classified.phoneNumbers[i]}`, result))
  );
}

/**
 * Durable Object that owns a per-instance in-memory LRU. Useful when you want
 * a single warm node per geography to avoid cold BSON deserialization.
 */
export class PhoneValidatorDO {
  // The state/env arguments are part of the Durable Object constructor
  // contract — we don't currently use them (the cache lives in module
  // memory). Persistent storage is a future enhancement.
  // biome-ignore lint/complexity/noUselessConstructor: required by the DO contract
  constructor(_state: DurableObjectState, _env: CloudflareEnv) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    switch (url.pathname) {
      case '/validate':
        return handleDOValidation(request);
      case '/cache/clear':
        clearCache();
        return doJsonResponse({ success: true, message: 'Cache cleared' });
      case '/cache/stats':
        return doJsonResponse({ success: true, stats: getCacheStats() });
      default:
        return new Response('Not found', { status: 404 });
    }
  }
}

async function handleDOValidation(request: Request): Promise<Response> {
  try {
    const requestData = (await request.json()) as ValidationRequestBody;
    const classified = classifyRequest(requestData);
    if (classified.kind === 'invalid') {
      return doJsonResponse({ success: false, error: classified.message }, classified.status);
    }
    const data =
      classified.kind === 'single'
        ? await validateSingle(classified.phoneNumber, classified.options)
        : await executeValidation(classified);
    return doJsonResponse({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return doJsonResponse({ success: false, error: message }, 500);
  }
}

function doJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export default { fetch: workerHandler, workerHandler, PhoneValidatorDO };
export { workerHandler };
