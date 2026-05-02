/**
 * Shared serverless dispatch helpers — `classifyRequest`, `validateBatchField`,
 * and the high-level `validateSingle` / `validateBatch` adapters.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { clearCache } from '../../src/cache';
import { setResourceLoader } from '../../src/core';
import { executeValidation, validateBatch, validateSingle } from '../../src/serverless/_shared/dispatch';
import { classifyRequest, MAX_BATCH_SIZE, validateBatchField } from '../../src/serverless/_shared/validation';
import { MockResourceLoader } from '../helpers/mock-loader';

let loader: MockResourceLoader;

beforeEach(() => {
  loader = new MockResourceLoader();
  loader.put('geocodes/en/1.bson', { '415': 'San Francisco' });
  loader.put('carrier/en/1.bson', { '415': 'Sample US Carrier' });
  loader.put('timezones.bson', { '14155552671': 'America/Los_Angeles' });
  setResourceLoader(loader);
  clearCache();
});

afterEach(() => {
  setResourceLoader(null);
});

describe('classifyRequest', () => {
  it('rejects empty bodies', () => {
    expect(classifyRequest(null)).toEqual({
      kind: 'invalid',
      status: 400,
      message: expect.stringContaining('phoneNumber'),
    });
    expect(classifyRequest({})).toEqual({
      kind: 'invalid',
      status: 400,
      message: expect.stringContaining('phoneNumber'),
    });
  });

  it('classifies a single-number request', () => {
    const r = classifyRequest({ phoneNumber: '+14155552671' });
    expect(r.kind).toBe('single');
  });

  it('classifies a batch request', () => {
    const r = classifyRequest({ phoneNumbers: ['+14155552671', '+442079460958'] });
    expect(r.kind).toBe('batch');
  });

  it('caps batch size', () => {
    const oversize = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, i) => `+1415${i.toString().padStart(7, '0')}`);
    expect(classifyRequest({ phoneNumbers: oversize })).toMatchObject({
      kind: 'invalid',
      status: 400,
      message: expect.stringContaining(`Maximum ${MAX_BATCH_SIZE}`),
    });
  });
});

describe('validateBatchField', () => {
  it('flags non-array input', () => {
    expect(validateBatchField(undefined)).toMatchObject({ ok: false });
    expect(validateBatchField('not-an-array')).toMatchObject({ ok: false });
  });

  it('flags empty arrays', () => {
    expect(validateBatchField([])).toMatchObject({ ok: false });
  });
});

describe('validateSingle', () => {
  it('returns the parsed + enriched data for a valid number', async () => {
    const result = await validateSingle('+14155552671');
    expect(result.valid).toBe(true);
    expect(result.country).toBe('US');
    expect(result.formatted?.e164).toBe('+14155552671');
    expect(result.geocode).toBe('San Francisco');
    expect(result.timezones).toContain('America/Los_Angeles');
  });

  it('returns valid:false for unparseable input', async () => {
    const result = await validateSingle('not a phone');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('honors defaultCountry for national-format input', async () => {
    const result = await validateSingle('(415) 555-2671', { defaultCountry: 'US' });
    expect(result.valid).toBe(true);
    expect(result.formatted?.e164).toBe('+14155552671');
  });
});

describe('validateBatch / executeValidation', () => {
  it('returns one entry per input, in order', async () => {
    const inputs = ['+14155552671', 'garbage', '+442079460958'];
    const results = await validateBatch(inputs);
    expect(results).toHaveLength(3);
    expect(results[0]?.valid).toBe(true);
    expect(results[1]?.valid).toBe(false);
    expect(results[2]?.valid).toBe(true);
  });

  it('is callable through executeValidation', async () => {
    const data = await executeValidation({
      kind: 'batch',
      phoneNumbers: ['+14155552671'],
      options: {},
    });
    expect(Array.isArray(data)).toBe(true);
  });
});

describe('enrichment toggles', () => {
  it('omits skipped fields entirely (not null)', async () => {
    const result = await validateSingle('+14155552671', {
      geocode: false,
      carrier: false,
      timezones: false,
    });
    expect(result.valid).toBe(true);
    expect('geocode' in result).toBe(false);
    expect('carrier' in result).toBe(false);
    expect('timezones' in result).toBe(false);
  });

  it('runs only the enrichments the caller asked for', async () => {
    const result = await validateSingle('+14155552671', {
      geocode: true,
      carrier: false,
      timezones: false,
    });
    expect(result.geocode).toBe('San Francisco');
    expect('carrier' in result).toBe(false);
    expect('timezones' in result).toBe(false);
  });
});
