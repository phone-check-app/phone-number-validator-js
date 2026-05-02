/**
 * `fetch`-backed resource loader for CDN / HTTP-hosted `.bson` tables.
 *
 * Use this when resources are deployed alongside the function (e.g. via
 * `assets` in Vercel, or a public R2 / S3 bucket fronted by a CDN). The
 * loader has no platform deps — `fetch` is global on all modern runtimes.
 */
import type { ResourceLoader } from '../../types';

export interface FetchResourceLoaderOptions {
  /**
   * Base URL where the `resources/` tree is hosted. Must include the trailing
   * `/` because relative paths (`geocodes/en/41.bson`) are appended verbatim.
   */
  baseUrl: string;

  /**
   * Extra headers to attach to each fetch (e.g. `Authorization` for a
   * private bucket). Defaults to no extra headers.
   */
  headers?: Record<string, string>;

  /**
   * Per-request timeout in milliseconds. The loader uses `AbortSignal.timeout`
   * which is supported on Node 17.3+ and every edge runtime. Defaults to
   * 5000 ms.
   */
  timeoutMs?: number;

  /**
   * Optional `fetch` override (tests inject `mock-fetch`; some runtimes prefer
   * a custom implementation). Defaults to `globalThis.fetch`.
   */
  fetch?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 5000;

export class FetchResourceLoader implements ResourceLoader {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: FetchResourceLoaderOptions) {
    this.baseUrl = options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`;
    this.headers = options.headers ?? {};
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) {
      throw new Error('FetchResourceLoader: globalThis.fetch is not available. Pass `options.fetch`.');
    }
  }

  async loadResource(path: string): Promise<Uint8Array | null> {
    // `URL` normalizes `..` segments, but our resource paths don't contain
    // them — passing through `URL` so we get sane handling of double-slashes.
    const url = new URL(path, this.baseUrl).toString();
    const signal = AbortSignal.timeout(this.timeoutMs);

    const res = await this.fetchImpl(url, { headers: this.headers, signal });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`FetchResourceLoader: ${res.status} ${res.statusText} for ${url}`);
    }
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }
}
