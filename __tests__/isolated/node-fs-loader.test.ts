/**
 * `NodeFsResourceLoader` — exercises the bundled `resources/` directory the
 * same way the published Node entry does. Lives in `isolated/` because it
 * mutates the module-level resource loader (via the entry's import side
 * effect) and shouldn't run alongside tests that swap in a mock loader.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

const RESOURCES_DIR = join(import.meta.dir, '..', '..', 'resources');
const HAVE_RESOURCES = existsSync(join(RESOURCES_DIR, 'timezones.bson'));

const describeIfResources = HAVE_RESOURCES ? describe : describe.skip;

describeIfResources('NodeFsResourceLoader (real bundled resources)', () => {
  beforeEach(() => {
    // Re-import to pick up a fresh module state. Bun hoists `import`, so we
    // require dynamically inside `beforeEach` after clearing the cache.
    delete require.cache[require.resolve('../../src')];
    delete require.cache[require.resolve('../../src/cache')];
    delete require.cache[require.resolve('../../src/core')];
    delete require.cache[require.resolve('../../src/node-fs-loader')];
  });

  afterEach(() => {
    const { setResourceLoader } = require('../../src/core');
    setResourceLoader(null);
  });

  it('geocodes a Zurich number with the bundled resources', () => {
    const { geocoder } = require('../../src') as typeof import('../../src');
    const phone = parsePhoneNumberFromString('+41431234567');
    expect(geocoder(phone)).toBe('Zurich');
  });

  it('resolves timezones for a US number', () => {
    const { timezones } = require('../../src') as typeof import('../../src');
    const phone = parsePhoneNumberFromString('+12124567890');
    const tzs = timezones(phone);
    expect(tzs).toBeTruthy();
    expect(Array.isArray(tzs)).toBe(true);
  });

  it('exposes libphonenumber-js parsers via the barrel', () => {
    const { parsePhoneNumberFromString: parser } = require('../../src') as typeof import('../../src');
    const phone = parser('+14155552671');
    expect(phone?.isValid()).toBe(true);
  });
});
