/**
 * Netlify Functions adapter for phone validation.
 *
 * Netlify Functions run on AWS Lambda under the hood, so the event/result
 * shape is structurally identical to API Gateway proxy events.
 *
 *   GET  /.netlify/functions/<name>/health
 *   POST /.netlify/functions/<name>/validate
 *   POST /.netlify/functions/<name>/validate/batch
 *
 * Two handler shapes:
 *   - `netlifyHandler`: routed (recommended).
 *   - `netlifyFunction`: single-route convenience.
 */
import { corsHeaders, jsonHeaders } from '../_shared/cors';
import { executeValidation, validateSingle } from '../_shared/dispatch';
import { decodeLambdaBody, type LambdaResult, lambdaResponse } from '../_shared/lambda-helpers';
import { classifyRoute, healthPayload } from '../_shared/routes';
import {
  classifyRequest,
  extractBatchOptions,
  type ValidationRequestBody,
  validateBatchField,
} from '../_shared/validation';

export interface NetlifyEvent {
  body: string | null;
  headers: { [key: string]: string | undefined };
  httpMethod: string;
  path: string;
  queryStringParameters: { [key: string]: string | undefined } | null;
  isBase64Encoded?: boolean;
  rawUrl?: string;
}

export type NetlifyResult = LambdaResult;

export interface NetlifyContext {
  functionName?: string;
  awsRequestId?: string;
  identity?: unknown;
  clientContext?: unknown;
}

const ROUTED_HEADERS = jsonHeaders(corsHeaders());

/**
 * Strip Netlify's function-prefix from the incoming path so route matching
 * works regardless of whether the user hits the raw function URL or a
 * `/api/*` redirect.
 */
function normalizePath(rawPath: string): string {
  const stripped = rawPath.replace(/^\/.netlify\/functions\/[^/]+/, '').replace(/^\/api/, '');
  return stripped || '/';
}

export async function netlifyHandler(event: NetlifyEvent, _context?: NetlifyContext): Promise<NetlifyResult> {
  const route = classifyRoute(normalizePath(event.path), event.httpMethod);

  switch (route.kind) {
    case 'preflight':
      return { statusCode: 204, headers: corsHeaders(), body: '' };
    case 'health':
      return lambdaResponse(200, healthPayload('netlify'), ROUTED_HEADERS);
    case 'method-not-allowed':
      return lambdaResponse(405, { error: 'Method not allowed' }, ROUTED_HEADERS);
    case 'not-found':
      return lambdaResponse(404, { error: 'Not found' }, ROUTED_HEADERS);
    case 'validate-single':
      return handleValidateSingle(event);
    case 'validate-batch':
      return handleValidateBatch(event);
  }
}

async function handleValidateSingle(event: NetlifyEvent): Promise<NetlifyResult> {
  try {
    const body = decodeLambdaBody(event) as ValidationRequestBody;
    if (!body.phoneNumber) return lambdaResponse(400, { error: 'phoneNumber is required' }, ROUTED_HEADERS);
    const result = await validateSingle(body.phoneNumber, extractBatchOptions(body));
    return lambdaResponse(200, result, ROUTED_HEADERS);
  } catch (error) {
    if (error instanceof SyntaxError) return lambdaResponse(400, { error: 'Invalid request body' }, ROUTED_HEADERS);
    console.error('Netlify validation error:', error);
    return lambdaResponse(500, { error: 'Internal server error' }, ROUTED_HEADERS);
  }
}

async function handleValidateBatch(event: NetlifyEvent): Promise<NetlifyResult> {
  try {
    const body = decodeLambdaBody(event) as ValidationRequestBody;
    const validated = validateBatchField(body.phoneNumbers);
    if (!validated.ok) return lambdaResponse(validated.status, { error: validated.message }, ROUTED_HEADERS);
    const results = await executeValidation({
      kind: 'batch',
      phoneNumbers: validated.phoneNumbers,
      options: extractBatchOptions(body),
    });
    return lambdaResponse(200, { results }, ROUTED_HEADERS);
  } catch (error) {
    if (error instanceof SyntaxError) return lambdaResponse(400, { error: 'Invalid request body' }, ROUTED_HEADERS);
    console.error('Netlify batch validation error:', error);
    return lambdaResponse(500, { error: 'Internal server error' }, ROUTED_HEADERS);
  }
}

/** Single-route convenience — infers single vs. batch from the body. */
export async function netlifyFunction(event: NetlifyEvent, _context?: NetlifyContext): Promise<NetlifyResult> {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders('POST, OPTIONS'), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return lambdaResponse(405, { success: false, error: 'Method not allowed' }, ROUTED_HEADERS);
  }
  try {
    const body = decodeLambdaBody(event) as ValidationRequestBody;
    const classified = classifyRequest(body);
    if (classified.kind === 'invalid') {
      return lambdaResponse(classified.status, { success: false, error: classified.message }, ROUTED_HEADERS);
    }
    const data = await executeValidation(classified);
    return lambdaResponse(200, { success: true, data }, ROUTED_HEADERS);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return lambdaResponse(400, { success: false, error: 'Invalid request body' }, ROUTED_HEADERS);
    }
    console.error('Netlify function error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return lambdaResponse(500, { success: false, error: message }, ROUTED_HEADERS);
  }
}

export default { netlifyHandler, netlifyFunction };
