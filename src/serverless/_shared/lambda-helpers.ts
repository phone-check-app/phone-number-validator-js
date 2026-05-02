/**
 * Helpers for Lambda-shaped runtimes (AWS API Gateway proxy events, Netlify
 * Functions, classic GCP). Bodies arrive as strings (optionally base64) and
 * responses are `{ statusCode, headers, body: string }` shapes.
 */

export interface LambdaLikeEvent {
  body: string | null;
  isBase64Encoded?: boolean;
}

export interface LambdaResult {
  statusCode: number;
  headers?: { [key: string]: string };
  body: string;
}

/**
 * Decode an API Gateway / Netlify body, supporting base64 payloads. Throws
 * `SyntaxError` on malformed JSON so callers can map it to a 400 cleanly.
 */
export function decodeLambdaBody(event: LambdaLikeEvent): unknown {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    throw new SyntaxError('Invalid JSON body');
  }
}

/** Lambda-shaped JSON response shorthand. */
export function lambdaResponse(statusCode: number, body: unknown, headers: Record<string, string>): LambdaResult {
  return { statusCode, headers, body: JSON.stringify(body) };
}
