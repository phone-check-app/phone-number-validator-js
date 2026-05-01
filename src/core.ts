/**
 * Pure resolver — turns a parsed phone number + a `ResourceLoader` into a
 * geocoded location, carrier, or timezone list.
 *
 * Single source of truth for the lookup algorithm: try the requested locale,
 * fall back to `en` if missing, and walk the national-number prefix from
 * longest to shortest looking for a match in the BSON lookup table.
 *
 * The Node entry (`index.ts`) wraps this with a synchronous `node:fs` loader.
 * Serverless adapters wrap it with KV / R2 / S3 / `fetch`-based loaders. The
 * sync variants (`geocoder` / `carrier` / `timezones`) require the loader to
 * implement `loadResourceSync` — they return `null` otherwise.
 */
import { deserialize } from 'bson';
import { cacheGet, cacheSet } from './cache';
import type {
  CarrierLocale,
  GeocoderLocale,
  LookupTable,
  MaybePhoneNumber,
  ResourceKind,
  ResourceLoader,
} from './types';

const DEFAULT_LOCALE = 'en';
const TIMEZONES_PATH = 'timezones.bson';

let activeLoader: ResourceLoader | null = null;

/** Replace (or clear, with `null`) the loader used by every lookup function. */
export function setResourceLoader(loader: ResourceLoader | null): void {
  activeLoader = loader;
}

export function getResourceLoader(): ResourceLoader | null {
  return activeLoader;
}

/* ── Lookup primitives ─────────────────────────────────────────────────── */

/**
 * Walk the prefix from longest to shortest, returning the first non-empty
 * string match. The BSON tables are keyed on national-number prefixes
 * (e.g. `"4155"` for SF) — this matches Google libphonenumber's lookup.
 */
function findByPrefix(table: LookupTable, key: string): string | null {
  for (let prefix = key; prefix.length > 0; prefix = prefix.slice(0, -1)) {
    const value = table[prefix];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

/** `null` for empty / undecodable input — always callers' guard. */
function decodeBson(bytes: Uint8Array | null): LookupTable | null {
  if (!bytes || bytes.byteLength === 0) return null;
  // bson.deserialize accepts Uint8Array on Node (Buffer is a subclass), but we
  // coerce explicitly so older typings don't complain.
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return deserialize(buf) as LookupTable;
}

/** Quiet in production; loud in dev. Custom loaders can pre-emptively swallow. */
function logLoadError(path: string, err: unknown): void {
  if (process.env.NODE_ENV !== 'production') {
    console.error(`Error loading data from ${path}:`, err);
  }
}

/**
 * Decode + cache `bytes` under `path`. Centralises the post-fetch path so the
 * sync and async loaders share the same cache-write semantics.
 */
function rememberTable(path: string, bytes: Uint8Array | null): LookupTable | null {
  const table = decodeBson(bytes);
  if (!table) return null;
  cacheSet(path, table);
  return table;
}

/* ── Loader I/O wrappers ───────────────────────────────────────────────── */

async function loadTableAsync(path: string): Promise<LookupTable | null> {
  if (!activeLoader) return null;
  const cached = cacheGet(path);
  if (cached) return cached;
  try {
    return rememberTable(path, await activeLoader.loadResource(path));
  } catch (err) {
    logLoadError(path, err);
    return null;
  }
}

function loadTableSync(path: string): LookupTable | null {
  if (!activeLoader?.loadResourceSync) return null;
  const cached = cacheGet(path);
  if (cached) return cached;
  try {
    return rememberTable(path, activeLoader.loadResourceSync(path));
  } catch (err) {
    logLoadError(path, err);
    return null;
  }
}

/* ── Path + parts helpers ──────────────────────────────────────────────── */

function localeResourcePath(kind: ResourceKind, locale: string, countryCode: string): string {
  return `${kind}/${locale}/${countryCode}.bson`;
}

/**
 * Candidate paths for a kind+cc, ordered most-specific first. The default
 * locale is appended only when the requested locale differs — keeping the
 * single-attempt case truly single-attempt.
 */
function localePaths(kind: ResourceKind, locale: string, cc: string): string[] {
  if (locale === DEFAULT_LOCALE) return [localeResourcePath(kind, DEFAULT_LOCALE, cc)];
  return [localeResourcePath(kind, locale, cc), localeResourcePath(kind, DEFAULT_LOCALE, cc)];
}

/**
 * Extract `(nationalNumber, countryCallingCode)` if both are present. Returns
 * `null` when either is missing — `libphonenumber-js` populates them only for
 * recognized country codes.
 */
function partsOf(phoneNumber: MaybePhoneNumber): { national: string; cc: string } | null {
  const national = phoneNumber?.nationalNumber?.toString();
  const cc = phoneNumber?.countryCallingCode?.toString();
  if (!national || !cc) return null;
  return { national, cc };
}

/** E.164 number with leading `+` stripped — the timezone lookup key. */
function timezoneKey(phoneNumber: MaybePhoneNumber): string | null {
  const raw = phoneNumber?.number?.toString();
  if (!raw) return null;
  return raw.startsWith('+') ? raw.slice(1) : raw;
}

function parseTimezones(value: string | null): string[] | null {
  if (!value) return null;
  const zones = value.split('&').filter((z) => z.length > 0);
  return zones.length > 0 ? zones : null;
}

/* ── Locale-walking lookups ────────────────────────────────────────────── */

async function localizedAsync(
  kind: ResourceKind,
  phoneNumber: MaybePhoneNumber,
  locale: string
): Promise<string | null> {
  const parts = partsOf(phoneNumber);
  if (!parts) return null;
  for (const path of localePaths(kind, locale, parts.cc)) {
    const table = await loadTableAsync(path);
    const hit = table ? findByPrefix(table, parts.national) : null;
    if (hit) return hit;
  }
  return null;
}

function localizedSync(kind: ResourceKind, phoneNumber: MaybePhoneNumber, locale: string): string | null {
  const parts = partsOf(phoneNumber);
  if (!parts) return null;
  for (const path of localePaths(kind, locale, parts.cc)) {
    const table = loadTableSync(path);
    const hit = table ? findByPrefix(table, parts.national) : null;
    if (hit) return hit;
  }
  return null;
}

/* ── Public sync API ───────────────────────────────────────────────────── */

/**
 * Geographical info (city / region) for the given phone number, in the
 * requested locale. Falls back to English when the locale-specific table is
 * missing for that country code. Returns `null` for landline-only,
 * unrecognized, or invalid numbers.
 */
export function geocoder(phoneNumber: MaybePhoneNumber, locale: GeocoderLocale = DEFAULT_LOCALE): string | null {
  return localizedSync('geocodes', phoneNumber, locale);
}

/**
 * Original carrier of the phone number (Google libphonenumber's
 * carrier-mapping table — does **not** reflect ports). Returns `null` for
 * landlines and unmapped ranges.
 */
export function carrier(phoneNumber: MaybePhoneNumber, locale: CarrierLocale = DEFAULT_LOCALE): string | null {
  return localizedSync('carrier', phoneNumber, locale);
}

/** Timezones associated with the number (one or more IANA zone IDs). */
export function timezones(phoneNumber: MaybePhoneNumber): string[] | null {
  const key = timezoneKey(phoneNumber);
  if (!key) return null;
  const table = loadTableSync(TIMEZONES_PATH);
  return table ? parseTimezones(findByPrefix(table, key)) : null;
}

/* ── Public async API ──────────────────────────────────────────────────── */

export async function geocoderAsync(
  phoneNumber: MaybePhoneNumber,
  locale: GeocoderLocale = DEFAULT_LOCALE
): Promise<string | null> {
  return localizedAsync('geocodes', phoneNumber, locale);
}

export async function carrierAsync(
  phoneNumber: MaybePhoneNumber,
  locale: CarrierLocale = DEFAULT_LOCALE
): Promise<string | null> {
  return localizedAsync('carrier', phoneNumber, locale);
}

export async function timezonesAsync(phoneNumber: MaybePhoneNumber): Promise<string[] | null> {
  const key = timezoneKey(phoneNumber);
  if (!key) return null;
  const table = await loadTableAsync(TIMEZONES_PATH);
  return table ? parseTimezones(findByPrefix(table, key)) : null;
}

/* ── Convenience: full enrichment in one call ──────────────────────────── */

export interface EnrichmentResult {
  geocode: string | null;
  carrier: string | null;
  timezones: string[] | null;
}

export interface EnrichOptions {
  /** Geocoder locale; falls back to `en` when missing. */
  locale?: GeocoderLocale;
  /** Carrier locale; falls back to `en` when missing. */
  carrierLocale?: CarrierLocale;
}

/**
 * One-shot lookup: geocode + carrier + timezones in parallel. Convenient when
 * you'd otherwise call all three async functions back-to-back. Sync callers
 * should call the three sync functions directly.
 */
export async function enrichPhoneNumber(
  phoneNumber: MaybePhoneNumber,
  options: EnrichOptions = {}
): Promise<EnrichmentResult> {
  const [geocode, car, tz] = await Promise.all([
    geocoderAsync(phoneNumber, options.locale),
    carrierAsync(phoneNumber, options.carrierLocale),
    timezonesAsync(phoneNumber),
  ]);
  return { geocode, carrier: car, timezones: tz };
}
