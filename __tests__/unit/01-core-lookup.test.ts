/**
 * Core resolver — verifies prefix walk, locale fallback, and the public
 * sync / async API surface. Uses an in-memory `MockResourceLoader` so the
 * tests are deterministic and don't depend on the bundled BSON resources.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { clearCache } from '../../src/cache';
import {
  carrier,
  carrierAsync,
  enrichPhoneNumber,
  geocoder,
  geocoderAsync,
  setResourceLoader,
  timezones,
  timezonesAsync,
} from '../../src/core';
import { MockResourceLoader } from '../helpers/mock-loader';

let loader: MockResourceLoader;

beforeEach(() => {
  loader = new MockResourceLoader();
  // BSON tables are keyed by national-number prefixes (country code already stripped).
  loader.put('geocodes/en/41.bson', { '43': 'Zurich' });
  loader.put('geocodes/de/41.bson', { '43': 'Zürich' });
  loader.put('geocodes/en/1.bson', { '415': 'San Francisco' });
  loader.put('carrier/en/49.bson', { '170': 'T-Mobile' });
  loader.put('carrier/zh/86.bson', { '199': '中国电信' });
  loader.put('carrier/en/86.bson', { '199': 'China Telecom' });
  // Timezone keys are the full E.164 number (without leading +) prefix-walked.
  loader.put('timezones.bson', {
    '1415': 'America/Los_Angeles',
    '4420': 'Europe/London',
    '4930': 'Europe/Berlin',
    '8131': 'Asia/Tokyo&Asia/Seoul',
  });
  setResourceLoader(loader);
  clearCache();
});

afterEach(() => {
  setResourceLoader(null);
});

describe('geocoder (sync)', () => {
  it('returns localized data for the requested locale', () => {
    const phone = parsePhoneNumberFromString('+41431234567');
    expect(geocoder(phone, 'de')).toBe('Zürich');
  });

  it('falls back to English when the requested locale is missing', () => {
    const phone = parsePhoneNumberFromString('+41431234567');
    expect(geocoder(phone, 'fr')).toBe('Zurich');
    expect(loader.callsFor('geocodes/fr/41.bson')).toBe(1);
    expect(loader.callsFor('geocodes/en/41.bson')).toBe(1);
  });

  it('returns null for unknown country codes', () => {
    const phone = parsePhoneNumberFromString('+33140205050');
    expect(geocoder(phone)).toBeNull();
  });

  it('returns null for undefined / invalid input', () => {
    expect(geocoder(undefined)).toBeNull();
    expect(geocoder(parsePhoneNumberFromString(''))).toBeNull();
  });
});

describe('carrier (sync)', () => {
  it('returns the carrier in the requested locale', () => {
    const phone = parsePhoneNumberFromString('+8619912345678');
    expect(carrier(phone, 'zh')).toBe('中国电信');
    expect(carrier(phone, 'en')).toBe('China Telecom');
  });

  it('falls back to English when the locale-specific table is missing', () => {
    const phone = parsePhoneNumberFromString('01701234567', 'DE');
    expect(carrier(phone, 'ar')).toBe('T-Mobile');
  });

  it('returns null for landlines without carrier data', () => {
    const phone = parsePhoneNumberFromString('+41431234567');
    expect(carrier(phone)).toBeNull();
  });
});

describe('timezones (sync)', () => {
  it('returns IANA zones for an E.164 number', () => {
    const phone = parsePhoneNumberFromString('+49301234567');
    expect(timezones(phone)).toContain('Europe/Berlin');
  });

  it('splits multiple zones on the & separator', () => {
    const phone = parsePhoneNumberFromString('+81312345678');
    expect(timezones(phone)).toEqual(['Asia/Tokyo', 'Asia/Seoul']);
  });

  it('returns null when no number is provided', () => {
    expect(timezones(undefined)).toBeNull();
  });
});

describe('async API parity', () => {
  it('async functions return the same result as sync', async () => {
    const phone = parsePhoneNumberFromString('+8619912345678');
    expect(await geocoderAsync(phone)).toBe(geocoder(phone));
    expect(await carrierAsync(phone, 'zh')).toBe(carrier(phone, 'zh'));
    expect(await timezonesAsync(phone)).toEqual(timezones(phone));
  });

  it('handles slow loaders without dropping the result', async () => {
    loader.delay('geocodes/en/41.bson', 30);
    const phone = parsePhoneNumberFromString('+41431234567');
    const start = Date.now();
    const result = await geocoderAsync(phone);
    const elapsed = Date.now() - start;
    expect(result).toBe('Zurich');
    expect(elapsed).toBeGreaterThanOrEqual(25);
  });

  it('returns null on loader errors instead of throwing', async () => {
    loader.fail('geocodes/en/41.bson', new Error('network down'));
    const phone = parsePhoneNumberFromString('+41431234567');
    expect(await geocoderAsync(phone)).toBeNull();
  });
});

describe('enrichPhoneNumber', () => {
  it('runs all three lookups in parallel and returns one result', async () => {
    const phone = parsePhoneNumberFromString('+8619912345678');
    const result = await enrichPhoneNumber(phone, { carrierLocale: 'zh' });
    expect(result.carrier).toBe('中国电信');
    expect(result.geocode).toBeNull(); // we only seeded carrier table for 86
  });

  it('returns nulls everywhere for unparseable input', async () => {
    expect(await enrichPhoneNumber(undefined)).toEqual({
      geocode: null,
      carrier: null,
      timezones: null,
    });
  });
});
