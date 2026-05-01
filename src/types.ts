/**
 * Public type surface. Anything exported from `src/index.ts` (or a serverless
 * entry) that needs a stable shape lives here. Internal types stay in their
 * owning module.
 */
import type { PhoneNumber } from 'libphonenumber-js';

export type { CarrierLocale, GeocoderLocale } from './locales';

/** A `libphonenumber-js` parse result, possibly undefined when input is invalid. */
export type MaybePhoneNumber = PhoneNumber | undefined;

/**
 * BSON-deserialized lookup table. Keys are national-number prefixes
 * (e.g. `"4155"`); values are the localized description (e.g. `"San Francisco"`).
 *
 * `unknown` for value because the deserialized BSON type isn't typed by the
 * upstream library. Callers narrow via `typeof === 'string'`.
 */
export type LookupTable = Record<string, unknown>;

/**
 * Strategy for fetching `.bson` lookup tables from a backing store.
 *
 * Node.js consumers don't need to implement this — the default `index.ts`
 * entry ships a `NodeFsResourceLoader` that reads from the bundled
 * `resources/` directory. Serverless / edge runtimes inject their own
 * (`fetch` + KV / R2 / S3 / etc.) via `setResourceLoader()`.
 *
 * Implementations may provide either or both of:
 *   - `loadResource` — async; required for KV / S3 / fetch backends.
 *   - `loadResourceSync` — sync; required if `geocoder` / `carrier` /
 *     `timezones` (the sync exports) are called. Async-only environments
 *     should use `geocoderAsync` / `carrierAsync` / `timezonesAsync`.
 */
export interface ResourceLoader {
  loadResource(path: string): Promise<Uint8Array | null>;
  loadResourceSync?(path: string): Uint8Array | null;
}

/**
 * Resource categories shipped under `resources/`. Used by the loader path
 * builder. New categories must be added in lockstep with the metadata
 * generator (`scripts/prepare-metadata.ts`).
 */
export type ResourceKind = 'geocodes' | 'carrier';

/**
 * Stats returned by `getCacheStats()` — one snapshot of the LRU.
 * `size` is the live entry count, `maxSize` the configured ceiling.
 */
export interface CacheStats {
  size: number;
  maxSize: number;
}
