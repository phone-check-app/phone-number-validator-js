# AGENTS.md

Operating rules for AI agents (Claude Code, Cursor, GitHub Copilot, etc.)
and human contributors working on this repo. **Code-style rules and
code-pattern conventions only.** Product specs, feature docs, the module
map, and test layout live in the markdown files linked at the bottom — keep
this file rule-shaped, not spec-shaped.

## Toolchain

- **Bun** is the canonical runtime / package manager / test runner. Never
  reach for `yarn`, `npm` install scripts, or `jest` / `ts-jest`.
- **Biome** handles lint + format. `biome.json` is the source of truth.
- **Rollup** builds the published CJS + ESM bundles via `rollup.config.cjs`
  and `rollup.config.serverless.cjs`.
- **TypeScript strict mode** for both `tsconfig.json` (src) and
  `tsconfig.test.json` (src + tests + examples + scripts).

## Code-style rules

### TypeScript

- **No `any`.** `unknown` + narrow as needed. The build enforces this —
  `src/` has zero `any`.
- **No non-null assertions (`!`)** in `src/`. If a field is "always
  populated", make it non-optional in the type. If you really need it, add
  a runtime guard plus a comment explaining why TS can't see it.
- Prefer **early returns** over nested conditionals. A function that opens
  with three `if`-checks should bail out of each rather than wrap the body
  in `else` blocks.
- Use **optional chaining** (`?.`) and **nullish coalescing** (`??`)
  instead of `&&` / `||` when the operand may be `null` / `undefined`.
  Especially never write `value || defaultValue` for
  `value: number | undefined` (`0` would collapse to the default).
- `interface` for public object shapes; `type` for unions / intersections /
  function types.
- Public exports flow through explicit named lists, not `export *`, except
  for re-exporting `libphonenumber-js` from the entry points.

### Architecture rules

- **Don't duplicate the resolver.** The prefix-walk lookup belongs in
  `src/core.ts`. New runtimes plug in a `ResourceLoader`, they don't
  reimplement the algorithm.
- **Adapters are translators, not validators.** Every serverless adapter
  delegates to `src/serverless/_shared/dispatch.ts` (and friends) for
  validation, batching, and enrichment. Don't reinvent CORS, route
  matching, or batch-size limits per adapter.
- **Lookup tables over `if`/`else if` chains** for dispatch on a
  string/value (see `BOOLEAN_FLAGS` / `VALUE_FLAGS` in
  `src/cli/parse-args.ts`, `FORMATTERS` in `src/cli/run.ts`).
- **Don't reach into the cache directly.** Use `clearCache` / `setCacheSize`
  / `getCacheStats`. The underlying LRU is an implementation detail.

### Comments

- **Comment the *why***, not the *what*. Names + types document the *what*.
- One-line comments above tricky regexes / heuristics with a reference link
  when applicable (Google libphonenumber doc, prior incident).
- `★ Insight ─────────` blocks belong in PR descriptions and review
  comments, not in source.

### Tests

- Use **`bun:test`** primitives (`describe`, `it`, `expect`, `mock`,
  `mock.module`). Don't reach for jest globals.
- One shared `__tests__/helpers/mock-loader.ts` provides the in-memory
  `ResourceLoader` used by every unit test. **Never roll a per-file mock**
  — drift between fixtures was the original bug that motivated the helper.
- New tests must include **edge cases + false-positive guards**, not just
  the happy path.
- For test layout, run commands, and BSON-key conventions, see
  [TESTING.md](./TESTING.md).

### Refactor discipline

- If you remove a publicly-exported symbol, **check the public API surface
  first** — `grep src/index.ts` and `src/serverless/index.ts` for
  re-exports. Internal underuse is not the same as dead code.
- Move out-of-scope modules to `extras/<name>/` rather than leaving them in
  `src/`.
- Commit messages follow conventional-commits: `<type>(<scope>): <imperative summary>`.
  `breaking` and `BREAKING CHANGE` trip the major-version bump in
  `semantic-release`.

## Workflow

1. **Branch off `develop`** with a `<type>/<topic>` name.
2. **`bun run typecheck && bun run test`** must be clean before pushing.
3. **`bun run build`** is the canonical build verification (also runs the
   CLI smoke-test in CI).
4. PRs target `develop`. Merging to `master` is handled by
   `semantic-release` on the release workflow.
5. Pre-commit hook runs Biome via `lint-staged`. If it fails, **fix the
   underlying issue** — don't `--no-verify`.

## Product / spec / how-to docs

These describe *what the library does* and *how the codebase fits
together*. Keep product details out of this file; this file only changes
when the rules / conventions / toolchain themselves change.

- [README.md](./README.md) — public API surface, quick start, examples
- [ARCHITECTURE.md](./ARCHITECTURE.md) — module map, data flow, adapter
  pattern, request lifecycle
- [TESTING.md](./TESTING.md) — test layout, run commands, BSON-key
  conventions, CI matrix
- [SERVERLESS.md](./SERVERLESS.md) — AWS Lambda / Vercel / Cloudflare /
  GCP / Netlify / Azure deployment recipes
- [examples/README.md](./examples/README.md) — runnable example index
- [CHANGELOG.md](./CHANGELOG.md) — release history (auto-managed by
  `semantic-release`)
- [LICENSE.md](./LICENSE.md) — license terms

When you add a new feature or change behavior, update the relevant doc
above — not this file.
