# Examples

Runnable examples for `@phonecheck/phone-number-validator-js`. Every script
runs under Bun (no compile step required) and can be adapted to Node.js by
running `bun run build` first and importing from the built `dist/`.

## Running

```bash
bun install
bun run examples/basic.ts
bun run examples/enrich.ts
```

Set `NODE_ENV=production` to silence the dev-mode error logging in
`src/core.ts` (the resolver returns `null` either way; the env var only
affects the `console.error` line).

## Index

| File | Description |
| - | - |
| `basic.ts` | Parse + geocode + carrier + timezones for a few sample numbers |
| `enrich.ts` | One-shot `enrichPhoneNumber` against a batch of inputs |
| `cli-usage.md` | `phone-validate` command-line walkthrough |
| `serverless/` | Per-platform serverless deployments |

## Serverless examples

See **[../SERVERLESS.md](../SERVERLESS.md)** for full deployment instructions.
The `serverless/` folder contains minimal entry points you can copy into a
real project.
