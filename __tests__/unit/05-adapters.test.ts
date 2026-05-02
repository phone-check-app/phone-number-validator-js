/**
 * Smoke tests for each serverless adapter — verifies routing, CORS, and the
 * happy-path JSON response shape. Adapter-internal logic (validation,
 * dispatch) is covered by `04-serverless-dispatch.test.ts` and not retested
 * here.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { clearCache } from '../../src/cache';
import { setResourceLoader } from '../../src/core';
import {
  apiGatewayHandler,
  handler as awsRouted,
  cacheHandler,
  lambdaHandler,
} from '../../src/serverless/adapters/aws-lambda';
import { azureFunction, azureHandler } from '../../src/serverless/adapters/azure';
import { gcpFunction, gcpHandler } from '../../src/serverless/adapters/gcp';
import { netlifyFunction, netlifyHandler } from '../../src/serverless/adapters/netlify';
import { edgeHandler, handler as vercelRouted } from '../../src/serverless/adapters/vercel';
import { MockResourceLoader } from '../helpers/mock-loader';

let loader: MockResourceLoader;

beforeEach(() => {
  loader = new MockResourceLoader();
  loader.put('geocodes/en/1.bson', { '415': 'San Francisco' });
  loader.put('timezones.bson', { '14155552671': 'America/Los_Angeles' });
  setResourceLoader(loader);
  clearCache();
});

afterEach(() => {
  setResourceLoader(null);
});

describe('AWS Lambda adapter', () => {
  it('apiGatewayHandler returns 200 with single result', async () => {
    const res = await apiGatewayHandler({
      body: JSON.stringify({ phoneNumber: '+14155552671' }),
      headers: {},
      httpMethod: 'POST',
      path: '/',
      queryStringParameters: null,
      pathParameters: null,
    });
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.success).toBe(true);
    expect(parsed.data.valid).toBe(true);
  });

  it('apiGatewayHandler 400s on missing input', async () => {
    const res = await apiGatewayHandler({
      body: JSON.stringify({}),
      headers: {},
      httpMethod: 'POST',
      path: '/',
      queryStringParameters: null,
      pathParameters: null,
    });
    expect(res.statusCode).toBe(400);
  });

  it('routed handler exposes /health, /validate, /validate/batch', async () => {
    const health = await awsRouted({
      body: null,
      headers: {},
      httpMethod: 'GET',
      path: '/health',
      queryStringParameters: null,
      pathParameters: null,
    });
    expect(health.statusCode).toBe(200);
    expect(JSON.parse(health.body).status).toBe('healthy');

    const validate = await awsRouted({
      body: JSON.stringify({ phoneNumber: '+14155552671' }),
      headers: {},
      httpMethod: 'POST',
      path: '/validate',
      queryStringParameters: null,
      pathParameters: null,
    });
    expect(validate.statusCode).toBe(200);
    expect(JSON.parse(validate.body).valid).toBe(true);
  });

  it('lambdaHandler bypasses the API Gateway envelope', async () => {
    const res = await lambdaHandler({ phoneNumber: '+14155552671' });
    expect(res.success).toBe(true);
  });

  it('cacheHandler clears + reports stats', async () => {
    expect((await cacheHandler({ action: 'clear' })).success).toBe(true);
    expect((await cacheHandler({ action: 'stats' })).success).toBe(true);
  });
});

describe('Vercel adapter', () => {
  it('edgeHandler accepts POST with JSON body', async () => {
    const req = new Request('https://example.vercel.app/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phoneNumber: '+14155552671' }),
    });
    const res = await edgeHandler(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean; data: { valid: boolean } };
    expect(data.success).toBe(true);
    expect(data.data.valid).toBe(true);
  });

  it('edgeHandler accepts GET with query params', async () => {
    const req = new Request('https://example.vercel.app/?phoneNumber=%2B14155552671', { method: 'GET' });
    const res = await edgeHandler(req);
    expect(res.status).toBe(200);
  });

  it('routed handler 404s on unknown paths', async () => {
    const req = new Request('https://example.vercel.app/api/unknown', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const res = await vercelRouted(req);
    expect(res.status).toBe(404);
  });
});

describe('GCP adapter', () => {
  it('gcpHandler routes /validate', async () => {
    const captured: { status?: number; body?: unknown } = {};
    const res = {
      status(code: number) {
        captured.status = code;
        return this;
      },
      set() {
        return this;
      },
      json(body: unknown) {
        captured.body = body;
        return this;
      },
      send() {
        return this;
      },
    };
    await gcpHandler({ method: 'POST', path: '/validate', body: { phoneNumber: '+14155552671' } }, res);
    expect(captured.status).toBe(200);
    expect((captured.body as { valid: boolean }).valid).toBe(true);
  });

  it('gcpFunction infers single from body', async () => {
    const captured: { status?: number; body?: unknown } = {};
    const res = {
      status(code: number) {
        captured.status = code;
        return this;
      },
      set() {
        return this;
      },
      json(body: unknown) {
        captured.body = body;
        return this;
      },
      send() {
        return this;
      },
    };
    await gcpFunction({ method: 'POST', body: { phoneNumber: '+14155552671' } }, res);
    expect(captured.status).toBe(200);
  });
});

describe('Netlify adapter', () => {
  it('netlifyHandler strips function prefix', async () => {
    const res = await netlifyHandler({
      body: JSON.stringify({ phoneNumber: '+14155552671' }),
      headers: {},
      httpMethod: 'POST',
      path: '/.netlify/functions/phone/validate',
      queryStringParameters: null,
    });
    expect(res.statusCode).toBe(200);
  });

  it('netlifyFunction infers from body', async () => {
    const res = await netlifyFunction({
      body: JSON.stringify({ phoneNumber: '+14155552671' }),
      headers: {},
      httpMethod: 'POST',
      path: '/',
      queryStringParameters: null,
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('Azure adapter', () => {
  function makeReq(method: string, url: string, body: unknown) {
    return {
      method,
      url,
      headers: {},
      query: {},
      json: async () => body,
    };
  }

  it('azureHandler routes /api/validate', async () => {
    const res = await azureHandler(
      makeReq('POST', 'https://x.azurewebsites.net/api/validate', { phoneNumber: '+14155552671' })
    );
    expect(res.status).toBe(200);
    expect((res.jsonBody as { valid: boolean }).valid).toBe(true);
  });

  it('azureFunction infers single from body', async () => {
    const res = await azureFunction(makeReq('POST', 'https://x/', { phoneNumber: '+14155552671' }));
    expect(res.status).toBe(200);
  });
});
