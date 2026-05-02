/**
 * Generic KV-shaped loader. The interface (`get(key, type) -> ArrayBuffer`)
 * matches Cloudflare Workers KV exactly and is close enough to fit Vercel
 * Edge Config / Upstash Redis / DynamoDB DAX after a tiny shim.
 *
 * Resources are stored under a configurable prefix so multiple datasets can
 * share the same namespace without collisions.
 */
import type { ResourceLoader } from '../../types';

/** Minimal KV surface — Workers KV implements this natively. */
export interface KvNamespace {
  get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
}

export interface KvResourceLoaderOptions {
  namespace: KvNamespace;
  /**
   * Prepended to every key (e.g. `phone-validator:geocodes/en/41.bson`).
   * Defaults to `phone-validator:`.
   */
  prefix?: string;
}

export class KvResourceLoader implements ResourceLoader {
  private readonly namespace: KvNamespace;
  private readonly prefix: string;

  constructor(options: KvResourceLoaderOptions) {
    this.namespace = options.namespace;
    this.prefix = options.prefix ?? 'phone-validator:';
  }

  async loadResource(path: string): Promise<Uint8Array | null> {
    const buf = await this.namespace.get(`${this.prefix}${path}`, 'arrayBuffer');
    return buf ? new Uint8Array(buf) : null;
  }
}
