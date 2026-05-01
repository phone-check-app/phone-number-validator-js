/**
 * Pure routing decision used by every routed adapter. Adapters do their own
 * path normalization (Netlify strips `/.netlify/functions/<name>`, Vercel +
 * Azure use `/api/...`, AWS uses raw `/...`) and then ask `classifyRoute` to
 * decide what to do.
 *
 * Centralising the decision tree means a new endpoint (say `/cache/clear`)
 * lands in one place instead of six.
 */

export type Route =
  | { kind: 'preflight' }
  | { kind: 'health' }
  | { kind: 'validate-single' }
  | { kind: 'validate-batch' }
  | { kind: 'method-not-allowed' }
  | { kind: 'not-found' };

const VALIDATE_PATHS = new Set(['/validate', '/validate/batch']);

export function classifyRoute(path: string, method: string): Route {
  if (method === 'OPTIONS') return { kind: 'preflight' };
  if (path === '/health') {
    return method === 'GET' ? { kind: 'health' } : { kind: 'method-not-allowed' };
  }
  if (path === '/validate') {
    return method === 'POST' ? { kind: 'validate-single' } : { kind: 'method-not-allowed' };
  }
  if (path === '/validate/batch') {
    return method === 'POST' ? { kind: 'validate-batch' } : { kind: 'method-not-allowed' };
  }
  return VALIDATE_PATHS.has(path) ? { kind: 'method-not-allowed' } : { kind: 'not-found' };
}

/** Standard healthy-status payload used by every adapter. */
export function healthPayload(platform: string): { status: 'healthy'; platform: string; timestamp: string } {
  return { status: 'healthy', platform, timestamp: new Date().toISOString() };
}
