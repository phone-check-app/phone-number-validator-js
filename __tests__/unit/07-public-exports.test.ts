/**
 * Public-export surface — verifies every named symbol the package documents
 * is reachable from the right entry point. Catches drift between
 * `package.json#exports`, the build outputs, and the source `export {}`
 * statements.
 *
 * We import directly from `src/` here (not the built `dist/`) so the suite
 * runs without a prior `bun run build`. The `package.json#exports` field is
 * checked against the same source paths a user would resolve via the
 * subpaths.
 */
import { describe, expect, it } from 'bun:test';

describe('Node entry — `@phonecheck/phone-number-validator-js`', () => {
  it('re-exports the resolver + cache + loader + types + dispatch helpers', async () => {
    const mod = await import('../../src');

    // Resolver
    expect(typeof mod.geocoder).toBe('function');
    expect(typeof mod.carrier).toBe('function');
    expect(typeof mod.timezones).toBe('function');
    expect(typeof mod.geocoderAsync).toBe('function');
    expect(typeof mod.carrierAsync).toBe('function');
    expect(typeof mod.timezonesAsync).toBe('function');
    expect(typeof mod.enrichPhoneNumber).toBe('function');
    expect(typeof mod.setResourceLoader).toBe('function');
    expect(typeof mod.getResourceLoader).toBe('function');

    // Cache
    expect(typeof mod.clearCache).toBe('function');
    expect(typeof mod.getCacheSize).toBe('function');
    expect(typeof mod.getCacheStats).toBe('function');
    expect(typeof mod.setCacheSize).toBe('function');
    expect(mod.DEFAULT_CACHE_SIZE).toBe(100);

    // Default loader
    expect(typeof mod.NodeFsResourceLoader).toBe('function');

    // libphonenumber-js re-exports
    expect(typeof mod.parsePhoneNumberFromString).toBe('function');
    expect(typeof mod.parsePhoneNumberWithError).toBe('function');

    // High-level dispatch helpers
    expect(typeof mod.validateSingle).toBe('function');
    expect(typeof mod.validateBatch).toBe('function');
    expect(typeof mod.executeValidation).toBe('function');
    expect(typeof mod.classifyRequest).toBe('function');
    expect(typeof mod.extractBatchOptions).toBe('function');
    expect(typeof mod.validateBatchField).toBe('function');
    expect(mod.MAX_BATCH_SIZE).toBe(100);
  });
});

describe('Serverless verifier — `/serverless/verifier`', () => {
  it('re-exports the resolver, cache, loaders, and types — no adapters', async () => {
    const mod = await import('../../src/serverless/verifier');

    // Resolver
    expect(typeof mod.geocoder).toBe('function');
    expect(typeof mod.carrierAsync).toBe('function');
    expect(typeof mod.enrichPhoneNumber).toBe('function');
    expect(typeof mod.setResourceLoader).toBe('function');

    // Cache
    expect(typeof mod.clearCache).toBe('function');
    expect(mod.DEFAULT_CACHE_SIZE).toBe(100);

    // Loaders
    expect(typeof mod.FetchResourceLoader).toBe('function');
    expect(typeof mod.KvResourceLoader).toBe('function');

    // libphonenumber-js re-exports
    expect(typeof mod.parsePhoneNumberFromString).toBe('function');

    // No adapter re-exports — verifier is the *pure* surface
    expect((mod as Record<string, unknown>).awsLambda).toBeUndefined();
    expect((mod as Record<string, unknown>).vercel).toBeUndefined();
  });
});

describe('Serverless barrel — `/serverless`', () => {
  it('re-exports verifier surface + every adapter + adapter-author helpers', async () => {
    const mod = await import('../../src/serverless');

    // Verifier surface (via `export * from './verifier'`)
    expect(typeof mod.geocoder).toBe('function');
    expect(typeof mod.FetchResourceLoader).toBe('function');
    expect(typeof mod.KvResourceLoader).toBe('function');

    // Adapters as default-export bundles
    expect(typeof mod.awsLambda).toBe('object');
    expect(typeof mod.azure).toBe('object');
    expect(typeof mod.cloudflare).toBe('object');
    expect(typeof mod.gcp).toBe('object');
    expect(typeof mod.netlify).toBe('object');
    expect(typeof mod.vercel).toBe('object');
    expect(typeof mod.PhoneValidatorDO).toBe('function');

    // Each adapter bundle ships its handlers
    expect(typeof mod.awsLambda.handler).toBe('function');
    expect(typeof mod.awsLambda.apiGatewayHandler).toBe('function');
    expect(typeof mod.awsLambda.lambdaHandler).toBe('function');
    expect(typeof mod.vercel.edgeHandler).toBe('function');
    expect(typeof mod.vercel.handler).toBe('function');
    expect(typeof mod.cloudflare.fetch).toBe('function');
    expect(typeof mod.gcp.gcpHandler).toBe('function');
    expect(typeof mod.gcp.gcpFunction).toBe('function');
    expect(typeof mod.netlify.netlifyHandler).toBe('function');
    expect(typeof mod.azure.azureHandler).toBe('function');

    // Adapter-author helpers
    expect(typeof mod.classifyRoute).toBe('function');
    expect(typeof mod.healthPayload).toBe('function');
    expect(typeof mod.corsHeaders).toBe('function');
    expect(typeof mod.jsonHeaders).toBe('function');
    expect(typeof mod.parseQueryParams).toBe('function');
    expect(typeof mod.webJsonResponse).toBe('function');
    expect(typeof mod.requireJsonContentType).toBe('function');
    expect(typeof mod.readJsonBody).toBe('function');
    expect(typeof mod.decodeLambdaBody).toBe('function');
    expect(typeof mod.lambdaResponse).toBe('function');

    // Dispatch + validation
    expect(typeof mod.validateSingle).toBe('function');
    expect(typeof mod.validateBatch).toBe('function');
    expect(typeof mod.executeValidation).toBe('function');
    expect(typeof mod.classifyRequest).toBe('function');
    expect(typeof mod.extractBatchOptions).toBe('function');
    expect(typeof mod.validateBatchField).toBe('function');
    expect(mod.MAX_BATCH_SIZE).toBe(100);
  });
});

describe('Per-platform adapter subpaths', () => {
  it('AWS — exposes routed + apiGateway + direct + cache handlers', async () => {
    const mod = await import('../../src/serverless/adapters/aws-lambda');
    expect(typeof mod.default.handler).toBe('function');
    expect(typeof mod.default.apiGatewayHandler).toBe('function');
    expect(typeof mod.default.lambdaHandler).toBe('function');
    expect(typeof mod.default.cacheHandler).toBe('function');
    expect(typeof mod.handler).toBe('function');
    expect(typeof mod.apiGatewayHandler).toBe('function');
    expect(typeof mod.lambdaHandler).toBe('function');
    expect(typeof mod.cacheHandler).toBe('function');
  });

  it('Vercel — exposes edge + node + routed handlers', async () => {
    const mod = await import('../../src/serverless/adapters/vercel');
    expect(typeof mod.default.edgeHandler).toBe('function');
    expect(typeof mod.default.nodeHandler).toBe('function');
    expect(typeof mod.default.handler).toBe('function');
    expect(typeof mod.edgeHandler).toBe('function');
    expect(typeof mod.nodeHandler).toBe('function');
    expect(typeof mod.handler).toBe('function');
    expect(mod.config.runtime).toBe('edge');
  });

  it('Cloudflare — exposes fetch (Worker) + DO + workerHandler', async () => {
    const mod = await import('../../src/serverless/adapters/cloudflare');
    expect(typeof mod.default.fetch).toBe('function');
    expect(typeof mod.default.workerHandler).toBe('function');
    expect(typeof mod.default.PhoneValidatorDO).toBe('function');
    expect(typeof mod.workerHandler).toBe('function');
    expect(typeof mod.PhoneValidatorDO).toBe('function');
  });

  it('GCP — exposes routed + single-route handlers', async () => {
    const mod = await import('../../src/serverless/adapters/gcp');
    expect(typeof mod.default.gcpHandler).toBe('function');
    expect(typeof mod.default.gcpFunction).toBe('function');
    expect(typeof mod.gcpHandler).toBe('function');
    expect(typeof mod.gcpFunction).toBe('function');
  });

  it('Netlify — exposes routed + single-route handlers', async () => {
    const mod = await import('../../src/serverless/adapters/netlify');
    expect(typeof mod.default.netlifyHandler).toBe('function');
    expect(typeof mod.default.netlifyFunction).toBe('function');
    expect(typeof mod.netlifyHandler).toBe('function');
    expect(typeof mod.netlifyFunction).toBe('function');
  });

  it('Azure — exposes routed + single-route handlers', async () => {
    const mod = await import('../../src/serverless/adapters/azure');
    expect(typeof mod.default.azureHandler).toBe('function');
    expect(typeof mod.default.azureFunction).toBe('function');
    expect(typeof mod.azureHandler).toBe('function');
    expect(typeof mod.azureFunction).toBe('function');
  });
});

describe('CLI subpath — `/cli`', () => {
  it('exposes parser, runner, and main', async () => {
    const mod = await import('../../src/cli');
    expect(typeof mod.parseArgs).toBe('function');
    expect(typeof mod.helpText).toBe('function');
    expect(typeof mod.run).toBe('function');
    expect(typeof mod.exitCodeFor).toBe('function');
    expect(typeof mod.logFileNameFor).toBe('function');
    expect(typeof mod.main).toBe('function');
  });
});

describe('Loader subpaths', () => {
  it('`FetchResourceLoader` is constructable', async () => {
    const { FetchResourceLoader } = await import('../../src/serverless/loaders/fetch-loader');
    const noop = (() => Promise.reject(new Error('never called'))) as unknown as typeof fetch;
    const loader = new FetchResourceLoader({ baseUrl: 'https://x.example/', fetch: noop });
    expect(typeof loader.loadResource).toBe('function');
  });

  it('`KvResourceLoader` is constructable', async () => {
    const { KvResourceLoader } = await import('../../src/serverless/loaders/kv-loader');
    const namespace = { get: async () => null };
    const loader = new KvResourceLoader({ namespace });
    expect(typeof loader.loadResource).toBe('function');
  });
});

describe('package.json#exports map ↔ build outputs', () => {
  it('every documented subpath maps to a file the build produces', async () => {
    const pkg = (await import('../../package.json')) as { default?: unknown } & Record<string, unknown>;
    const root = (pkg.default ?? pkg) as { exports: Record<string, Record<string, string>> };

    const expectedSubpaths = [
      '.',
      './serverless',
      './serverless/verifier',
      './serverless/aws',
      './serverless/vercel',
      './serverless/cloudflare',
      './serverless/gcp',
      './serverless/netlify',
      './serverless/azure',
      './cli',
    ];

    for (const subpath of expectedSubpaths) {
      const entry = root.exports[subpath];
      expect(entry, `missing exports entry for ${subpath}`).toBeDefined();
      // CJS + types are always present; ESM is present everywhere except `./cli`
      // (the CLI is a single CJS bundle with a Node shebang — there's no ESM
      // variant, so consumers `require()` it or use Node's CJS-from-ESM interop).
      expect(entry.require, `${subpath}.require`).toMatch(/\.(js)$/);
      expect(entry.types, `${subpath}.types`).toMatch(/\.d\.ts$/);
      if (subpath !== './cli') {
        expect(entry.import, `${subpath}.import`).toMatch(/\.(js|esm\.js)$/);
      }
    }
  });
});
