import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../../src/config/index.js';
import { ConfigError } from '../../../src/config/env.js';

describe('market data configuration', () => {
  it('defaults: no Upstox token, 120 s price age, 4 day FX age, FX rate reused for 1 hour', () => {
    const { marketData } = loadConfig({});
    expect(marketData.upstox.accessToken).toBeUndefined();
    expect(marketData.upstox.apiUrl).toBe('https://api.upstox.com/v3');
    expect(marketData.maxAgeSeconds).toBe(120);
    expect(marketData.fx).toEqual({
      apiUrl: 'https://api.frankfurter.dev',
      maxAgeDays: 4,
      cacheMs: 3_600_000,
    });
  });

  it('treats empty values from .env.example as defaults', () => {
    const { marketData, ai } = loadConfig({
      UPSTOX_ACCESS_TOKEN: '',
      UPSTOX_API_URL: '',
      MARKET_DATA_MAX_AGE_SECONDS: '',
      FX_API_URL: '',
      FX_RATE_MAX_AGE_DAYS: '',
      FX_RATE_CACHE_SECONDS: '',
      AI_FORECAST_CACHE_SECONDS: '',
    });
    expect(marketData.upstox.accessToken).toBeUndefined();
    expect(marketData.maxAgeSeconds).toBe(120);
    expect(marketData.fx.cacheMs).toBe(3_600_000);
    expect(ai.forecastCacheMs).toBe(900_000);
  });

  it('reads overrides', () => {
    const { marketData } = loadConfig({
      UPSTOX_ACCESS_TOKEN: 'tok',
      MARKET_DATA_MAX_AGE_SECONDS: '30',
      FX_RATE_MAX_AGE_DAYS: '7',
      FX_API_URL: 'https://fx.internal',
      FX_RATE_CACHE_SECONDS: '60',
    });
    expect(marketData.upstox.accessToken).toBe('tok');
    expect(marketData.maxAgeSeconds).toBe(30);
    expect(marketData.fx).toEqual({
      apiUrl: 'https://fx.internal',
      maxAgeDays: 7,
      cacheMs: 60_000,
    });
  });

  it('turns either cache off with 0', () => {
    const { marketData, ai } = loadConfig({
      FX_RATE_CACHE_SECONDS: '0',
      AI_FORECAST_CACHE_SECONDS: '0',
    });
    expect(marketData.fx.cacheMs).toBe(0);
    expect(ai.forecastCacheMs).toBe(0);
  });

  it.each([
    [{ UPSTOX_API_URL: 'not a url' }, 'UPSTOX_API_URL'],
    [{ MARKET_DATA_MAX_AGE_SECONDS: '0' }, 'MARKET_DATA_MAX_AGE_SECONDS'],
    [{ MARKET_DATA_MAX_AGE_SECONDS: 'abc' }, 'MARKET_DATA_MAX_AGE_SECONDS'],
    [{ FX_RATE_MAX_AGE_DAYS: '-1' }, 'FX_RATE_MAX_AGE_DAYS'],
    [{ FX_API_URL: 'nope' }, 'FX_API_URL'],
    [{ FX_RATE_CACHE_SECONDS: '-1' }, 'FX_RATE_CACHE_SECONDS'],
    [{ AI_FORECAST_CACHE_SECONDS: '7200' }, 'AI_FORECAST_CACHE_SECONDS'],
  ])('rejects invalid %j', (source, variable) => {
    expect(() => loadConfig(source)).toThrow(ConfigError);
    expect(() => loadConfig(source)).toThrow(variable);
  });

  it('never echoes the access token in a config error', () => {
    try {
      loadConfig({ UPSTOX_ACCESS_TOKEN: 'TOKEN-VALUE', API_PORT: 'bad' });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).not.toContain('TOKEN-VALUE');
    }
  });
});
