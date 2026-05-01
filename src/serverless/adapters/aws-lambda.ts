/**
 * AWS Lambda adapter for phone number validation.
 *
 * Three handler shapes:
 *   - `apiGatewayHandler`: classic surface — does NOT route by path; expects
 *     the body to carry `phoneNumber` / `phoneNumbers`.
 *   - `lambdaHandler`: direct invocation (no API Gateway envelope).
 *   - `handler`: routed — `/health`, `/validate`, `/validate/batch`.
 */
import { clearCache, getCacheStats } from '../../cache';
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

export interface APIGatewayProxyEvent {
  body: string | null;
  headers: { [key: string]: string | undefined };
  httpMethod: string;
  path: string;
  queryStringParameters: { [key: string]: string | undefined } | null;
  pathParameters: { [key: string]: string | undefined } | null;
  isBase64Encoded?: boolean;
}

export type APIGatewayProxyResult = LambdaResult;

export interface LambdaContext {
  functionName: string;
  functionVersion: string;
  awsRequestId: string;
  remainingTimeInMillis: number;
}

interface ValidateResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

const POST_HEADERS = jsonHeaders(corsHeaders('POST, OPTIONS'));
const ROUTED_HEADERS = jsonHeaders(corsHeaders());

/** Classic API-Gateway shape — no path routing; body classifies single vs batch. */
export async function apiGatewayHandler(
  event: APIGatewayProxyEvent,
  _context?: LambdaContext
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders('POST, OPTIONS'), body: '' };
  }
  try {
    const body = decodeLambdaBody(event) as ValidationRequestBody;
    const classified = classifyRequest(body);
    if (classified.kind === 'invalid') {
      return lambdaResponse(classified.status, { success: false, error: classified.message }, POST_HEADERS);
    }
    const data = await executeValidation(classified);
    return lambdaResponse(200, { success: true, data }, POST_HEADERS);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return lambdaResponse(400, { success: false, error: 'Invalid JSON body' }, POST_HEADERS);
    }
    console.error('Lambda error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return lambdaResponse(500, { success: false, error: message }, POST_HEADERS);
  }
}

/** Direct invocation — no API Gateway envelope. */
export async function lambdaHandler(event: ValidationRequestBody, _context?: LambdaContext): Promise<ValidateResponse> {
  try {
    const classified = classifyRequest(event);
    if (classified.kind === 'invalid') return { success: false, error: classified.message };
    return { success: true, data: await executeValidation(classified) };
  } catch (error) {
    console.error('Lambda error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Internal server error' };
  }
}

/** Cache management — invoke directly with `{ action: 'clear' | 'stats' }`. */
export async function cacheHandler(
  event: { action: 'clear' | 'stats' },
  _context?: LambdaContext
): Promise<{ success: boolean; message?: string; stats?: unknown }> {
  switch (event.action) {
    case 'clear':
      clearCache();
      return { success: true, message: 'Cache cleared' };
    case 'stats':
      return { success: true, stats: getCacheStats() };
    default:
      return { success: false, message: 'Invalid action' };
  }
}

/** Routed handler — `/health`, `/validate`, `/validate/batch`. */
export async function handler(event: APIGatewayProxyEvent, _context?: unknown): Promise<APIGatewayProxyResult> {
  const route = classifyRoute(event.path, event.httpMethod);

  switch (route.kind) {
    case 'preflight':
      return { statusCode: 204, headers: corsHeaders(), body: '' };
    case 'health':
      return lambdaResponse(200, healthPayload('aws-lambda'), ROUTED_HEADERS);
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

async function handleValidateSingle(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const body = decodeLambdaBody(event) as ValidationRequestBody;
    if (!body.phoneNumber) {
      return lambdaResponse(400, { error: 'phoneNumber is required' }, ROUTED_HEADERS);
    }
    const result = await validateSingle(body.phoneNumber, extractBatchOptions(body));
    return lambdaResponse(200, result, ROUTED_HEADERS);
  } catch (error) {
    if (error instanceof SyntaxError) return lambdaResponse(400, { error: 'Invalid request body' }, ROUTED_HEADERS);
    console.error('Validation error:', error);
    return lambdaResponse(500, { error: 'Internal server error' }, ROUTED_HEADERS);
  }
}

async function handleValidateBatch(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
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
    console.error('Batch validation error:', error);
    return lambdaResponse(500, { error: 'Internal server error' }, ROUTED_HEADERS);
  }
}

export default { apiGatewayHandler, lambdaHandler, cacheHandler, handler };
