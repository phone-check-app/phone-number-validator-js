/**
 * Node.js synchronous resource loader. Reads BSON tables from the bundled
 * `resources/` directory using `node:fs`. Resolves paths relative to the
 * package install location, so consumers don't need to configure anything.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ResourceLoader } from './types';

/**
 * Locate the bundled `resources/` directory relative to the compiled output.
 *
 * The published package layout is:
 *   dist/index.js           ← from src/index.ts
 *   dist/cli/index.js       ← from src/cli/index.ts (one extra level deep)
 *   resources/...           ← peer of `dist/`
 *
 * We walk parent directories from the compiled file's location looking for a
 * `resources/timezones.bson` peer. That covers both the main bundle and the
 * CLI bundle without hardcoding the level count.
 */
function defaultResourcesDir(): string {
  // CJS: __dirname is set. ESM: derive from import.meta.url. We support both
  // because the published bundle ships both formats.
  let here: string;
  try {
    here = __dirname;
  } catch {
    here = dirname(fileURLToPath(import.meta.url));
  }

  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, 'resources');
    if (existsSync(resolve(candidate, 'timezones.bson'))) {
      return candidate;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback to the immediate parent if the marker file isn't found — keeps
  // the loader from throwing at import time. Lookups will return null until
  // the caller installs a custom loader.
  return resolve(here, '..', 'resources');
}

export interface NodeFsResourceLoaderOptions {
  /**
   * Override the directory where `geocodes/`, `carrier/`, and
   * `timezones.bson` live. Defaults to the bundled `resources/` next to the
   * built `dist/` directory.
   */
  resourcesDir?: string;
}

/**
 * Sync + async loader backed by `node:fs`. Async methods exist for parity
 * with custom loaders and just wrap the sync read.
 */
export class NodeFsResourceLoader implements ResourceLoader {
  private readonly baseDir: string;

  constructor(options: NodeFsResourceLoaderOptions = {}) {
    this.baseDir = options.resourcesDir ?? defaultResourcesDir();
  }

  async loadResource(path: string): Promise<Uint8Array | null> {
    return this.loadResourceSync(path);
  }

  loadResourceSync(path: string): Uint8Array | null {
    const fullPath = join(this.baseDir, path);
    if (!existsSync(fullPath)) return null;
    return readFileSync(fullPath);
  }
}
