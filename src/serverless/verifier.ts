/**
 * Pure serverless validator surface.
 *
 * No `node:fs` imports → safe for any edge / browser / Workers runtime.
 * Bring your own `ResourceLoader` via `setResourceLoader()` before calling
 * the lookup functions; the loader is the integration point for KV / R2 /
 * S3 / `fetch`-based resource hosting.
 *
 * For Node.js use, prefer the main entry: it ships a built-in fs loader so
 * you don't need to wire one up.
 */

// Re-export libphonenumber-js so a single import covers parsing + lookup.
export * from 'libphonenumber-js';

// Cache primitives
export { clearCache, DEFAULT_CACHE_SIZE, getCacheSize, getCacheStats, setCacheSize } from '../cache';

// Resolver functions + enrichment helper
export {
  carrier,
  carrierAsync,
  type EnrichmentResult,
  type EnrichOptions,
  enrichPhoneNumber,
  geocoder,
  geocoderAsync,
  getResourceLoader,
  setResourceLoader,
  timezones,
  timezonesAsync,
} from '../core';

// Public type surface
export type {
  CacheStats,
  CarrierLocale,
  GeocoderLocale,
  LookupTable,
  MaybePhoneNumber,
  ResourceKind,
  ResourceLoader,
} from '../types';

// Built-in `fetch`-based loader for HTTP / CDN-hosted resources. Edge runtimes
// (Cloudflare Workers, Vercel Edge, Netlify Edge, Deno Deploy) all expose
// `fetch` natively. For Lambda / GCP / Azure on Node 18+, `fetch` is also
// available globally — no polyfill required.
export { FetchResourceLoader, type FetchResourceLoaderOptions } from './loaders/fetch-loader';

// Cloudflare KV / R2 / Workers KV-shaped loader.
export { type KvNamespace, KvResourceLoader, type KvResourceLoaderOptions } from './loaders/kv-loader';
