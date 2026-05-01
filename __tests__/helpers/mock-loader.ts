/**
 * In-memory `ResourceLoader` used across the unit suite. Stores serialized
 * BSON tables under their canonical paths and supports per-path delays /
 * errors so latency and failure-mode tests can drive the resolver.
 */
import { serialize } from 'bson';
import type { ResourceLoader } from '../../src/types';

export class MockResourceLoader implements ResourceLoader {
  private resources = new Map<string, Uint8Array>();
  private delays = new Map<string, number>();
  private errors = new Map<string, Error | null>();
  private callCount = new Map<string, number>();

  /** Convert a JSON object to BSON and store it under `path`. */
  put(path: string, data: Record<string, unknown>): this {
    this.resources.set(path, new Uint8Array(serialize(data)));
    return this;
  }

  /** Insert raw bytes (used for "corrupted BSON" tests). */
  putRaw(path: string, data: Uint8Array): this {
    this.resources.set(path, data);
    return this;
  }

  delay(path: string, ms: number): this {
    this.delays.set(path, ms);
    return this;
  }

  fail(path: string, error: Error | null): this {
    this.errors.set(path, error);
    return this;
  }

  callsFor(path: string): number {
    return this.callCount.get(path) ?? 0;
  }

  reset(): void {
    this.resources.clear();
    this.delays.clear();
    this.errors.clear();
    this.callCount.clear();
  }

  async loadResource(path: string): Promise<Uint8Array | null> {
    this.callCount.set(path, (this.callCount.get(path) ?? 0) + 1);

    const error = this.errors.get(path);
    if (error) throw error;

    const ms = this.delays.get(path);
    if (ms) await new Promise((resolve) => setTimeout(resolve, ms));

    return this.resources.get(path) ?? null;
  }

  loadResourceSync(path: string): Uint8Array | null {
    this.callCount.set(path, (this.callCount.get(path) ?? 0) + 1);

    const error = this.errors.get(path);
    if (error) throw error;

    return this.resources.get(path) ?? null;
  }
}
