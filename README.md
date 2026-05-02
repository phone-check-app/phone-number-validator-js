# Advanced Phone Number Validator

[![NPM version](https://badgen.net/npm/v/@phonecheck/phone-number-validator-js)](https://npm.im/@phonecheck/phone-number-validator-js)
[![Build Status](https://github.com/phone-check-app/phone-number-validator-js/workflows/CI/badge.svg)](https://github.com/phone-check-app/phone-number-validator-js/actions)
[![Downloads](https://img.shields.io/npm/dm/@phonecheck/phone-number-validator-js.svg)](https://www.npmjs.com/package/@phonecheck/phone-number-validator-js)
[![UNPKG](https://img.shields.io/badge/UNPKG-OK-179BD7.svg)](https://unpkg.com/browse/@phonecheck/phone-number-validator-js@latest/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

🚀 **Validate, parse, and enrich international phone numbers** — geocoding,
carrier lookup, timezone resolution, and number-type detection. Built on
[Google libphonenumber](https://github.com/google/libphonenumber)'s metadata,
distributed as compact BSON tables, served from sync (Node) and async (edge /
serverless) APIs, with first-class adapters for **AWS Lambda, Vercel,
Cloudflare Workers, GCP Cloud Functions, Netlify, and Azure Functions**.

## 📋 Table of Contents

- [Features](#features)
- [Use Cases](#use-cases)
- [API / Cloud Service](#api--cloud-hosted-service)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Command-line Tool (`phone-validate`)](#command-line-tool-phone-validate)
- [Cache Management](#cache-management)
- [Custom Resource Loaders](#custom-resource-loaders)
- [Serverless Usage](#serverless-usage)
- [Performance](#performance)
- [Testing](#testing)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [Documentation index](#documentation-index)

## Features

- ✅ **E.164 / national / international parsing** via libphonenumber-js (re-exported)
- ✅ **Geocoder** — city / region in 30+ locales with English fallback
- ✅ **Original carrier mapping** — Google's carrier-allocation tables
- ✅ **Timezone resolution** — IANA zone IDs from the E.164 number
- ✅ **Number-type detection** — mobile, fixed-line, VoIP, toll-free, premium…
- ✅ **Sync + async parity** — `geocoder` for Node, `geocoderAsync` for edge / KV
- ✅ **Pluggable resource loader** — `node:fs`, `fetch`, Cloudflare KV, or your own
- ✅ **High-performance LRU cache** for deserialized BSON tables
- ✅ **Six platform adapters** — AWS / Vercel / Cloudflare / GCP / Netlify / Azure
- ✅ **`phone-validate` CLI** — single-shot validation + JSON logging
- ✅ **Strict TypeScript** — zero `any` and zero non-null assertions in `src/`

## Use Cases

- Reduce SMS bounce rate by filtering invalid numbers before send
- Geo-route inbound calls or messages to the right region / carrier
- Detect VoIP / toll-free / premium-rate numbers in fraud screens
- Normalize numbers to E.164 for storage and analytics
- Protect signup / checkout forms from fake numbers and bots
- Embed validation in mobile, web, and back-office workflows

## API / Cloud Hosted Service

We offer this — and more advanced features — as a scalable cloud API:
[**Phone Number Verification**](https://phone-check.app/products/phone).

---

## Installation

```bash
bun add @phonecheck/phone-number-validator-js
# or
npm install @phonecheck/phone-number-validator-js
# or
pnpm add @phonecheck/phone-number-validator-js
```

### Requirements (consumers)
- Node.js >= 22 (Maintenance LTS) — the published bundle is plain Node.js + ESM/CJS
- TypeScript >= 4.0 (for TypeScript users)

### Requirements (contributing)
- Bun >= 1.3 (test runner, package manager, dev tooling)
- Node.js >= 24 only needed for `semantic-release` during the publish step

### Build System
- Rollup builds CJS + ESM bundles for the main package and per-platform serverless adapters
- `bun test` for the unit + isolated suites (no jest, no ts-jest)
- BSON resource tables (geocodes, carrier mappings, timezones) ship under
  `resources/` next to the published `dist/`

## Quick Start

```typescript
import {
  carrier,
  geocoder,
  parsePhoneNumberFromString,
  timezones,
} from '@phonecheck/phone-number-validator-js';

const phone = parsePhoneNumberFromString('+41431234567');

geocoder(phone);            // → "Zurich"
geocoder(phone, 'de');      // → "Zürich"
carrier(parsePhoneNumberFromString('01701234567', 'DE'));
                            // → "T-Mobile"
timezones(parsePhoneNumberFromString('+12124567890'));
                            // → ["America/New_York"]
```

For a one-shot enrichment call:

```typescript
import { enrichPhoneNumber, parsePhoneNumberFromString }
  from '@phonecheck/phone-number-validator-js';

const phone = parsePhoneNumberFromString('+8619912345678');
await enrichPhoneNumber(phone, { carrierLocale: 'zh' });
// {
//   geocode:   "Hubei",
//   carrier:   "中国电信",
//   timezones: ["Asia/Shanghai", ...]
// }
```

## API Reference

### Core Functions

#### `geocoder(phone, locale = 'en'): string | null`

Resolve a city / region for the given parsed phone number. Returns `null` for
landline-only ranges, unknown country codes, or invalid input. Falls back to
English when the locale-specific table is missing.

#### `carrier(phone, locale = 'en'): string | null`

Resolve the **original** carrier from Google's carrier-allocation tables.
Note this does **not** reflect ports — see [the upstream FAQ][lpn-carrier].
Returns `null` for landlines and unmapped ranges.

[lpn-carrier]: https://github.com/google/libphonenumber#mapping-phone-numbers-to-original-carriers

#### `timezones(phone): string[] | null`

Resolve one or more IANA timezone IDs for the given E.164 number.

#### Async variants

Same signatures, returning a `Promise`:

- `geocoderAsync(phone, locale?)`
- `carrierAsync(phone, locale?)`
- `timezonesAsync(phone)`
- `enrichPhoneNumber(phone, options?)` — runs all three in parallel

The async variants only require `loader.loadResource`. The sync ones require
`loader.loadResourceSync`. The bundled `NodeFsResourceLoader` provides both.

### Cache

```typescript
import {
  clearCache,
  DEFAULT_CACHE_SIZE,   // 100
  getCacheSize,
  getCacheStats,         // { size, maxSize }
  setCacheSize,
} from '@phonecheck/phone-number-validator-js';
```

The cache stores deserialized BSON tables (one per `country-code/locale`
pair). Resize for memory-tight environments, clear it for tests / long-running
workers.

### Resource loaders

```typescript
import { NodeFsResourceLoader, setResourceLoader }
  from '@phonecheck/phone-number-validator-js';

setResourceLoader(new NodeFsResourceLoader({ resourcesDir: '/custom/path' }));
```

The Node entry installs a default loader pointing at the bundled `resources/`.
Swap it for serverless / edge — see [Custom Resource Loaders](#custom-resource-loaders).

### Re-exports

Everything from `libphonenumber-js` is re-exported under the same name —
`parsePhoneNumberFromString`, `parsePhoneNumberWithError`, `PhoneNumber`,
`CountryCode`, formatters, etc. One import covers parsing + enrichment.

### Locale types

`GeocoderLocale` and `CarrierLocale` are union types listing the supported
locales (auto-generated by `scripts/prepare-metadata.ts`). Use them for
exhaustive switches:

```typescript
import type { GeocoderLocale } from '@phonecheck/phone-number-validator-js';
```

## Examples

### Detecting number type

```typescript
import { parsePhoneNumberFromString } from '@phonecheck/phone-number-validator-js';

const phone = parsePhoneNumberFromString('+14155552671');
phone?.getType();   // 'FIXED_LINE_OR_MOBILE'
```

### Validating + formatting in one pass

```typescript
import { parsePhoneNumberFromString } from '@phonecheck/phone-number-validator-js';

function normalize(input: string): string | null {
  const phone = parsePhoneNumberFromString(input, 'US');
  if (!phone?.isValid()) return null;
  return phone.format('E.164');
}

normalize('(415) 555-2671');   // '+14155552671'
normalize('not a number');     // null
```

### Iterating with locale fallback

```typescript
import { geocoder, parsePhoneNumberFromString }
  from '@phonecheck/phone-number-validator-js';

const numbers = ['+41431234567', '+8619912345678', '+12124567890'];
for (const n of numbers) {
  console.log(n, '→', geocoder(parsePhoneNumberFromString(n), 'de'));
}
// +41431234567   → Zürich            (de table)
// +8619912345678 → Hubei             (en fallback — no de carrier table for 86)
// +12124567890   → New York          (en fallback)
```

## Command-line Tool (`phone-validate`)

Installing the package globally exposes a `phone-validate` binary:

```bash
$ bun add -g @phonecheck/phone-number-validator-js
$ phone-validate +14155552671
```

```text
✓ VALID    +14155552671

Summary
  country:      US (+1)
  type:         FIXED_LINE_OR_MOBILE

Formatted
  E.164:        +14155552671
  national:     (415) 555-2671
  international: +1 415 555 2671
  RFC3966:      tel:+14155552671

Enrichment
  geocode:      San Francisco
  timezones:    America/Los_Angeles
```

Output formats:

```bash
phone-validate +14155552671 --format json --quiet --no-log-file | jq
phone-validate "(415) 555-2671" --country US --format text
```

Exit codes: `0` valid, `1` invalid / unparseable, `2` bad CLI args.

Run `phone-validate --help` for the full flag list.

## Cache Management

```typescript
import {
  clearCache,
  getCacheStats,
  setCacheSize,
} from '@phonecheck/phone-number-validator-js';

setCacheSize(500);    // default 100
getCacheStats();      // { size: 17, maxSize: 500 }
clearCache();         // drop all entries
```

The cache is keyed by the loader path (`geocodes/en/41.bson`, …) so a single
process shares hits across the Node entry and any serverless adapter that
also runs in it.

## Custom Resource Loaders

Implement `ResourceLoader` to host the BSON tables anywhere — KV, R2, S3, a
public CDN, an in-memory map. The loader is the only thing that changes
between runtimes; the resolver is the same.

```typescript
import {
  setResourceLoader,
  type ResourceLoader,
} from '@phonecheck/phone-number-validator-js/serverless';

class S3Loader implements ResourceLoader {
  async loadResource(path: string): Promise<Uint8Array | null> {
    const res = await fetch(`https://my-bucket.s3.amazonaws.com/phone/${path}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`S3 ${res.status} for ${path}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}

setResourceLoader(new S3Loader());
```

Two implementations ship in the package:

| Loader | Backed by | Sync? | Use when |
|-|-|-|-|
| `NodeFsResourceLoader` | `node:fs` | ✓ | Running on Node.js with the bundled `resources/` |
| `FetchResourceLoader`  | `fetch`  | ✗ | Tables hosted on a CDN / R2 / S3 with public reads |
| `KvResourceLoader`     | Workers KV-shape | ✗ | Cloudflare KV or any KV-shaped store |

## Serverless Usage

For deployment recipes — wrangler.toml, Vercel routes, lambda zips, GCP
function entries, Netlify redirects, Azure host.json — see
**[SERVERLESS.md](./SERVERLESS.md)**.

A minimal Cloudflare Worker:

```typescript
// src/worker.ts
import worker from '@phonecheck/phone-number-validator-js/serverless/cloudflare';

// Bind PHONE_RESOURCES (KV) in wrangler.toml. The adapter auto-installs a
// loader from it.
export default worker;
```

```toml
# wrangler.toml
[[kv_namespaces]]
binding = "PHONE_RESOURCES"
id      = "..."
```

```bash
$ curl -X POST https://my.workers.dev/ \
       -H 'content-type: application/json' \
       -d '{ "phoneNumber": "+14155552671" }'
{ "success": true, "data": { "valid": true, ... } }
```

## Performance

- BSON tables are loaded **once per `country-code/locale`** and cached as
  decoded `Document`s.
- Default cache size is 100 entries — enough for the top ~50 country codes in
  English and a fallback locale at the same time.
- Per-lookup cost after warm-up is a single object access + a `while` loop
  over the prefix (~2-4 iterations on average).
- The pure verifier bundle is **~80 KB minified** (libphonenumber-js
  dominates); Workers-only deployments can shrink further by importing
  `/serverless/verifier` directly instead of `/serverless`.

## Testing

```bash
bun install
bun run typecheck
bun run lint
bun run test            # unit + isolated, no network, no real fs
bun run test:integration  # opt-in: requires bundled resources/
```

The unit suite uses an in-memory `MockResourceLoader` so it's fast (under a
second) and deterministic. The isolated suite exercises the bundled
`NodeFsResourceLoader` against the real `resources/` directory.

For the full test layout, run commands, BSON-key conventions, and CI matrix,
see [TESTING.md](./TESTING.md).

## Architecture

For the module map, request lifecycle, adapter pattern, and how the
sync/async API parity works, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Contributing

- Read [AGENTS.md](./AGENTS.md) — code style, branching, commit conventions
- Branch off `develop`; PRs target `develop`
- `bun run typecheck && bun run test && bun run build` must be clean
- Conventional Commits drive the release: `feat:`, `fix:`, `perf:` are
  releasable; `chore:`, `docs:`, `test:` are not
- Pre-commit hook runs Biome via `lint-staged`; please don't `--no-verify`

## Documentation index

| Doc | What's in it |
| - | - |
| [README.md](./README.md) | Public API, quick start, CLI, examples |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Module map, data flow, adapter pattern |
| [SERVERLESS.md](./SERVERLESS.md) | AWS / Vercel / Cloudflare / GCP / Netlify / Azure deployment |
| [TESTING.md](./TESTING.md) | Test layout, run commands, BSON-key conventions |
| [AGENTS.md](./AGENTS.md) | Code-style rules, code-pattern conventions |
| [examples/README.md](./examples/README.md) | Runnable example index |
| [CHANGELOG.md](./CHANGELOG.md) | Release history (auto-managed) |
| [LICENSE.md](./LICENSE.md) | License terms |

## License

See [LICENSE.md](./LICENSE.md).
