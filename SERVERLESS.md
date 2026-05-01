# Serverless usage

This document covers running `@phonecheck/phone-number-validator-js` in
serverless / edge environments. The library ships with platform adapters for
**AWS Lambda, Vercel, Cloudflare Workers, Google Cloud Functions, Netlify
Functions, and Azure Functions**, plus a pure verifier you can wire into any
runtime.

## Table of contents

- [What's included vs excluded](#whats-included-vs-excluded)
- [Package entry points](#package-entry-points)
- [Core API](#core-api)
- [Resource loaders](#resource-loaders)
- [Hosting the BSON tables](#hosting-the-bson-tables)
- [Platform adapters](#platform-adapters)
  - [AWS Lambda](#aws-lambda)
  - [Vercel](#vercel)
  - [Cloudflare Workers](#cloudflare-workers)
  - [GCP Cloud Functions](#gcp-cloud-functions-2nd-gen)
  - [Netlify Functions](#netlify-functions)
  - [Azure Functions](#azure-functions-v4)
- [Bundle size](#bundle-size)
- [Limitations](#limitations)

## What's included vs excluded

The serverless entry imports nothing from `node:fs`, so it's safe to bundle
into Workers, Edge Functions, or Deno Deploy. It includes:

- **Resolver**: the prefix-walk lookup against deserialized BSON tables
- **Locale fallback**: requested locale → `en`
- **Cache**: shared LRU keyed by loader path
- **Built-in loaders**: `FetchResourceLoader`, `KvResourceLoader`
- **Per-platform adapters**: HTTP routing, CORS, JSON shape

It does **not** include:

- The Node `fs`-based loader (`NodeFsResourceLoader`) — Node-only entry
- Any side-effecting `setResourceLoader` call — you wire one up explicitly
- A bundled copy of `resources/*.bson` — you upload these to KV / S3 / a CDN

## Package entry points

```typescript
// Node.js — fs-based, default loader installed on import
import { ... } from '@phonecheck/phone-number-validator-js';

// Pure serverless barrel — every adapter + the verifier
import { ... } from '@phonecheck/phone-number-validator-js/serverless';

// Just the verifier (smallest bundle)
import { ... } from '@phonecheck/phone-number-validator-js/serverless/verifier';

// Per-platform adapters (smallest per-handler bundle)
import worker  from '@phonecheck/phone-number-validator-js/serverless/cloudflare';
import lambda  from '@phonecheck/phone-number-validator-js/serverless/aws';
import vercel  from '@phonecheck/phone-number-validator-js/serverless/vercel';
import gcp     from '@phonecheck/phone-number-validator-js/serverless/gcp';
import netlify from '@phonecheck/phone-number-validator-js/serverless/netlify';
import azure   from '@phonecheck/phone-number-validator-js/serverless/azure';
```

Each adapter subpath has its own ESM + CJS build and TypeScript types.

## Core API

The serverless entry exposes the same shapes as the Node entry, minus the
sync resolvers when no `loadResourceSync` is available. The public surface:

### Resolution

```typescript
import {
  carrier,        // sync — needs loader.loadResourceSync
  carrierAsync,
  enrichPhoneNumber,
  geocoder,       // sync — needs loader.loadResourceSync
  geocoderAsync,
  setResourceLoader,
  timezones,      // sync — needs loader.loadResourceSync
  timezonesAsync,
} from '@phonecheck/phone-number-validator-js/serverless';
```

### High-level dispatch

```typescript
import {
  classifyRequest,
  executeValidation,
  validateBatch,
  validateSingle,
  type PhoneValidationResult,
} from '@phonecheck/phone-number-validator-js/serverless';

const result = await validateSingle('+14155552671', {
  defaultCountry: 'US',
  locale: 'en',
  carrierLocale: 'en',
});
// {
//   input: '+14155552671',
//   valid: true,
//   formatted: { e164, international, national, rfc3966 },
//   country: 'US',
//   countryCallingCode: '1',
//   nationalNumber: '4155552671',
//   type: 'FIXED_LINE_OR_MOBILE',
//   geocode: 'San Francisco',
//   carrier: null,           // landline-or-mobile, no carrier table hit
//   timezones: ['America/Los_Angeles'],
// }
```

`PhoneValidationResult` is the shape every adapter returns — it's also a
useful return type for your own handlers.

### Batch

`validateBatch` is `Promise.all` over `validateSingle`. Bad inputs yield a
`{ valid: false, error }` entry rather than aborting the batch.

```typescript
const results = await validateBatch(
  ['+14155552671', 'garbage', '+442079460958'],
  { locale: 'en' }
);
```

The serverless adapters cap batches at 100 entries (`MAX_BATCH_SIZE`).

## Resource loaders

The verifier doesn't read any files itself — you wire a `ResourceLoader`:

```typescript
interface ResourceLoader {
  loadResource(path: string): Promise<Uint8Array | null>;
  loadResourceSync?(path: string): Uint8Array | null;
}
```

Built-in loaders:

### `FetchResourceLoader`

For tables hosted on a CDN, R2, or any HTTP endpoint:

```typescript
import {
  FetchResourceLoader,
  setResourceLoader,
} from '@phonecheck/phone-number-validator-js/serverless';

setResourceLoader(
  new FetchResourceLoader({
    baseUrl: 'https://cdn.example.com/phone-resources/',
    timeoutMs: 5000,
    headers: { Authorization: `Bearer ${process.env.CDN_TOKEN}` },
  })
);
```

`fetch` is global on Node 18+, every edge runtime, and Bun. Pass
`options.fetch` to inject a custom implementation (tests, custom auth).

### `KvResourceLoader`

For Cloudflare KV (or any namespace exposing `.get(key, 'arrayBuffer')`):

```typescript
import {
  KvResourceLoader,
  setResourceLoader,
} from '@phonecheck/phone-number-validator-js/serverless';

setResourceLoader(
  new KvResourceLoader({
    namespace: env.PHONE_RESOURCES,
    prefix: 'phone-validator:', // optional
  })
);
```

The Cloudflare adapter does this automatically when `env.PHONE_RESOURCES` is
bound — you don't need to call `setResourceLoader` yourself.

### Custom

Implement the interface for in-memory, S3, DynamoDB DAX, Redis, etc:

```typescript
class InMemoryLoader implements ResourceLoader {
  constructor(private readonly tables: Map<string, Uint8Array>) {}
  async loadResource(path: string) { return this.tables.get(path) ?? null; }
  loadResourceSync(path: string)   { return this.tables.get(path) ?? null; }
}
```

## Hosting the BSON tables

The `resources/` directory ships with the package:

```
resources/
├── carrier/<locale>/<country-code>.bson
├── geocodes/<locale>/<country-code>.bson
└── timezones.bson
```

For `FetchResourceLoader`, upload the tree as-is to your CDN / bucket and
point `baseUrl` at it. For `KvResourceLoader`, upload each file as a KV
value with the path as the key (prefixed by `prefix`).

A starter upload script lives in [`scripts/`](./scripts/) — adapt the
`baseUrl` / KV namespace to your account and run with `bun run`.

## Platform adapters

Every adapter accepts the same JSON shape:

```jsonc
// Single
{ "phoneNumber": "+14155552671", "defaultCountry": "US", "locale": "en", "carrierLocale": "en" }

// Batch
{ "phoneNumbers": ["+14155552671", "+442079460958"], "locale": "de" }
```

Routed handlers expose:
- `GET  /health` (or `/api/health` on Vercel + Azure)
- `POST /validate` — single number
- `POST /validate/batch` — array of numbers

### AWS Lambda

```typescript
import lambda from '@phonecheck/phone-number-validator-js/serverless/aws';
import {
  FetchResourceLoader,
  setResourceLoader,
} from '@phonecheck/phone-number-validator-js/serverless';

setResourceLoader(
  new FetchResourceLoader({ baseUrl: process.env.PHONE_RESOURCES_URL ?? '' })
);

// Routed handler — `/health`, `/validate`, `/validate/batch`
export const handler = lambda.handler;

// Or the classic shape (no path routing)
export const apiGateway = lambda.apiGatewayHandler;

// Or direct invocation (no API Gateway envelope)
export const direct = lambda.lambdaHandler;
```

### Vercel

```typescript
// app/api/[[...path]]/route.ts (App Router, Edge)
import { handler } from '@phonecheck/phone-number-validator-js/serverless/vercel';

export const runtime = 'edge';
export const POST = handler;
export const GET  = handler;
export const OPTIONS = handler;
```

```typescript
// pages/api/validate.ts (Pages Router, Node)
import { nodeHandler } from '@phonecheck/phone-number-validator-js/serverless/vercel';
export default nodeHandler;
```

### Cloudflare Workers

```typescript
// src/worker.ts
import worker from '@phonecheck/phone-number-validator-js/serverless/cloudflare';
export default worker;
```

```toml
# wrangler.toml
name         = "phone-validator"
compatibility_date = "2024-09-01"

[[kv_namespaces]]
binding = "PHONE_RESOURCES"          # required — holds the BSON tree
id      = "<KV-namespace-id>"

[[kv_namespaces]]
binding = "RESULT_CACHE"             # optional — caches per-number results
id      = "<KV-namespace-id>"
```

Upload the resources tree to the KV namespace once:

```bash
# Pseudocode — adapt to your account / namespace
for f in $(find resources -type f -name '*.bson'); do
  key="${f#./}"           # e.g. resources/geocodes/en/41.bson
  wrangler kv:key put --binding=PHONE_RESOURCES "phone-validator:${key#resources/}" --path="$f"
done
```

#### Durable Object

The adapter exports `PhoneValidatorDO` for sticky in-memory caching:

```typescript
import { PhoneValidatorDO } from '@phonecheck/phone-number-validator-js/serverless/cloudflare';
export { PhoneValidatorDO };
```

```toml
[[durable_objects.bindings]]
name = "PHONE_VALIDATOR"
class_name = "PhoneValidatorDO"

[[migrations]]
tag = "v1"
new_classes = ["PhoneValidatorDO"]
```

### GCP Cloud Functions (2nd gen)

```typescript
// index.ts
import { gcpHandler } from '@phonecheck/phone-number-validator-js/serverless/gcp';
import {
  FetchResourceLoader,
  setResourceLoader,
} from '@phonecheck/phone-number-validator-js/serverless';

setResourceLoader(new FetchResourceLoader({
  baseUrl: process.env.PHONE_RESOURCES_URL ?? '',
}));

export const validatePhone = gcpHandler;
```

```bash
gcloud functions deploy validatePhone \
  --gen2 --runtime nodejs20 --trigger-http --allow-unauthenticated \
  --set-env-vars=PHONE_RESOURCES_URL=https://cdn.example.com/phone-resources/
```

### Netlify Functions

```typescript
// netlify/functions/phone.ts
import { netlifyHandler } from '@phonecheck/phone-number-validator-js/serverless/netlify';
import {
  FetchResourceLoader,
  setResourceLoader,
} from '@phonecheck/phone-number-validator-js/serverless';

setResourceLoader(new FetchResourceLoader({
  baseUrl: process.env.PHONE_RESOURCES_URL ?? '',
}));

export const handler = netlifyHandler;
```

```toml
# netlify.toml — clean URLs (the adapter strips the prefix automatically)
[[redirects]]
from = "/api/*"
to   = "/.netlify/functions/phone/:splat"
status = 200
```

### Azure Functions (v4)

```typescript
// src/functions/phone.ts
import { app } from '@azure/functions';
import { azureHandler } from '@phonecheck/phone-number-validator-js/serverless/azure';
import {
  FetchResourceLoader,
  setResourceLoader,
} from '@phonecheck/phone-number-validator-js/serverless';

setResourceLoader(new FetchResourceLoader({
  baseUrl: process.env.PHONE_RESOURCES_URL ?? '',
}));

app.http('phone', {
  methods: ['GET', 'POST', 'OPTIONS'],
  route: 'api/{*path}',
  authLevel: 'anonymous',
  handler: azureHandler,
});
```

## Bundle size

Approximate sizes of the published serverless bundles (minified, with all deps
inlined where appropriate):

| Bundle | Size |
| - | - |
| `serverless/verifier` (no adapter) | ~80 KB |
| `serverless/aws` | ~85 KB |
| `serverless/vercel` | ~85 KB |
| `serverless/cloudflare` | ~90 KB (includes KV loader) |
| `serverless/gcp` | ~85 KB |
| `serverless/netlify` | ~85 KB |
| `serverless/azure` | ~85 KB |

`libphonenumber-js` dominates (>70 KB on its own). The BSON tables are not
counted — they're loaded on demand from your loader.

## Limitations

- **Sync API requires `loader.loadResourceSync`.** Edge runtimes that only
  expose async storage (KV, R2, S3) must use `geocoderAsync` / `carrierAsync`
  / `timezonesAsync` / `enrichPhoneNumber`.
- **Cache is per-instance.** Workers KV / Lambda containers share results
  across invocations only when the runtime keeps the instance warm. For
  cross-instance caching, plug in `RESULT_CACHE` (Cloudflare) or a similar
  KV-shaped binding for your platform.
- **No network resolution of carrier ports.** The carrier mapping is the
  *original* allocation — see the upstream
  [libphonenumber FAQ](https://github.com/google/libphonenumber#mapping-phone-numbers-to-original-carriers).
