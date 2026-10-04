import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../../src/config/index.js';
import { ConfigError } from '../../../src/config/env.js';

describe('market data configuration', () => {
  it('defaults: no Upstox token, 120 s price age, 4 day FX age', () => {
    const { marketData } = loadConfig({});
    expect(marketData.upstox.accessToken).toBeUndefined();
    expect(marketData.upstox.apiUrl).toBe('https://api.upstox.com/v3');
    expect(marketData.maxAgeSeconds).toBe(120);
    expect(marketData.fx).toEqual({ apiUrl: 'https://api.frankfurter.dev', maxAgeDays: 4 });
  });

  it('treats empty values from .env.example as defaults', () => {
    const { marketData } = loadConfig({
      UPSTOX_ACCESS_TOKEN: '',
      UPSTOX_API_URL: '',
      MARKET_DATA_MAX_AGE_SECONDS: '',
      FX_API_URL: '',
      FX_RATE_MAX_AGE_DAYS: '',
    });
    expect(marketData.upstox.accessToken).toBeUndefined();
    expect(marketData.maxAgeSeconds).toBe(120);
  });

  it('reads overrides', () => {
    const { marketData } = loadConfig({
      UPSTOX_ACCESS_TOKEN: 'tok',
      MARKET_DATA_MAX_AGE_SECONDS: '30',
      FX_RATE_MAX_AGE_DAYS: '7',
      FX_API_URL: 'https://fx.internal',
    });
    expect(marketData.upstox.accessToken).toBe('tok');
    expect(marketData.maxAgeSeconds).toBe(30);
    expect(marketData.fx).toEqual({ apiUrl: 'https://fx.internal', maxAgeDays: 7 });
  });

  it.each([
    [{ UPSTOX_API_URL: 'not a url' }, 'UPSTOX_API_URL'],
    [{ MARKET_DATA_MAX_AGE_SECONDS: '0' }, 'MARKET_DATA_MAX_AGE_SECONDS'],
    [{ MARKET_DATA_MAX_AGE_SECONDS: 'abc' }, 'MARKET_DATA_MAX_AGE_SECONDS'],
    [{ FX_RATE_MAX_AGE_DAYS: '-1' }, 'FX_RATE_MAX_AGE_DAYS'],
    [{ FX_API_URL: 'nope' }, 'FX_API_URL'],
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
