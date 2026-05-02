#!/usr/bin/env bun
/**
 * Upload the bundled `resources/` BSON tree to the storage backend a
 * serverless deployment will read from at runtime.
 *
 * Usage:
 *   bun run scripts/deploy-resources.ts cloudflare [--dry-run] [--concurrency=8]
 *   bun run scripts/deploy-resources.ts cdn        [--dry-run] [--concurrency=8]
 *   bun run scripts/deploy-resources.ts manifest   [output-file]
 *
 * Configure with environment variables (see each handler).
 */
import { promises as fsp, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RESOURCES_DIR = join(import.meta.dir, '..', 'resources');
const DEFAULT_CONCURRENCY = 8;

interface ResourceFile {
  /** Path relative to `resources/`, with forward slashes. */
  path: string;
  /** Absolute path on disk. */
  fullPath: string;
}

interface UploadOptions {
  dryRun: boolean;
  concurrency: number;
}

interface UploadResult {
  ok: boolean;
  message?: string;
}

async function listResourceFiles(dir = RESOURCES_DIR): Promise<ResourceFile[]> {
  const out: ResourceFile[] = [];
  const items = await fsp.readdir(dir);
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = await fsp.stat(fullPath);
    if (stat.isDirectory()) {
      out.push(...(await listResourceFiles(fullPath)));
    } else if (fullPath.endsWith('.bson')) {
      out.push({
        path: relative(RESOURCES_DIR, fullPath).split(/[\\/]/).join('/'),
        fullPath,
      });
    }
  }
  return out;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
  return value;
}

/**
 * Run `task` against each item in `items` with at most `concurrency`
 * in-flight at once. Preserves order and reports per-item success.
 */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<UploadResult>
): Promise<{ uploaded: number; failed: number }> {
  let cursor = 0;
  let uploaded = 0;
  let failed = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++;
      const item = items[idx];
      if (item === undefined) return;
      const result = await task(item);
      if (result.ok) {
        uploaded++;
      } else {
        failed++;
        if (result.message) console.error(result.message);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return { uploaded, failed };
}

async function deployToCloudflareKV(opts: UploadOptions): Promise<void> {
  const namespace = requireEnv('CF_KV_NAMESPACE');
  const apiToken = requireEnv('CF_API_TOKEN');
  const accountId = requireEnv('CF_ACCOUNT_ID');
  const prefix = process.env.CF_KV_PREFIX ?? 'phone-validator:';

  const files = await listResourceFiles();
  console.log(
    `Cloudflare KV (${namespace}): ${files.length} files${opts.dryRun ? ' [dry run]' : ''}, concurrency=${opts.concurrency}`
  );

  const summary = await runWithConcurrency(files, opts.concurrency, async (file) => {
    if (opts.dryRun) {
      console.log(`· ${file.path}  → ${prefix}${file.path}`);
      return { ok: true };
    }
    const key = `${prefix}${file.path}`;
    const data = await fsp.readFile(file.fullPath);
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespace}/values/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/octet-stream',
      },
      body: data,
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, message: `✗ ${file.path}: ${res.status} ${res.statusText}\n  ${text}` };
    }
    console.log(`✓ ${file.path}`);
    return { ok: true };
  });

  console.log(`\nCloudflare KV: ${summary.uploaded} uploaded, ${summary.failed} failed.`);
  if (summary.failed > 0) process.exit(1);
}

async function deployToCDN(opts: UploadOptions): Promise<void> {
  const endpoint = requireEnv('CDN_ENDPOINT').replace(/\/$/, '');
  const auth = requireEnv('CDN_AUTH');

  const files = await listResourceFiles();
  console.log(
    `CDN (${endpoint}): ${files.length} files${opts.dryRun ? ' [dry run]' : ''}, concurrency=${opts.concurrency}`
  );

  const summary = await runWithConcurrency(files, opts.concurrency, async (file) => {
    if (opts.dryRun) {
      console.log(`· ${file.path}  → ${endpoint}/${file.path}`);
      return { ok: true };
    }
    const data = await fsp.readFile(file.fullPath);
    const res = await fetch(`${endpoint}/${file.path}`, {
      method: 'PUT',
      headers: { Authorization: auth, 'Content-Type': 'application/octet-stream' },
      body: data,
    });
    if (!res.ok) {
      return { ok: false, message: `✗ ${file.path}: ${res.status} ${res.statusText}` };
    }
    console.log(`✓ ${file.path}`);
    return { ok: true };
  });

  console.log(`\nCDN: ${summary.uploaded} uploaded, ${summary.failed} failed.`);
  if (summary.failed > 0) process.exit(1);
}

async function generateManifest(outputFile = 'resources-manifest.json'): Promise<void> {
  const files = await listResourceFiles();
  const manifest = {
    version: new Date().toISOString(),
    files: files.map((f) => ({ path: f.path, size: statSync(f.fullPath).size })),
    totalFiles: files.length,
    totalSize: files.reduce((sum, f) => sum + statSync(f.fullPath).size, 0),
  };
  await fsp.writeFile(outputFile, JSON.stringify(manifest, null, 2));
  console.log(`Manifest written: ${outputFile}`);
  console.log(`  files: ${manifest.totalFiles}`);
  console.log(`  size:  ${(manifest.totalSize / 1024 / 1024).toFixed(2)} MB`);
}

function helpText(): string {
  return `phone-validator deploy-resources

Usage:
  bun run scripts/deploy-resources.ts cloudflare [--dry-run] [--concurrency=N]
  bun run scripts/deploy-resources.ts cdn        [--dry-run] [--concurrency=N]
  bun run scripts/deploy-resources.ts manifest   [output-file]

Flags:
  --dry-run         Print what would be uploaded without writing.
  --concurrency=N   In-flight upload limit (default: ${DEFAULT_CONCURRENCY}).

Environment variables:
  Cloudflare KV: CF_KV_NAMESPACE, CF_API_TOKEN, CF_ACCOUNT_ID, [CF_KV_PREFIX]
  Generic CDN:   CDN_ENDPOINT, CDN_AUTH
`;
}

interface ParsedArgs {
  command: string | undefined;
  positional: string[];
  flags: { dryRun: boolean; concurrency: number };
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags = { dryRun: false, concurrency: DEFAULT_CONCURRENCY };
  const positional: string[] = [];
  for (const token of argv) {
    if (token === '--dry-run') {
      flags.dryRun = true;
      continue;
    }
    if (token.startsWith('--concurrency=')) {
      const n = Number.parseInt(token.slice('--concurrency='.length), 10);
      if (Number.isFinite(n) && n > 0) flags.concurrency = n;
      continue;
    }
    positional.push(token);
  }
  const [command, ...rest] = positional;
  return { command, positional: rest, flags };
}

async function main(): Promise<void> {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));
  const uploadOpts: UploadOptions = { dryRun: flags.dryRun, concurrency: flags.concurrency };

  switch (command) {
    case 'cloudflare':
      await deployToCloudflareKV(uploadOpts);
      break;
    case 'cdn':
      await deployToCDN(uploadOpts);
      break;
    case 'manifest':
      await generateManifest(positional[0]);
      break;
    case undefined:
    case '--help':
    case '-h':
      console.log(helpText());
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error(helpText());
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('deploy-resources failed:', err);
  process.exit(1);
});
