#!/usr/bin/env bun
/**
 * Pre-publish guard: refuse to publish a tarball without the BSON resource
 * tree. 2.0.0–2.1.0 shipped without `resources/` (it is gitignored and CI never
 * generated it), so every carrier / geocoder / timezone lookup returned null.
 *
 * Usage:
 *   bun run scripts/check-package.ts      # runs automatically in prepublishOnly
 */
import { spawnSync } from 'node:child_process';

const REQUIRED = [
  'resources/source.json',
  'resources/timezones.bson',
  'resources/carrier/en/44.bson',
  'resources/geocodes/en/1.bson',
  'dist/index.js',
  'dist/index.d.ts',
];

const pack = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8' });
if (pack.status !== 0) {
  console.error(`✗ npm pack --dry-run failed:\n${pack.stderr}`);
  process.exit(1);
}

interface PackManifest {
  files: Array<{ path: string }>;
  entryCount: number;
  unpackedSize: number;
}
// npm <= 11 prints an array of manifests; npm 12 prints an object keyed by package name.
const parsed = JSON.parse(pack.stdout) as PackManifest[] | Record<string, PackManifest>;
const [manifest] = Array.isArray(parsed) ? parsed : Object.values(parsed);
const packed = new Set(manifest.files.map((file) => file.path));
const missing = REQUIRED.filter((path) => !packed.has(path));

if (missing.length > 0) {
  console.error(`✗ Tarball is missing: ${missing.join(', ')}`);
  console.error('  Next step: run `bun run preparemetadata && bun run build`, then publish again.');
  process.exit(1);
}

console.log(
  `✓ Tarball OK: ${manifest.entryCount} files, ${(manifest.unpackedSize / 1024 / 1024).toFixed(1)} MB, resources + dist present.`
);
