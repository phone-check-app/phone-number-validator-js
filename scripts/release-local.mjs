#!/usr/bin/env bun
/**
 * Local release helper: stamp version → build → `npm publish`. For when you
 * want to ship from a developer machine (one-off, hotfix, prerelease not yet
 * wired into release.yml) without going through CI.
 *
 * Usage:
 *   bun run release:local <version> [--dry-run] [--tag <dist-tag>]
 *
 * Examples:
 *   bun run release:local 2.1.0 --dry-run
 *   bun run release:local 2.1.0
 *   bun run release:local 2.2.0-beta.1                # auto dist-tag=beta
 *   bun run release:local 2.2.0-rc.1 --tag next       # explicit override
 *
 * Prerequisites (one-time):
 *   1. `npm whoami`  — must show your npm user with publish rights on
 *                      @phonecheck/phone-number-validator-js.
 *   2. `npm login`   — if (1) failed.
 *
 * Provenance:
 *   `publishConfig.provenance: true` in package.json wires CI publishes to
 *   sigstore via GitHub Actions OIDC. OIDC isn't available locally, so we
 *   pass `--provenance=false` to override — local publishes ship without
 *   attestation. CI keeps full provenance.
 *
 * Dry-run safety:
 *   `--dry-run` still stamps + builds + invokes `npm publish --dry-run`, but
 *   restores package.json afterwards so the working tree is clean. A real
 *   release leaves the bump in place for you to commit + tag.
 */
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const args = process.argv.slice(2);
const tagIdx = args.indexOf("--tag");
const tagValueIdx = tagIdx >= 0 ? tagIdx + 1 : -1;
const explicitTag = tagIdx >= 0 ? args[tagValueIdx] : null;
const dryRun = args.includes("--dry-run");
// First positional non-flag arg that isn't the value following --tag.
const version = args.find((a, i) => !a.startsWith("--") && i !== tagValueIdx);

if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error("usage: bun run release:local <semver> [--dry-run] [--tag <dist-tag>]");
  console.error(`got: ${args.join(" ")}`);
  process.exit(1);
}

// Prereleases (1.2.3-foo.4) MUST publish under a non-`latest` dist-tag,
// otherwise `npm install <pkg>` would pull an unstable build. Derive the tag
// from the prerelease identifier when one isn't passed explicitly.
const prereleaseId = version.includes("-") ? version.split("-")[1].split(".")[0] : null;
const distTag = explicitTag ?? prereleaseId;

function run(cmd, runArgs, opts = {}) {
  console.log(`\n→ ${cmd} ${runArgs.join(" ")}`);
  const result = spawnSync(cmd, runArgs, { stdio: "inherit", cwd: opts.cwd ?? ROOT });
  return result.status ?? 1;
}

class StepFailed extends Error {
  constructor(cmd, runArgs, status) {
    super(`${cmd} ${runArgs.join(" ")} exited with ${status}`);
    this.status = status;
  }
}

function runOrThrow(cmd, runArgs, opts) {
  const status = run(cmd, runArgs, opts);
  if (status !== 0) throw new StepFailed(cmd, runArgs, status);
}

// Sanity-check npm auth before doing real work.
if (!dryRun) {
  const who = spawnSync("npm", ["whoami"], { stdio: "pipe" });
  if (who.status !== 0) {
    console.error("✗ `npm whoami` failed — run `npm login` first.");
    process.exit(1);
  }
  console.log(`✓ npm user: ${who.stdout.toString().trim()}`);
}

console.log(`\n=== Local release: v${version}${dryRun ? " (dry run)" : ""}${distTag ? ` [tag=${distTag}]` : ""} ===`);

// 1. Stamp version into package.json. `prepublishOnly` rebuilds with it.
const pkgPath = resolve(ROOT, "package.json");
const originalPkgContents = await readFile(pkgPath, "utf8");
const pkg = JSON.parse(originalPkgContents);
const prevVersion = pkg.version;
pkg.version = version;
await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`✓ stamped version ${version} (was ${prevVersion}) into package.json`);

async function restorePackageJson() {
  await writeFile(pkgPath, originalPkgContents);
  console.log(`✓ restored package.json to ${prevVersion}`);
}

let failure = null;
try {
  // 2. Build explicitly. `prepublishOnly` runs again on publish — cheap
  //    insurance against shipping a stale dist if someone disables it later.
  runOrThrow("bun", ["run", "build"]);

  // 3. Publish. `--provenance=false` overrides publishConfig.provenance so
  //    the local publish doesn't fail asking for an OIDC token it can't get.
  const publishArgs = ["publish", "--access", "public", "--provenance=false"];
  if (dryRun) publishArgs.push("--dry-run");
  if (distTag) publishArgs.push("--tag", distTag);
  runOrThrow("npm", publishArgs);
} catch (err) {
  failure = err;
} finally {
  // Dry-run never persists the bump; a failed real release also rolls back
  // so the user isn't left with a stamped package.json they didn't ship.
  if (dryRun || failure) await restorePackageJson();
}

if (failure) {
  console.error(`\n✗ ${failure.message}`);
  process.exit(failure.status ?? 1);
}

if (dryRun) {
  console.log(`\n✓ Dry-run complete. Re-run without --dry-run to publish.`);
} else {
  console.log(`\n✓ Released v${version} to npm.`);
  console.log(`  Don't forget to:`);
  console.log(`    git add package.json && git commit -m "chore(release): v${version}"`);
  console.log(`    git tag v${version} && git push --follow-tags`);
}
