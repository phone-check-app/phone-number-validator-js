/**
 * Bun test preload — runs once per test process before any test files load.
 * Keep this minimal: most fixture wiring happens per-suite to keep cross-test
 * isolation tight.
 *
 * The repo's `bunfig.toml` references this via `test.preload`.
 */

// Force production mode silences the dev-only `console.error` in core.ts.
// Individual tests can still spy on console.error to verify error paths.
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
