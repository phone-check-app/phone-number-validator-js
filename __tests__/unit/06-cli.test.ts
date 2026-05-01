/**
 * `phone-validate` CLI — argument parsing, formatters, exit codes, and the
 * runner with injected dependencies (no real fs, no real validator).
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { clearCache } from '../../src/cache';
import { formatJson, formatPretty, formatText, verdictLine } from '../../src/cli/format';
import { parseArgs } from '../../src/cli/parse-args';
import { exitCodeFor, logFileNameFor, run } from '../../src/cli/run';
import { setResourceLoader } from '../../src/core';
import type { PhoneValidationResult } from '../../src/serverless/_shared/dispatch';
import { MockResourceLoader } from '../helpers/mock-loader';

beforeEach(() => {
  const loader = new MockResourceLoader();
  loader.put('geocodes/en/1.bson', { '415': 'San Francisco' });
  loader.put('timezones.bson', { '14155552671': 'America/Los_Angeles' });
  setResourceLoader(loader);
  clearCache();
});

afterEach(() => {
  setResourceLoader(null);
});

describe('parseArgs', () => {
  it('parses a phone number and defaults', () => {
    const result = parseArgs(['+14155552671']);
    expect(result.kind).toBe('args');
    if (result.kind !== 'args') return;
    expect(result.phoneNumber).toBe('+14155552671');
    expect(result.format).toBe('pretty');
    expect(result.locale).toBe('en');
    expect(result.logDir).toBe('./logs');
  });

  it('flags --help and --version', () => {
    expect(parseArgs(['--help']).kind).toBe('help');
    expect(parseArgs(['-h']).kind).toBe('help');
    expect(parseArgs(['--version']).kind).toBe('version');
    expect(parseArgs(['-v']).kind).toBe('version');
  });

  it('rejects unknown flags', () => {
    const result = parseArgs(['--bogus', '+14155552671']);
    expect(result.kind).toBe('error');
  });

  it('errors when the phone number is missing', () => {
    const result = parseArgs([]);
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.exitCode).toBe(2);
  });

  it('rejects invalid --format', () => {
    const result = parseArgs(['+14155552671', '--format', 'csv']);
    expect(result.kind).toBe('error');
  });

  it('disables logging with --no-log-file', () => {
    const result = parseArgs(['+14155552671', '--no-log-file']);
    if (result.kind !== 'args') throw new Error('expected args');
    expect(result.logDir).toBeNull();
  });

  it('uppercases --country', () => {
    const result = parseArgs(['+14155552671', '--country', 'us']);
    if (result.kind !== 'args') throw new Error('expected args');
    expect(result.defaultCountry).toBe('US');
  });

  it('toggles individual enrichments', () => {
    const result = parseArgs(['+14155552671', '--no-geocode', '--no-timezones']);
    if (result.kind !== 'args') throw new Error('expected args');
    expect(result.enrichGeocode).toBe(false);
    expect(result.enrichCarrier).toBe(true);
    expect(result.enrichTimezones).toBe(false);
  });

  it('--no-enrich flips all three', () => {
    const result = parseArgs(['+14155552671', '--no-enrich']);
    if (result.kind !== 'args') throw new Error('expected args');
    expect(result.enrichGeocode).toBe(false);
    expect(result.enrichCarrier).toBe(false);
    expect(result.enrichTimezones).toBe(false);
  });

  it('--enrich after --no-enrich re-enables everything', () => {
    const result = parseArgs(['+14155552671', '--no-enrich', '--enrich']);
    if (result.kind !== 'args') throw new Error('expected args');
    expect(result.enrichGeocode).toBe(true);
    expect(result.enrichCarrier).toBe(true);
    expect(result.enrichTimezones).toBe(true);
  });
});

describe('formatters', () => {
  const result: PhoneValidationResult = {
    input: '+14155552671',
    valid: true,
    formatted: {
      e164: '+14155552671',
      international: '+1 415 555 2671',
      national: '(415) 555-2671',
      rfc3966: 'tel:+14155552671',
    },
    country: 'US',
    countryCallingCode: '1',
    nationalNumber: '4155552671',
    type: 'FIXED_LINE_OR_MOBILE',
    geocode: 'San Francisco',
    carrier: null,
    timezones: ['America/Los_Angeles'],
  };

  it('verdictLine highlights validity', () => {
    expect(verdictLine(result)).toContain('VALID');
    expect(verdictLine({ ...result, valid: false })).toContain('INVALID');
  });

  it('formatJson emits a single line', () => {
    const out = formatJson(result);
    expect(JSON.parse(out)).toEqual(result);
    expect(out).not.toContain('\n');
  });

  it('formatText prints kv pairs', () => {
    const out = formatText(result);
    expect(out).toContain('country=US');
    expect(out).toContain('e164=+14155552671');
  });

  it('formatPretty includes enrichment block when present', () => {
    const out = formatPretty(result);
    expect(out).toContain('San Francisco');
    expect(out).toContain('America/Los_Angeles');
  });
});

describe('exitCodeFor', () => {
  it('returns 0 for valid', () => {
    expect(exitCodeFor({ input: 'x', valid: true })).toBe(0);
  });
  it('returns 1 for invalid', () => {
    expect(exitCodeFor({ input: 'x', valid: false })).toBe(1);
  });
});

describe('logFileNameFor', () => {
  it('produces a deterministic, filesystem-safe name', () => {
    const when = new Date(Date.UTC(2026, 0, 15, 12, 34, 56));
    const name = logFileNameFor('+14155552671', when);
    expect(name).toBe('phone-validate-2026-01-15T123456Z-+14155552671.json');
  });

  it('replaces unsafe characters', () => {
    const when = new Date(Date.UTC(2026, 0, 15));
    const name = logFileNameFor('(415) 555-2671', when);
    expect(name).not.toContain('(');
    expect(name).not.toContain(' ');
    expect(name).toContain('_415_555-2671');
  });
});

describe('run (with injected deps)', () => {
  function makeDeps() {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const writes: Array<{ path: string; contents: string }> = [];
    return {
      stdout,
      stderr,
      writes,
      deps: {
        stdout: (line: string) => stdout.push(line),
        stderr: (line: string) => stderr.push(line),
        writeFile: (path: string, contents: string) => writes.push({ path, contents }),
        ensureDir: () => {},
        now: () => new Date(Date.UTC(2026, 0, 1)),
      },
    };
  }

  function baseArgs(overrides: Partial<Parameters<typeof run>[0]> = {}): Parameters<typeof run>[0] {
    return {
      phoneNumber: '+14155552671',
      locale: 'en',
      carrierLocale: 'en',
      enrichGeocode: true,
      enrichCarrier: true,
      enrichTimezones: true,
      format: 'json',
      quiet: false,
      debug: false,
      logDir: null,
      ...overrides,
    };
  }

  it('returns 0 and writes a log file for a valid number', async () => {
    const { stdout, writes, deps } = makeDeps();
    const code = await run(baseArgs({ logDir: './logs' }), deps);
    expect(code).toBe(0);
    expect(stdout.length).toBe(1);
    expect(JSON.parse(stdout[0] ?? '{}').valid).toBe(true);
    expect(writes).toHaveLength(1);
  });

  it('returns 1 for invalid input', async () => {
    const { deps } = makeDeps();
    const code = await run(baseArgs({ phoneNumber: 'not a phone', format: 'text', quiet: true }), deps);
    expect(code).toBe(1);
  });

  it('skips file logging when logDir is null', async () => {
    const { writes, deps } = makeDeps();
    await run(baseArgs({ format: 'pretty' }), deps);
    expect(writes).toHaveLength(0);
  });

  it('skips disabled enrichments', async () => {
    const { stdout, deps } = makeDeps();
    await run(
      baseArgs({
        format: 'json',
        enrichGeocode: false,
        enrichCarrier: false,
        enrichTimezones: false,
      }),
      deps
    );
    const result = JSON.parse(stdout[0] ?? '{}');
    expect(result.valid).toBe(true);
    // When skipped, the fields are absent — not `null`. Lets callers tell
    // "didn't run" from "ran but no data".
    expect('geocode' in result).toBe(false);
    expect('carrier' in result).toBe(false);
    expect('timezones' in result).toBe(false);
  });
});
