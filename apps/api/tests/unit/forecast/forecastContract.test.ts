import { describe, expect, it } from 'vitest';
import {
  forecastRequestSchema,
  tenorToTradingDays,
  validateForecastResponse,
} from '@mindspark/shared';
import { FIXTURE_NOW, makeForecast } from '../../fixtures/forecast.js';

const request = forecastRequestSchema.parse({
  underlying: { symbol: '^NSEI', assetClass: 'index' },
  tenorDays: 182,
  samplePathCount: 100,
});

describe('tenorToTradingDays', () => {
  it('converts calendar days to trading days', () => {
    expect(tenorToTradingDays(30)).toBe(21);
    expect(tenorToTradingDays(182)).toBe(126);
    expect(tenorToTradingDays(365)).toBe(252);
    expect(tenorToTradingDays(1095)).toBe(756);
  });
});

describe('forecastRequestSchema', () => {
  it('applies defaults', () => {
    const r = forecastRequestSchema.parse({
      underlying: { symbol: '^NSEI', assetClass: 'index' },
      tenorDays: 90,
    });
    expect(r.trainingWindowYears).toBe(10);
    expect(r.samplePathCount).toBe(500);
  });

  it.each([29, 1096, 90.5])('rejects tenor %s', (tenorDays) => {
    const r = forecastRequestSchema.safeParse({
      underlying: { symbol: '^NSEI', assetClass: 'index' },
      tenorDays,
    });
    expect(r.success).toBe(false);
  });

  it('rejects a 7-year training window', () => {
    const r = forecastRequestSchema.safeParse({
      underlying: { symbol: '^NSEI', assetClass: 'index' },
      tenorDays: 90,
      trainingWindowYears: 7,
    });
    expect(r.success).toBe(false);
  });
});

describe('validateForecastResponse', () => {
  it('accepts a valid forecast', () => {
    expect(validateForecastResponse(makeForecast(), request, FIXTURE_NOW).ok).toBe(true);
  });

  const failsAt = (raw: unknown, path: string) => {
    const r = validateForecastResponse(raw, request, FIXTURE_NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.path)).toContain(path);
  };

  it('rejects wrong path length', () => {
    const f = makeForecast();
    f.cases.base.path.pop();
    failsAt(f, 'cases.base.path');
  });

  it('rejects path not starting at spot', () => {
    const f = makeForecast();
    f.fan.p50[0] = 1;
    failsAt(f, 'fan.p50.0');
  });

  it('rejects non-positive and non-finite prices', () => {
    const f = makeForecast();
    f.samplePaths[3]![10] = -5;
    expect(validateForecastResponse(f, request, FIXTURE_NOW).ok).toBe(false);
    const g = makeForecast() as unknown as { cases: { low: { path: unknown[] } } };
    g.cases.low.path[5] = null; // JSON has no NaN/Infinity; they arrive as null
    expect(validateForecastResponse(g, request, FIXTURE_NOW).ok).toBe(false);
  });

  it('rejects mismatched tenor or trading days', () => {
    failsAt(makeForecast({ tenorDays: 90 }), 'horizon.tenorDays');
  });

  it('rejects wrong sample count', () => {
    failsAt(makeForecast({ samplePathCount: 50 }), 'samplePaths');
  });

  it('rejects unordered cases and quantiles', () => {
    const f = makeForecast();
    [f.cases.low.path, f.cases.high.path] = [f.cases.high.path, f.cases.low.path];
    failsAt(f, 'cases');
    const g = makeForecast();
    g.terminalQuantiles.p5 = g.terminalQuantiles.p95 + 1;
    failsAt(g, 'terminalQuantiles');
  });

  it('rejects stale data', () => {
    failsAt(makeForecast({ asOf: '2026-09-20' }), 'data.asOf');
  });

  it('rejects an unknown contract version', () => {
    failsAt({ ...makeForecast(), contractVersion: '2.0' }, 'contractVersion');
  });

  it('rejects fewer than 10,000 simulations', () => {
    const f = makeForecast();
    f.model.simulations = 500;
    failsAt(f, 'model.simulations');
  });
});
