# Testing

How the test suite is organized, what each subdirectory covers, and how to
run things locally + in CI. For *rules* about how to write tests, see
[AGENTS.md](./AGENTS.md).

## Test runner

[Bun's built-in test runner](https://bun.sh/docs/cli/test) — no jest, no
ts-jest, no transform layer. `bunfig.toml` preloads
`__tests__/helpers/setup.ts` which sets `NODE_ENV=test` to silence the
dev-only `console.error` in `core.ts`.

## Layout

```
__tests__/
├── helpers/
│   ├── mock-loader.ts          # MockResourceLoader (in-memory ResourceLoader)
│   └── setup.ts                # Bun preload — env defaults
├── unit/                       # Fast, in-memory; default suite
│   ├── 01-core-lookup.test.ts        # Resolver + locale fallback + sync/async parity
│   ├── 02-cache.test.ts              # LRU hit/miss, resize, stats
│   ├── 03-resource-loaders.test.ts   # FetchResourceLoader, KvResourceLoader
│   ├── 04-serverless-dispatch.test.ts # classifyRequest, validateSingle, batch caps
│   ├── 05-adapters.test.ts           # Smoke tests for each platform adapter
│   └── 06-cli.test.ts                # parseArgs, formatters, run with injected deps
├── isolated/                   # Module-isolation cases (cleared `require.cache`)
│   └── node-fs-loader.test.ts        # Real bundled resources/ via NodeFsResourceLoader
└── integration/                # Real-network / real-fs; gated by INTEGRATION=1
```

## Running tests

```bash
# Default suite — unit + isolated, no network, no real fs
bun run test

# Just the unit suite
bun run test:unit

# Just the isolated suite (real bundled resources/)
bun run test:isolated

# Per-module slices (numbered file prefix)
bun run test:core         # 01-core-lookup
bun run test:cache        # 02-cache
bun run test:locales      # 03-resource-loaders
bun run test:serverless   # 04-serverless-dispatch + isolated
bun run test:adapters     # 05-adapters
bun run test:cli          # 06-cli

# Real-network / real-fs suite (opt-in)
bun run test:integration

# Everything (default + integration)
bun run test:all
```

## Test conventions

- **File naming.** `__tests__/unit/<NN>-<topic>.test.ts` — the numeric
  prefix lets `test:<slice>` glob a category cleanly.
- **In-memory loader.** Use the shared
  `__tests__/helpers/mock-loader.ts#MockResourceLoader`. It serializes BSON
  on demand, supports per-path delays / errors / call-count assertions.
  **Don't roll a per-file mock** — drift between fixtures was the original
  bug that motivated the helper.
- **Set + tear down loader explicitly.** Tests that mutate the active
  loader call `setResourceLoader(loader)` in `beforeEach` and
  `setResourceLoader(null)` in `afterEach`. This keeps the `unit/` and
  `isolated/` suites from leaking state.
- **Edge cases first.** A new test should cover at least one happy-path
  case + one boundary case (locale fallback, missing field, batch cap,
  cache eviction, etc.). The `01-core-lookup` and `04-serverless-dispatch`
  suites are the reference for the boundary-coverage style.
- **No real I/O in `unit/`.** Tests under `__tests__/unit/` must not touch
  the real filesystem or network. Real bundled `resources/` access goes in
  `__tests__/isolated/`. Real network goes in `__tests__/integration/`.

## Test data — BSON keys

The lookup tables are keyed on **national-number prefixes with the country
code stripped** (the format Google libphonenumber generates).

```ts
// Correct — for +41 43 1234567, the resolver looks up "43"
loader.put('geocodes/en/41.bson', { '43': 'Zurich' });

// Wrong — the resolver never looks up "4143"
loader.put('geocodes/en/41.bson', { '4143': 'Zurich' });   // miss
```

Timezone keys are the **full E.164 number with the leading `+` stripped**:

```ts
loader.put('timezones.bson', {
  '1415': 'America/Los_Angeles',
  '4420': 'Europe/London',
});
```

This caught two test-suite bugs early — keep an eye on it when seeding new
fixtures.

## Integration suite

Set `INTEGRATION=1` to enable the integration suite:

```bash
INTEGRATION=1 bun test __tests__/integration --concurrency=1
```

Integration tests can rely on the bundled `resources/` directory and on
`globalThis.fetch`. They're gated separately because they're slower and
non-deterministic on flaky networks. CI runs them on master / develop only.

## CI matrix

`.github/workflows/validate.yml` runs **lint → typecheck → test → build →
CLI smoke** against Node 22 and Node 24 (the two currently-supported LTS
lines). The release pipeline runs the same workflow on Node 24 before
`semantic-release` publishes. See
[`.github/workflows/`](./.github/workflows) for the full configuration.

## Coverage philosophy

We don't enforce a coverage threshold — the suites are organized around
behavior categories (resolver, cache, loaders, dispatch, adapters, CLI) and
new code is expected to land with tests in the matching category. The
adapter smoke tests don't re-test validation/dispatch logic that's already
covered by `04-serverless-dispatch.test.ts`; they only verify routing,
response shape, and CORS.
