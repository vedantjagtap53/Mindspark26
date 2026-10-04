import { describe, expect, it } from 'vitest';
import { createForecastClient, ForecastError } from '../../../src/services/ai/forecastClient.js';
import { FIXTURE_NOW, makeForecast } from '../../fixtures/forecast.js';

const input = {
  underlying: { symbol: '^NSEI', assetClass: 'index' as const },
  tenorDays: 182,
  samplePathCount: 100,
};

function client(fetchImpl: typeof fetch) {
  return createForecastClient({
    baseUrl: 'https://ai.example/',
    apiKey: 'k',
    fetchImpl,
    now: () => FIXTURE_NOW,
  });
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function codeOf(p: Promise<unknown>): Promise<ForecastError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ForecastError);
    return e as ForecastError;
  }
  throw new Error('expected rejection');
}

describe('forecast client', () => {
  it('posts the normalized request and returns the validated forecast', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fetchImpl = ((url: string, init: RequestInit) => {
      seen = { url, init };
      return Promise.resolve(jsonResponse(makeForecast()));
    }) as unknown as typeof fetch;

    const f = await client(fetchImpl).forecast(input);
    expect(f.horizon.tradingDays).toBe(126);
    expect(seen?.url).toBe('https://ai.example/forecast');
    expect(JSON.parse(seen?.init.body as string)).toEqual({ ...input, trainingWindowYears: 10 });
    expect((seen?.init.headers as Record<string, string>).authorization).toBe('Bearer k');
  });

  it('rejects invalid input before calling the service', async () => {
    let called = false;
    const fetchImpl = (() => {
      called = true;
      return Promise.resolve(jsonResponse({}));
    }) as unknown as typeof fetch;
    const e = await codeOf(client(fetchImpl).forecast({ ...input, tenorDays: 5 }));
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(called).toBe(false);
  });

  it('maps HTTP errors and network failures to AI_UNAVAILABLE', async () => {
    const http500 = (() => Promise.resolve(jsonResponse({}, 500))) as unknown as typeof fetch;
    expect((await codeOf(client(http500).forecast(input))).code).toBe('AI_UNAVAILABLE');
    const down = (() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch;
    expect((await codeOf(client(down).forecast(input))).code).toBe('AI_UNAVAILABLE');
  });

  it('maps contract violations to AI_INVALID_RESPONSE with details', async () => {
    const bad = makeForecast();
    bad.samplePaths.pop();
    const fetchImpl = (() => Promise.resolve(jsonResponse(bad))) as unknown as typeof fetch;
    const e = await codeOf(client(fetchImpl).forecast(input));
    expect(e.code).toBe('AI_INVALID_RESPONSE');
    expect(e.details.length).toBeGreaterThan(0);
  });

  it('maps malformed JSON to AI_INVALID_RESPONSE', async () => {
    const fetchImpl = (() =>
      Promise.resolve(new Response('not json', { status: 200 }))) as unknown as typeof fetch;
    expect((await codeOf(client(fetchImpl).forecast(input))).code).toBe('AI_INVALID_RESPONSE');
  });
});
