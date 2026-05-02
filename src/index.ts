/**
 * Public Node.js entry point.
 *
 * Wires the bundled `resources/` directory into the core resolver via a
 * synchronous `node:fs` loader, then re-exports the full public surface.
 *
 * For serverless / edge runtimes (no `node:fs`), import from
 * `@phonecheck/phone-number-validator-js/serverless` and supply your own
 * `ResourceLoader` (KV / R2 / S3 / fetch) via `setResourceLoader()`.
 */

import { setResourceLoader } from './core';
import { NodeFsResourceLoader } from './node-fs-loader';

// Install the default loader at import time. Consumers can swap it via
// `setResourceLoader()` if they need to point at a different resources dir
// (e.g. when bundling resources into a different location).
setResourceLoader(new NodeFsResourceLoader());

// Re-export every parser / type from libphonenumber-js so consumers don't
// need a second import for `parsePhoneNumberFromString`, `PhoneNumber`, etc.
export * from 'libphonenumber-js';
export {
  clearCache,
  DEFAULT_CACHE_SIZE,
  getCacheSize,
  getCacheStats,
  setCacheSize,
} from './cache';
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
} from './core';
export { NodeFsResourceLoader, type NodeFsResourceLoaderOptions } from './node-fs-loader';
export type {
  CacheStats,
  CarrierLocale,
  GeocoderLocale,
  LookupTable,
  MaybePhoneNumber,
  ResourceKind,
  ResourceLoader,
} from './types';
