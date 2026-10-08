import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PAYLOAD_HASH_HEADER } from '@mindspark/shared';
import { ApiRequestError, api, requestJson, setSessionExpiredHandler } from '../src/api/client';

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
const unauth = () =>
  json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue' } });

afterEach(() => setSessionExpiredHandler(undefined));

describe('payload hashing', () => {
  it('hashes the exact body it sends and sends it in X-Payload-Hash', async () => {
    const fetchMock = vi.fn(() => json(200, { ok: true }));
    const body = { name: 'Zoë', amount: 1_000_000, nested: { a: [1, 2, 3] } };
    await requestJson('POST', '/api/simulate', body, fetchMock as unknown as typeof fetch);

    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/simulate');
    expect(init.body).toBe(JSON.stringify(body));
    const headers = init.headers as Record<string, string>;
    expect(headers[PAYLOAD_HASH_HEADER]).toBe(sha256(JSON.stringify(body)));
    expect(headers['content-type']).toBe('application/json');
    expect(init.credentials).toBe('same-origin');
  });

  it('hashes every capability the API client sends, with no per-call code', async () => {
    const fetchMock = vi.fn(() => json(200, {}));
    const f = fetchMock as unknown as typeof fetch;
    await api.configure({ a: 1 }, f);
    await api.suitability({ b: 2 }, f);
    await api.chat({ c: 3 }, f);
    await api.auth.login({ email: 'a@b.c', password: 'x' }, f);
    await api.auth.updateSettings({ theme: 'dark' }, f);
    for (const [, init] of fetchMock.mock.calls as unknown as Array<[string, RequestInit]>) {
      const headers = init.headers as Record<string, string>;
      expect(headers[PAYLOAD_HASH_HEADER]).toBe(sha256(init.body as string));
    }
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('sends no body and no hash for GET and body-less POST', async () => {
    const fetchMock = vi.fn(() => json(200, { authRequired: false, user: null }));
    await api.auth.me(fetchMock);
    await api.auth.logout(fetchMock);
    for (const [, init] of fetchMock.mock.calls as unknown as Array<[string, RequestInit]>) {
      expect(init.body).toBeUndefined();
      expect(init.headers).toBeUndefined();
    }
  });
});

describe('silent session refresh', () => {
  it('refreshes once on UNAUTHENTICATED and retries the original request', async () => {
    const calls: string[] = [];
    let first = true;
    const fetchMock = vi.fn((path: string) => {
      calls.push(path);
      if (path === '/api/auth/refresh') return json(200, { user: {} });
      if (first) {
        first = false;
        return unauth();
      }
      return json(200, { simulationId: 'sim-1' });
    });
    const result = await requestJson<{ simulationId: string }>(
      'POST',
      '/api/simulate',
      { x: 1 },
      fetchMock as unknown as typeof fetch,
    );
    expect(result.simulationId).toBe('sim-1');
    expect(calls).toEqual(['/api/simulate', '/api/auth/refresh', '/api/simulate']);
  });

  it('signs out (handler) and throws when the refresh fails', async () => {
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    const fetchMock = vi.fn((path: string) => (path === '/api/auth/refresh' ? unauth() : unauth()));
    const err = await requestJson(
      'POST',
      '/api/simulate',
      { x: 1 },
      fetchMock as unknown as typeof fetch,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).code).toBe('UNAUTHENTICATED');
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('does not loop: a second 401 after a successful refresh is returned as an error', async () => {
    const fetchMock = vi.fn((path: string) =>
      path === '/api/auth/refresh' ? json(200, { user: {} }) : unauth(),
    );
    await expect(
      requestJson('GET', '/api/admin/users', undefined, fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchMock.mock.calls.filter(([p]) => p === '/api/auth/refresh')).toHaveLength(1);
  });

  it('never tries to refresh for the auth endpoints themselves', async () => {
    const fetchMock = vi.fn(() => unauth());
    await expect(
      api.auth.login({ email: 'a@b.c', password: 'x' }, fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shares one refresh between concurrent requests', async () => {
    const seen = new Map<string, number>();
    const fetchMock = vi.fn((path: string) => {
      const n = (seen.get(path) ?? 0) + 1;
      seen.set(path, n);
      if (path === '/api/auth/refresh') return json(200, { user: {} });
      return n === 1 ? unauth() : json(200, { ok: path });
    });
    const f = fetchMock as unknown as typeof fetch;
    const [a, b] = await Promise.all([
      requestJson('GET', '/api/admin/users', undefined, f),
      requestJson('GET', '/api/audit/simulations', undefined, f),
    ]);
    expect(a).toEqual({ ok: '/api/admin/users' });
    expect(b).toEqual({ ok: '/api/audit/simulations' });
    expect(seen.get('/api/auth/refresh')).toBe(1);
  });
});
