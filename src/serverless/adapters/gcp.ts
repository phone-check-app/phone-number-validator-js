/**
 * Google Cloud Functions (2nd gen) adapter for phone validation.
 *
 * 2nd-gen Cloud Functions run on Cloud Run and use the Functions Framework's
 * Express-style `(req, res)` signature.
 *
 *   - GET  /health
 *   - POST /validate          { phoneNumber: ... }
 *   - POST /validate/batch    { phoneNumbers: [...] }
 *
 * Two handler shapes:
 *   - `gcpHandler`: routed (recommended).
 *   - `gcpFunction`: single-route convenience that infers single vs. batch
 *     from the body, useful when the function URL itself is the entry point.
 */
import { corsHeaders, jsonHeaders } from '../_shared/cors';
import { executeValidation, validateSingle } from '../_shared/dispatch';
import { classifyRoute, healthPayload } from '../_shared/routes';
import {
  classifyRequest,
  extractBatchOptions,
  type ValidationRequestBody,
  validateBatchField,
} from '../_shared/validation';

export interface GcpRequest {
  method: string;
  path?: string;
  url?: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

export interface GcpResponse {
  status(code: number): GcpResponse;
  set(headers: Record<string, string>): GcpResponse;
  json(body: unknown): GcpResponse;
  send(body?: unknown): GcpResponse;
}

const ROUTED_HEADERS = jsonHeaders(corsHeaders());

function pathOf(req: GcpRequest): string {
  if (req.path) return req.path;
  if (!req.url) return '/';
  const idx = req.url.indexOf('?');
  return idx === -1 ? req.url : req.url.slice(0, idx);
}

function readJsonBody(req: GcpRequest): ValidationRequestBody {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as ValidationRequestBody;
    } catch {
      return {};
    }
  }
  return (req.body as ValidationRequestBody | undefined) ?? {};
}

export async function gcpHandler(req: GcpRequest, res: GcpResponse): Promise<void> {
  const route = classifyRoute(pathOf(req), req.method);

  switch (route.kind) {
    case 'preflight':
      res.status(204).set(corsHeaders()).send();
      return;
    case 'health':
      res.status(200).set(ROUTED_HEADERS).json(healthPayload('gcp'));
      return;
    case 'method-not-allowed':
      res.status(405).set(ROUTED_HEADERS).json({ error: 'Method not allowed' });
      return;
    case 'not-found':
      res.status(404).set(ROUTED_HEADERS).json({ error: 'Not found' });
      return;
    case 'validate-single':
      return handleValidateSingle(req, res);
    case 'validate-batch':
      return handleValidateBatch(req, res);
  }
}

async function handleValidateSingle(req: GcpRequest, res: GcpResponse): Promise<void> {
  try {
    const body = readJsonBody(req);
    if (!body.phoneNumber) {
      res.status(400).set(ROUTED_HEADERS).json({ error: 'phoneNumber is required' });
      return;
    }
    const result = await validateSingle(body.phoneNumber, extractBatchOptions(body));
    res.status(200).set(ROUTED_HEADERS).json(result);
  } catch (error) {
    console.error('GCP validation error:', error);
    res.status(500).set(ROUTED_HEADERS).json({ error: 'Internal server error' });
  }
}

async function handleValidateBatch(req: GcpRequest, res: GcpResponse): Promise<void> {
  try {
    const body = readJsonBody(req);
    const validated = validateBatchField(body.phoneNumbers);
    if (!validated.ok) {
      res.status(validated.status).set(ROUTED_HEADERS).json({ error: validated.message });
      return;
    }
    const results = await executeValidation({
      kind: 'batch',
      phoneNumbers: validated.phoneNumbers,
      options: extractBatchOptions(body),
    });
    res.status(200).set(ROUTED_HEADERS).json({ results });
  } catch (error) {
    console.error('GCP batch validation error:', error);
    res.status(500).set(ROUTED_HEADERS).json({ error: 'Internal server error' });
  }
}

/** Single-route convenience — infers single vs. batch from the body. */
export async function gcpFunction(req: GcpRequest, res: GcpResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.status(204).set(corsHeaders('POST, OPTIONS')).send();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).set(ROUTED_HEADERS).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const body = readJsonBody(req);
    const classified = classifyRequest(body);
    if (classified.kind === 'invalid') {
      res.status(classified.status).set(ROUTED_HEADERS).json({ success: false, error: classified.message });
      return;
    }
    const data = await executeValidation(classified);
    res.status(200).set(ROUTED_HEADERS).json({ success: true, data });
  } catch (error) {
    console.error('GCP function error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).set(ROUTED_HEADERS).json({ success: false, error: message });
  }
}

export default { gcpHandler, gcpFunction };
