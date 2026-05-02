/**
 * Shared in-memory LRU for deserialized BSON lookup tables.
 *
 * The cache is keyed by the loader path (e.g. `geocodes/en/41.bson`) so the
 * same key is portable across the Node FS loader and any custom loader that
 * uses the same path scheme. Keeping the cache here (instead of inside each
 * loader) means the Node entry and any serverless adapter share the same hit
 * rate when invoked in the same process.
 */
import { lru } from 'tiny-lru';
import type { CacheStats, LookupTable } from './types';

export const DEFAULT_CACHE_SIZE = 100;

let cache = lru<LookupTable>(DEFAULT_CACHE_SIZE);
let maxSize = DEFAULT_CACHE_SIZE;

/** Internal — used by `core.ts` for read/write. */
export function cacheGet(key: string): LookupTable | undefined {
  return cache.get(key);
}

export function cacheSet(key: string, value: LookupTable): void {
  cache.set(key, value);
}

/** Drop every entry. Useful between tests and for long-running processes. */
export function clearCache(): void {
  cache.clear();
}

/** Live entry count (does not include keys evicted by the LRU). */
export function getCacheSize(): number {
  return cache.size;
}

/** Snapshot — helpful for `/health` endpoints in serverless adapters. */
export function getCacheStats(): CacheStats {
  return { size: cache.size, maxSize };
}

/**
 * Resize the cache. Existing entries are migrated newest-first up to the new
 * ceiling; any overflow is dropped. Calling this with the current size is a
 * no-op (kept for symmetry with `clearCache`).
 */
export function setCacheSize(size: number): void {
  if (size <= 0) {
    throw new Error(`Cache size must be > 0 (got ${size})`);
  }
  if (size === maxSize) return;

  const previous = cache;
  cache = lru<LookupTable>(size);
  maxSize = size;

  // tiny-lru exposes entries() oldest-first; reverse so we keep the most
  // recently used items when shrinking.
  const entries = [...previous.entries()].reverse();
  for (const [key, value] of entries) {
    if (cache.size >= size) break;
    cache.set(key, value as LookupTable);
  }
}
