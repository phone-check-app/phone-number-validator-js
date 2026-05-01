/**
 * Azure Functions adapter for phone validation.
 *
 * Targets the v4 programming model:
 *   `(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit>`
 *
 *   GET  /api/health
 *   POST /api/validate
 *   POST /api/validate/batch
 *
 * Two handler shapes:
 *   - `azureHandler`: routed (recommended).
 *   - `azureFunction`: single-route convenience.
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

export interface AzureHttpRequest {
  method: string;
  url: string;
  headers: { get(name: string): string | null } | Record<string, string | undefined>;
  query: { get(name: string): string | null } | Record<string, string | undefined>;
  json(): Promise<unknown>;
  text?: () => Promise<string>;
}

export interface AzureInvocationContext {
  invocationId?: string;
  functionName?: string;
  log?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

export interface AzureHttpResponseInit {
  status: number;
  headers: Record<string, string>;
  jsonBody?: unknown;
  body?: string;
}

const ROUTED_HEADERS = jsonHeaders(corsHeaders());

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = ROUTED_HEADERS
): AzureHttpResponseInit {
  return { status, headers, jsonBody: body };
}

function pathOf(req: AzureHttpRequest): string {
  try {
    return new URL(req.url).pathname || '/';
  } catch {
    const idx = req.url.indexOf('?');
    return idx === -1 ? req.url : req.url.slice(0, idx);
  }
}

/** Strip `/api` prefix so `classifyRoute` sees a uniform path. */
function normalizePath(pathname: string): string {
  const stripped = pathname.replace(/^\/api/, '');
  return stripped || '/';
}

async function readJsonBody(req: AzureHttpRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new SyntaxError('Invalid JSON body');
  }
}

export async function azureHandler(
  req: AzureHttpRequest,
  _context?: AzureInvocationContext
): Promise<AzureHttpResponseInit> {
  const route = classifyRoute(normalizePath(pathOf(req)), req.method);

  switch (route.kind) {
    case 'preflight':
      return { status: 204, headers: corsHeaders() };
    case 'health':
      return jsonResponse(200, healthPayload('azure'));
    case 'method-not-allowed':
      return jsonResponse(405, { error: 'Method not allowed' });
    case 'not-found':
      return jsonResponse(404, { error: 'Not found' });
    case 'validate-single':
      return handleValidateSingle(req);
    case 'validate-batch':
      return handleValidateBatch(req);
  }
}

async function handleValidateSingle(req: AzureHttpRequest): Promise<AzureHttpResponseInit> {
  try {
    const body = (await readJsonBody(req)) as ValidationRequestBody;
    if (!body.phoneNumber) return jsonResponse(400, { error: 'phoneNumber is required' });
    const result = await validateSingle(body.phoneNumber, extractBatchOptions(body));
    return jsonResponse(200, result);
  } catch (error) {
    if (error instanceof SyntaxError) return jsonResponse(400, { error: 'Invalid request body' });
    console.error('Azure validation error:', error);
    return jsonResponse(500, { error: 'Internal server error' });
  }
}

async function handleValidateBatch(req: AzureHttpRequest): Promise<AzureHttpResponseInit> {
  try {
    const body = (await readJsonBody(req)) as ValidationRequestBody;
    const validated = validateBatchField(body.phoneNumbers);
    if (!validated.ok) return jsonResponse(validated.status, { error: validated.message });
    const results = await executeValidation({
      kind: 'batch',
      phoneNumbers: validated.phoneNumbers,
      options: extractBatchOptions(body),
    });
    return jsonResponse(200, { results });
  } catch (error) {
    if (error instanceof SyntaxError) return jsonResponse(400, { error: 'Invalid request body' });
    console.error('Azure batch validation error:', error);
    return jsonResponse(500, { error: 'Internal server error' });
  }
}

/** Single-route convenience — infers single vs. batch from the body. */
export async function azureFunction(
  req: AzureHttpRequest,
  _context?: AzureInvocationContext
): Promise<AzureHttpResponseInit> {
  if (req.method === 'OPTIONS') {
    return { status: 204, headers: corsHeaders('POST, OPTIONS') };
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { success: false, error: 'Method not allowed' });
  }
  try {
    const body = (await readJsonBody(req)) as ValidationRequestBody;
    const classified = classifyRequest(body);
    if (classified.kind === 'invalid') {
      return jsonResponse(classified.status, { success: false, error: classified.message });
    }
    const data = await executeValidation(classified);
    return jsonResponse(200, { success: true, data });
  } catch (error) {
    if (error instanceof SyntaxError) return jsonResponse(400, { success: false, error: 'Invalid request body' });
    console.error('Azure function error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonResponse(500, { success: false, error: message });
  }
}

export default { azureHandler, azureFunction };
