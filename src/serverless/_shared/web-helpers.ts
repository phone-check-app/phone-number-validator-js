/**
 * Helpers for Web-API-style runtimes (Vercel Edge, Cloudflare Workers,
 * Deno Deploy). Everything here uses `Request` / `Response` / `URL`
 * primitives that are global on every modern edge runtime.
 */
import type { CarrierLocale, GeocoderLocale } from '../../types';
import type { ValidationRequestBody } from './validation';

const TRUTHY = new Set(['true', '1', 'yes', 'on']);
const FALSY = new Set(['false', '0', 'no', 'off']);

function parseBoolParam(value: string | null): boolean | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (TRUTHY.has(lower)) return true;
  if (FALSY.has(lower)) return false;
  return undefined;
}

/**
 * Map URL query params onto a `ValidationRequestBody`. `phoneNumbers` accepts
 * a comma-separated list (`?phoneNumbers=+1,+44`). Boolean enrichment toggles
 * accept any of `true|false|1|0|yes|no|on|off`.
 */
export function parseQueryParams(url: URL): ValidationRequestBody {
  const q = url.searchParams;
  const phoneNumbers = q.get('phoneNumbers');
  return {
    phoneNumber: q.get('phoneNumber') || undefined,
    phoneNumbers: phoneNumbers ? phoneNumbers.split(',') : undefined,
    defaultCountry: q.get('defaultCountry') ?? undefined,
    locale: (q.get('locale') as GeocoderLocale | null) ?? undefined,
    carrierLocale: (q.get('carrierLocale') as CarrierLocale | null) ?? undefined,
    geocode: parseBoolParam(q.get('geocode')),
    carrier: parseBoolParam(q.get('carrier')),
    timezones: parseBoolParam(q.get('timezones')),
  };
}

/** Web-API JSON response shorthand. */
export function jsonResponse(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

/** `application/json` content-type guard for routed POST endpoints. */
export function requireJsonContentType(request: Request, headers: Record<string, string>): Response | null {
  const ct = request.headers.get('content-type');
  if (ct?.includes('application/json')) return null;
  return jsonResponse(400, { error: 'Content-Type must be application/json' }, headers);
}

/** Read a JSON body, mapping parse failures to a 400 response. */
export async function readJsonBody(
  request: Request,
  headers: Record<string, string>
): Promise<{ body: unknown } | { error: Response }> {
  try {
    return { body: await request.json() };
  } catch {
    return { error: jsonResponse(400, { error: 'Invalid request body' }, headers) };
  }
}
