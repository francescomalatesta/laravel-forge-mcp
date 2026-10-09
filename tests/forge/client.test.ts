import { describe, expect, it, vi } from 'vitest';
import { ForgeClient, type ForgeClientOptions } from '../../src/forge/client.js';
import { ForgeApiError, ForgeConnectionError } from '../../src/forge/errors.js';
import { createMockFetch, type MockHandler } from '../helpers/mock-fetch.js';

function setup(responses: MockHandler[], options: Partial<ForgeClientOptions> = {}) {
  const mock = createMockFetch(...responses);
  const sleep = vi.fn(async (_ms: number) => {});
  const client = new ForgeClient({
    apiToken: 'secret',
    baseUrl: 'https://forge.test/api/',
    fetch: mock.fetch,
    sleep,
    ...options,
  });
  return { client, requests: mock.requests, sleep, pending: mock.pending };
}

describe('ForgeClient', () => {
  it('sends authenticated JSON requests and returns parsed data with rate limit info', async () => {
    const { client, requests } = setup([
      { body: { data: [] }, headers: { 'x-ratelimit-limit': '60', 'x-ratelimit-remaining': '59' } },
    ]);

    const response = await client.get('/orgs', { query: { page: { size: 10 } } });

    expect(response.data).toEqual({ data: [] });
    expect(response.rateLimit).toEqual({ limit: 60, remaining: 59, reset: undefined });
    const [request] = requests;
    expect(request?.url.toString()).toBe('https://forge.test/api/orgs?page%5Bsize%5D=10');
    expect(request?.headers.get('authorization')).toBe('Bearer secret');
    expect(request?.headers.get('accept')).toBe('application/json');
    expect(request?.headers.has('content-type')).toBe(false);
  });

  it('serializes bodies as JSON', async () => {
    const { client, requests } = setup([{ status: 202, body: { data: { id: '1', type: 'x' } } }]);
    await client.post('/orgs/acme/servers', { body: { name: 'web' } });
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.headers.get('content-type')).toBe('application/json');
    expect(requests[0]?.body).toEqual({ name: 'web' });
  });

  it('returns undefined data for 204 responses', async () => {
    const { client } = setup([{ status: 204 }]);
    const response = await client.delete('/orgs/acme/servers/1');
    expect(response.status).toBe(204);
    expect(response.data).toBeUndefined();
  });

  it('maps error responses to ForgeApiError with validation details', async () => {
    const { client } = setup([
      { status: 422, body: { message: 'The name field is required.', errors: { name: ['The name field is required.'] } } },
    ]);
    const error = await client.post('/orgs/acme/servers').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForgeApiError);
    expect(error).toMatchObject({
      status: 422,
      message: 'The name field is required.',
      method: 'POST',
      path: '/orgs/acme/servers',
      validationErrors: { name: ['The name field is required.'] },
    });
  });

  it('retries rate-limited requests honoring Retry-After', async () => {
    const { client, sleep, requests } = setup([
      { status: 429, body: { message: 'Too Many Attempts.' }, headers: { 'retry-after': '3' } },
      { body: { data: [] } },
    ]);
    await expect(client.get('/orgs')).resolves.toMatchObject({ status: 200 });
    expect(sleep).toHaveBeenCalledWith(3000);
    expect(requests).toHaveLength(2);
  });

  it('gives up when the rate limit wait is too long', async () => {
    const { client, sleep } = setup([{ status: 429, headers: { 'retry-after': '120' } }]);
    await expect(client.get('/orgs')).rejects.toMatchObject({ status: 429, retryAfterSeconds: 120 });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries transient errors for idempotent methods only', async () => {
    const get = setup([{ status: 503 }, { body: { data: [] } }]);
    await expect(get.client.get('/orgs')).resolves.toMatchObject({ status: 200 });

    const post = setup([{ status: 503 }]);
    await expect(post.client.post('/orgs/acme/servers')).rejects.toMatchObject({ status: 503 });
    expect(post.sleep).not.toHaveBeenCalled();
  });

  it('stops after maxRetries', async () => {
    const { client, requests } = setup([{ status: 502 }, { status: 502 }, { status: 502 }], { maxRetries: 2 });
    await expect(client.get('/orgs')).rejects.toMatchObject({ status: 502 });
    expect(requests).toHaveLength(3);
  });

  it('wraps network failures in ForgeConnectionError', async () => {
    const { client } = setup([new TypeError('fetch failed')], { maxRetries: 0 });
    const error = await client.get('/orgs').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForgeConnectionError);
    expect(error).toMatchObject({ timedOut: false, message: expect.stringContaining('fetch failed') });
  });

  it('reports timeouts without retrying', async () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    const { client, requests } = setup([timeout], { maxRetries: 2, timeoutMs: 1234 });
    await expect(client.get('/orgs')).rejects.toMatchObject({ timedOut: true, message: expect.stringContaining('1234 ms') });
    expect(requests).toHaveLength(1);
  });
});
