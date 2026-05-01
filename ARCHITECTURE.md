# Architecture

This document describes how the codebase is laid out, where the data flows,
and which modules own which responsibility. For *rules* about how to write
code in this repo, see [AGENTS.md](./AGENTS.md). For the public API and quick
start, see [README.md](./README.md).

## Module map

```
src/
├── index.ts                    # Node.js entry — installs the FS loader, re-exports
├── core.ts                     # Pure resolver (sync + async lookups)
├── cache.ts                    # Shared in-memory LRU
├── locales.ts                  # GeocoderLocale / CarrierLocale unions (auto-generated)
├── node-fs-loader.ts           # NodeFsResourceLoader (sync, reads bundled resources/)
├── types.ts                    # Public types (ResourceLoader, CacheStats, etc.)
├── cli/
│   ├── index.ts                # phone-validate bin entrypoint
│   ├── parse-args.ts           # Table-driven flag parser
│   ├── format.ts               # text / json / pretty formatters
│   └── run.ts                  # Validator → output → exit code
└── serverless/
    ├── index.ts                # Barrel re-export of every adapter + verifier
    ├── verifier.ts             # Pure validator surface (no fs imports)
    ├── _shared/
    │   ├── cors.ts             # corsHeaders / jsonHeaders
    │   ├── dispatch.ts         # validateSingle / validateBatch / executeValidation
    │   ├── lambda-helpers.ts   # decodeLambdaBody, lambdaResponse, LambdaResult
    │   ├── routes.ts           # classifyRoute (preflight | health | validate | ...)
    │   ├── validation.ts       # classifyRequest, MAX_BATCH_SIZE, BatchOptions
    │   └── web-helpers.ts      # parseQueryParams, jsonResponse, readJsonBody
    ├── adapters/
    │   ├── aws-lambda.ts       # API Gateway proxy + direct invocation + routed
    │   ├── azure.ts            # Azure Functions v4
    │   ├── cloudflare.ts       # Workers + Durable Object + KV result cache
    │   ├── gcp.ts              # GCP Cloud Functions 2nd gen
    │   ├── netlify.ts          # Netlify Functions
    │   └── vercel.ts           # Edge + Node + routed
    └── loaders/
        ├── fetch-loader.ts     # FetchResourceLoader (CDN / R2 / S3)
        └── kv-loader.ts        # KvResourceLoader (Workers KV-shape)
```

## Single resolver, multiple loaders

The lookup algorithm — walk the national-number prefix from longest to
shortest, fall back to the `en` locale when the requested locale is missing —
lives **only** in `src/core.ts`. Every runtime brings its own
`ResourceLoader` (`loadResource(path) -> Uint8Array | null`) and the resolver
is the same.

```
                         ┌──── NodeFsResourceLoader (sync + async)
   geocoder()            │
   carrier()      ──→ ResourceLoader.loadResource(path)
   timezones()           │     ╲
                         ├──── FetchResourceLoader (HTTP / CDN)
                         ├──── KvResourceLoader     (Cloudflare KV / R2)
                         └──── (your custom loader)
```

The cache (`src/cache.ts`) is keyed by loader path
(`geocodes/en/41.bson`, …) so the same key is portable across loaders. A
single process running both the Node entry and a serverless adapter shares
the cache.

## Sync + async API parity

Every public lookup exists in both forms:

| sync               | async                  |
| ------------------ | ---------------------- |
| `geocoder`         | `geocoderAsync`        |
| `carrier`          | `carrierAsync`         |
| `timezones`        | `timezonesAsync`       |
| —                  | `enrichPhoneNumber`    |

Sync needs `loader.loadResourceSync` — `NodeFsResourceLoader` provides it.
Async only needs `loader.loadResource` — every loader does. Edge runtimes
that lack synchronous storage (Workers KV, R2, S3) must use the async
variants.

## Serverless adapter pattern

Every adapter is a thin translator between transport conventions and the
shared validator. The hard work — request classification, batching limits,
result enrichment — lives in `src/serverless/_shared/`. Adapters do four
things:

1. **Normalize the path** (e.g. Netlify strips `/.netlify/functions/<name>`,
   Vercel + Azure strip `/api`).
2. **Classify the route** via `classifyRoute(path, method)` →
   `preflight | health | validate-single | validate-batch | method-not-allowed | not-found`.
3. **Dispatch to the shared validator** via `validateSingle` /
   `executeValidation` from `_shared/dispatch.ts`.
4. **Format the platform's native response** (Lambda result, Web `Response`,
   Express `res`, Azure `jsonBody`).

Adding a new endpoint (say `/cache/clear`) means adding one route variant in
`_shared/routes.ts` and one switch arm per adapter.

## Request flow (single phone number)

```
client → adapter.handler(event)
            │
            ├── normalize path                             [adapter]
            ├── classifyRoute(path, method)                [_shared/routes]
            │     ↓
            ├── classifyRequest(body)  / readJsonBody       [_shared/validation, web-helpers]
            │     ↓
            ├── validateSingle(input, options)              [_shared/dispatch]
            │     │
            │     ├── parsePhoneNumberFromString            [libphonenumber-js]
            │     ├── geocoderAsync   ──→ core.localizedAsync ──→ loader.loadResource
            │     ├── carrierAsync    ──→  …
            │     └── timezonesAsync  ──→  …
            │     ↓
            └── format response                              [adapter]
```

Batch requests `Promise.all` over the same `validateOne` per input. Bad
inputs return `{ valid: false, error }` rather than aborting the batch.

## Resource hosting

The BSON tables under `resources/` ship with the npm package (`files: ["dist", "resources"]`)
but are **gitignored** — they're regenerated from upstream Google
libphonenumber via `bun run preparemetadata`. The layout:

```
resources/
├── carrier/<locale>/<country-code>.bson
├── geocodes/<locale>/<country-code>.bson
└── timezones.bson
```

For serverless deployments where the package isn't unpacked into the runtime
(Cloudflare Workers, Vercel Edge), upload the same tree to KV / R2 / a CDN
and use `KvResourceLoader` or `FetchResourceLoader`. See
[scripts/deploy-resources.ts](./scripts/deploy-resources.ts) and
[SERVERLESS.md](./SERVERLESS.md) for the deployment recipes.

## CLI architecture

`phone-validate` is built from three small modules:

- `cli/parse-args.ts` — table-driven (`BOOLEAN_FLAGS`, `VALUE_FLAGS` maps);
  adding a flag is one map entry.
- `cli/format.ts` — picks `text` / `json` / `pretty` formatters from a
  dispatch table.
- `cli/run.ts` — `validateSingle` → render → optional log file →
  exit-code map. All side-effecting deps (`writeFile`, `mkdirSync`, `now`)
  injectable for testing.

The bin entry (`cli/index.ts`) imports `../index` for the side effect of
installing `NodeFsResourceLoader`, then runs `parseArgs` → `run`.

## Data flow summary

1. **Module load** → `src/index.ts` imports `setResourceLoader` and installs
   `NodeFsResourceLoader` (Node entry only — serverless entries require an
   explicit `setResourceLoader` call).
2. **First lookup** for a `country-code/locale` pair → loader fetches
   `<kind>/<locale>/<cc>.bson`, BSON is decoded, table cached.
3. **Subsequent lookups** for the same `country-code/locale` → cache hit;
   loader is not consulted.
4. **Resize / clear** → `setCacheSize(n)` migrates entries newest-first;
   `clearCache()` drops everything.

For deeper detail on each module's API, see the inline doc comments — the
`/**` blocks in each file are the source of truth for behavior. This file
only describes the *shape* of how the modules fit together.
