/**
 * Vercel adapter for phone number validation.
 *
 * Three handler shapes:
 *   - `edgeHandler`: Web-API style (Edge runtime), no path routing.
 *   - `nodeHandler`: Express-style req/res for the Node.js runtime.
 *   - `handler`: routed Web-API handler with `/api/health`, `/api/validate`,
 *     `/api/validate/batch`.
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
import { jsonResponse, parseQueryParams, readJsonBody, requireJsonContentType } from '../_shared/web-helpers';

export interface VercelRequest {
  method: string;
  url: string;
  headers: Headers;
  body?: unknown;
  query?: { [key: string]: string | string[] };
}

export interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
  send: (data: unknown) => void;
}

const POST_HEADERS = jsonHeaders(corsHeaders('POST, GET, OPTIONS'));
const ROUTED_HEADERS = jsonHeaders({
  ...corsHeaders(),
  'Cache-Control': 'no-store, max-age=0',
  'X-Powered-By': 'Vercel Edge Functions',
});

/** Strip `/api` prefix so `classifyRoute` sees a uniform path. */
function normalizePath(pathname: string): string {
  const stripped = pathname.replace(/^\/api/, '');
  return stripped || '/';
}

/** Edge Runtime handler — no path routing; accepts GET (query) or POST (body). */
export async function edgeHandler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders('POST, GET, OPTIONS') });
  }

  try {
    const body = await readEdgeBody(request);
    if (!body) return jsonResponse(405, { success: false, error: 'Method not allowed' }, POST_HEADERS);

    const classified = classifyRequest(body);
    if (classified.kind === 'invalid') {
      return jsonResponse(classified.status, { success: false, error: classified.message }, POST_HEADERS);
    }

    const data = await executeValidation(classified);
    return jsonResponse(
      200,
      { success: true, data },
      jsonHeaders({ ...corsHeaders('POST, GET, OPTIONS'), 'Cache-Control': 'public, max-age=3600' })
    );
  } catch (error) {
    console.error('Vercel Edge error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonResponse(500, { success: false, error: message }, POST_HEADERS);
  }
}

async function readEdgeBody(request: Request): Promise<ValidationRequestBody | null> {
  if (request.method === 'GET') return parseQueryParams(new URL(request.url));
  if (request.method === 'POST') return (await request.json()) as ValidationRequestBody;
  return null;
}

/** Node.js runtime handler (Express-style). */
export async function nodeHandler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.status(200).send('');
    return;
  }
  try {
    const body = await readNodeBody(req);
    if (!body) {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }
    const classified = classifyRequest(body);
    if (classified.kind === 'invalid') {
      res.status(classified.status).json({ success: false, error: classified.message });
      return;
    }
    const data = await executeValidation(classified);
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Vercel Node error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ success: false, error: message });
  }
}

async function readNodeBody(req: VercelRequest): Promise<ValidationRequestBody | null> {
  if (req.method === 'GET') {
    const fakeUrl = new URL(req.url, 'http://localhost');
    const fromUrl = parseQueryParams(fakeUrl);
    if (fromUrl.phoneNumber || fromUrl.phoneNumbers) return fromUrl;
    // Some test harnesses populate `req.query` instead of the URL — fall back.
    const query = req.query;
    return {
      phoneNumber: query?.phoneNumber as string | undefined,
      phoneNumbers: typeof query?.phoneNumbers === 'string' ? query.phoneNumbers.split(',') : undefined,
    };
  }
  if (req.method === 'POST') return req.body as ValidationRequestBody;
  return null;
}

export const config = {
  runtime: 'edge',
  regions: ['iad1'],
};

/** Routed handler — `/api/health`, `/api/validate`, `/api/validate/batch`. */
export async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const route = classifyRoute(normalizePath(url.pathname), request.method);

  switch (route.kind) {
    case 'preflight':
      return new Response(null, { status: 204, headers: corsHeaders() });
    case 'health':
      return jsonResponse(200, healthPayload('vercel'), ROUTED_HEADERS);
    case 'method-not-allowed':
      return jsonResponse(405, { error: 'Method not allowed' }, ROUTED_HEADERS);
    case 'not-found':
      return jsonResponse(404, { error: 'Not found' }, ROUTED_HEADERS);
    case 'validate-single':
      return handleValidateSingle(request);
    case 'validate-batch':
      return handleValidateBatch(request);
  }
}

async function handleValidateSingle(request: Request): Promise<Response> {
  const ct = requireJsonContentType(request, ROUTED_HEADERS);
  if (ct) return ct;
  const parsed = await readJsonBody(request, ROUTED_HEADERS);
  if ('error' in parsed) return parsed.error;
  const body = parsed.body as ValidationRequestBody;
  if (!body.phoneNumber) return jsonResponse(400, { error: 'phoneNumber is required' }, ROUTED_HEADERS);

  try {
    const result = await validateSingle(body.phoneNumber, extractBatchOptions(body));
    return jsonResponse(200, result, ROUTED_HEADERS);
  } catch (error) {
    console.error('Vercel validation error:', error);
    return jsonResponse(500, { error: 'Internal server error' }, ROUTED_HEADERS);
  }
}

async function handleValidateBatch(request: Request): Promise<Response> {
  const ct = requireJsonContentType(request, ROUTED_HEADERS);
  if (ct) return ct;
  const parsed = await readJsonBody(request, ROUTED_HEADERS);
  if ('error' in parsed) return parsed.error;
  const body = parsed.body as ValidationRequestBody;
  const validated = validateBatchField(body.phoneNumbers);
  if (!validated.ok) return jsonResponse(validated.status, { error: validated.message }, ROUTED_HEADERS);

  try {
    const results = await executeValidation({
      kind: 'batch',
      phoneNumbers: validated.phoneNumbers,
      options: extractBatchOptions(body),
    });
    return jsonResponse(200, { results }, ROUTED_HEADERS);
  } catch (error) {
    console.error('Vercel batch validation error:', error);
    return jsonResponse(500, { error: 'Internal server error' }, ROUTED_HEADERS);
  }
}

export default { edgeHandler, nodeHandler, handler };
