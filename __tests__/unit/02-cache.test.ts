/**
 * Cache hits, eviction, resize, and stats. Drives the cache through the
 * public resolver functions to ensure the wiring is correct end-to-end —
 * not just the LRU primitives.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { clearCache, getCacheSize, getCacheStats, setCacheSize } from '../../src/cache';
import { geocoder, setResourceLoader } from '../../src/core';
import { MockResourceLoader } from '../helpers/mock-loader';

let loader: MockResourceLoader;

beforeEach(() => {
  loader = new MockResourceLoader();
  loader.put('geocodes/en/1.bson', { '415': 'San Francisco' });
  loader.put('geocodes/en/41.bson', { '4143': 'Zurich' });
  loader.put('geocodes/en/49.bson', { '301': 'Berlin' });
  setResourceLoader(loader);
  clearCache();
  setCacheSize(100);
});

afterEach(() => {
  setResourceLoader(null);
  setCacheSize(100);
});

describe('cache reuse', () => {
  it('caches deserialized tables across calls', () => {
    const phone = parsePhoneNumberFromString('+41431234567');
    geocoder(phone);
    expect(loader.callsFor('geocodes/en/41.bson')).toBe(1);
    geocoder(phone);
    expect(loader.callsFor('geocodes/en/41.bson')).toBe(1); // cache hit
  });

  it('clearCache forces a reload', () => {
    const phone = parsePhoneNumberFromString('+41431234567');
    geocoder(phone);
    clearCache();
    geocoder(phone);
    expect(loader.callsFor('geocodes/en/41.bson')).toBe(2);
  });
});

describe('size & stats', () => {
  it('reports current and configured size', () => {
    expect(getCacheStats()).toEqual({ size: 0, maxSize: 100 });
    geocoder(parsePhoneNumberFromString('+14155552671'));
    expect(getCacheSize()).toBe(1);
    expect(getCacheStats().size).toBe(1);
  });
});

describe('resize', () => {
  it('respects the new ceiling on shrink', () => {
    setCacheSize(2);
    geocoder(parsePhoneNumberFromString('+14155552671'));
    geocoder(parsePhoneNumberFromString('+41431234567'));
    geocoder(parsePhoneNumberFromString('+49301234567'));
    expect(getCacheSize()).toBeLessThanOrEqual(2);
  });

  it('rejects non-positive sizes', () => {
    expect(() => setCacheSize(0)).toThrow();
    expect(() => setCacheSize(-5)).toThrow();
  });

  it('is idempotent when called with the current size', () => {
    setCacheSize(50);
    expect(() => setCacheSize(50)).not.toThrow();
  });
});
