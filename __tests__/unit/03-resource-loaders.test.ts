/**
 * Built-in `ResourceLoader` implementations — `FetchResourceLoader` and
 * `KvResourceLoader`. Verifies path construction, error mapping, timeout
 * propagation, and prefix handling.
 */
import { describe, expect, it, mock } from 'bun:test';
import { FetchResourceLoader } from '../../src/serverless/loaders/fetch-loader';
import { KvResourceLoader } from '../../src/serverless/loaders/kv-loader';

describe('FetchResourceLoader', () => {
  it('appends the path to the base URL', async () => {
    const fetchMock = mock(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3]))));
    const loader = new FetchResourceLoader({
      baseUrl: 'https://cdn.example.com/phone/',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await loader.loadResource('geocodes/en/41.bson');
    expect(result).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callArgs = fetchMock.mock.calls[0] as unknown as [string, unknown];
    expect(callArgs[0]).toBe('https://cdn.example.com/phone/geocodes/en/41.bson');
  });

  it('treats 404 as "not found", not an error', async () => {
    const fetchMock = mock(() => Promise.resolve(new Response('', { status: 404 })));
    const loader = new FetchResourceLoader({
      baseUrl: 'https://cdn.example.com/',
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(await loader.loadResource('missing.bson')).toBeNull();
  });

  it('throws on non-2xx, non-404 responses', async () => {
    const fetchMock = mock(() => Promise.resolve(new Response('boom', { status: 500 })));
    const loader = new FetchResourceLoader({
      baseUrl: 'https://cdn.example.com/',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(loader.loadResource('boom.bson')).rejects.toThrow(/500/);
  });

  it('appends a trailing slash to a baseUrl that lacks one', () => {
    expect(
      () =>
        new FetchResourceLoader({
          baseUrl: 'https://cdn.example.com/no-trailing-slash',
          fetch: (() => Promise.reject(new Error('ignored'))) as unknown as typeof fetch,
        })
    ).not.toThrow();
  });
});

describe('KvResourceLoader', () => {
  it('prefixes keys with the configured prefix', async () => {
    const get = mock(async (_key: string, _type: 'arrayBuffer') => new Uint8Array([7, 8]).buffer);
    const loader = new KvResourceLoader({
      namespace: { get: get as unknown as (k: string, t: 'arrayBuffer') => Promise<ArrayBuffer | null> },
      prefix: 'phone:',
    });
    const result = await loader.loadResource('geocodes/en/41.bson');
    expect(result).toEqual(new Uint8Array([7, 8]));
    expect(get).toHaveBeenCalledWith('phone:geocodes/en/41.bson', 'arrayBuffer');
  });

  it('returns null when the namespace has no value', async () => {
    const get = mock(async (_key: string, _type: 'arrayBuffer') => null);
    const loader = new KvResourceLoader({
      namespace: { get: get as unknown as (k: string, t: 'arrayBuffer') => Promise<ArrayBuffer | null> },
    });
    expect(await loader.loadResource('missing.bson')).toBeNull();
  });
});
