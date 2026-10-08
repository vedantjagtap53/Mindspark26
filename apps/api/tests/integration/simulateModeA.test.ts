// Mode A end to end through HTTP with a fake forecast client (contract fixture; test-only data).
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  PAYOFF_CURVE_SHOCKS,
  SCENARIO_SHOCKS,
  type ForecastRequestInput,
  type SimulateModeAContextResponse,
  type SimulateModeAResponse,
} from '@mindspark/shared';
import { buildConfig } from '../../src/config/index.js';
import { parseEnv } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';
import { ForecastError, type ForecastClient } from '../../src/services/ai/forecastClient.js';
import type { HistoryProvider } from '../../src/services/market-data/history/yahooHistoryProvider.js';
import { createMarketDataService } from '../../src/services/market-data/marketDataService.js';
import { silentLogger } from '../../src/utils/logger.js';
import { makeForecast } from '../fixtures/forecast.js';
import { errorBody } from '../helpers/http.js';

const SPOT = 25_000;
const N = 1_000_000;
const config = buildConfig(parseEnv({}));

function fakeForecast(fail?: ForecastError) {
  const calls: ForecastRequestInput[] = [];
  const client: ForecastClient = {
    forecast: (input) => {
      calls.push(input);
      if (fail) return Promise.reject(fail);
      return Promise.resolve(
        makeForecast({
          spot: SPOT,
          tenorDays: input.tenorDays,
          samplePathCount: input.samplePathCount,
        }),
      );
    },
  };
  return { client, calls };
}

const appWith = (forecast?: ForecastClient) =>
  createApp(config, silentLogger, { marketData: createMarketDataService({}), forecast });
const post = (body: object, app = appWith(fakeForecast().client)) =>
  request(app).post('/api/simulate').send(body);
const out = (res: { body: unknown }) => res.body as SimulateModeAResponse;

const underlying = { symbol: '^NSEI', assetClass: 'index' };
const eln = {
  underlying,
  notional: N,
  tenorDays: 182,
  strikePct: 100,
  couponPct: 10,
  barrierPct: 80,
  barrierType: 'European',
};
const cpn = { underlying, notional: N, tenorDays: 182, protectionPct: 100, participationPct: 60 };
const coupon = N * 0.1 * (182 / 365);

describe('POST /api/simulate — Mode A', () => {
  it('asks the forecast service for the product underlying, tenor and window', async () => {
    const { client, calls } = fakeForecast();
    await post(
      { mode: 'A', productType: 'ELN', terms: eln, trainingWindowYears: 0.5 },
      appWith(client),
    );
    expect(calls).toEqual([
      { underlying, tenorDays: 182, trainingWindowYears: 0.5, samplePathCount: 500 },
    ]);
  });

  it('defaults the training window to 3 years', async () => {
    const { client, calls } = fakeForecast();
    await post({ mode: 'A', productType: 'CPN', terms: cpn }, appWith(client));
    expect(calls[0]?.trainingWindowYears).toBe(3);
  });

  it('ELN: runs the engine on each case path', async () => {
    const res = await post({ mode: 'A', productType: 'ELN', terms: eln });
    expect(res.status).toBe(200);
    const body = out(res);
    expect(body.spot).toEqual({ value: SPOT, asOf: '2026-10-02' });
    expect(body.horizon).toEqual({ tenorDays: 182, tradingDays: 126 });
    // Fixture cases end at 85% / 104% / 122% of spot: all above the 80% barrier.
    for (const k of ['low', 'base', 'high'] as const) {
      expect(body.cases[k].knockedIn).toBe(false);
      expect(body.cases[k].payoff).toBeCloseTo(N + coupon, 6);
    }
    expect(body.cases.low.terminal).toBeCloseTo(SPOT * 0.85, 6);
    expect(body.cases.low.percentile).toBe(5);
    expect(body.cases.low.returnPct).toBeCloseTo((coupon / N) * 100, 9);
  });

  it('ELN American barrier: a case path touching the barrier knocks in', async () => {
    const terms = { ...eln, barrierPct: 85, barrierType: 'American' };
    const body = out(await post({ mode: 'A', productType: 'ELN', terms }));
    expect(body.cases.low.knockedIn).toBe(true);
    expect(body.cases.low.payoff).toBeCloseTo(N * 0.85 + coupon, 4);
    expect(body.cases.low.lossAmount).toBeCloseTo(N - (N * 0.85 + coupon), 4);
    expect(body.cases.base.knockedIn).toBe(false);
  });

  it('ELN distribution: knock-in and loss probabilities across the sample paths', async () => {
    const body = out(await post({ mode: 'A', productType: 'ELN', terms: eln }));
    // Fixture: 500 straight paths ending at 70% … 130% of spot.
    const ends = Array.from({ length: 500 }, (_, i) => 0.7 + (0.6 * i) / 499);
    const knocked = ends.filter((e) => e <= 0.8 + 1e-12).length;
    const losses = ends.filter((e) => e <= 0.8 + 1e-12 && N * e + coupon < N).length;
    expect(body.distribution.pathCount).toBe(500);
    expect(body.distribution.probabilityOfKnockIn).toBeCloseTo(knocked / 500, 12);
    expect(body.distribution.probabilityOfLoss).toBeCloseTo(losses / 500, 12);
    expect(body.distribution.payoffQuantiles.p50).toBeCloseTo(N + coupon, 4);
  });

  it('CPN: no barrier, so knock-in fields are null', async () => {
    const body = out(await post({ mode: 'A', productType: 'CPN', terms: cpn }));
    expect(body.cases.high.payoff).toBeCloseTo(N * (1 + 0.6 * 0.22), 4);
    expect(body.cases.low.payoff).toBeCloseTo(N, 6);
    expect(body.cases.low.knockedIn).toBeNull();
    expect(body.distribution.probabilityOfKnockIn).toBeNull();
    expect(body.distribution.probabilityOfLoss).toBe(0);
  });

  it('returns the fan chart, model card and backtest, and the scenario notice', async () => {
    const body = out(await post({ mode: 'A', productType: 'CPN', terms: cpn }));
    expect(body.fan.p50).toHaveLength(127);
    expect(body.fan.p50[0]).toBe(SPOT);
    expect(body.model).toMatchObject({
      name: 'garch11-t-montecarlo',
      simulations: 10000,
      trainingWindowYears: 3,
      trainingStart: '2016-10-03',
      trainingEnd: '2026-10-02',
    });
    expect(body.backtest.bandCoverage).toBe(0.88);
    expect(body.notice).toMatch(/not a guarantee/);
    expect(body).not.toHaveProperty('samplePaths');
  });

  it('returns the payoff curve, the PRD scenario table and breakevens from the spot', async () => {
    const body = out(await post({ mode: 'A', productType: 'ELN', terms: eln }));
    expect(body.curve.map((p) => p.shockPct)).toEqual([...PAYOFF_CURVE_SHOCKS]);
    expect(body.scenarios.map((p) => p.shockPct)).toEqual([...SCENARIO_SHOCKS]);
    // Levels are the spot shocked; −25% is below the 80% barrier (knocked in), 0% is not.
    const at = (s: number) => body.scenarios.find((p) => p.shockPct === s)!;
    expect(at(0).level).toBeCloseTo(SPOT, 6);
    expect(at(-25).level).toBeCloseTo(SPOT * 0.75, 6);
    expect(at(-25).knockedIn).toBe(true);
    expect(at(0).knockedIn).toBe(false);
    expect(at(0).payoff).toBeCloseTo(N + coupon, 4);
    // The breakeven of a barrier ELN is the barrier cliff at −20%.
    expect(body.breakevens).toHaveLength(1);
    expect(body.breakevens[0]!.shockPct).toBeCloseTo(-20, 3);
    expect(body.breakevens[0]!.level).toBeCloseTo(SPOT * 0.8, 1);
  });

  it('a fully protected CPN has no breakeven (it never loses)', async () => {
    const body = out(await post({ mode: 'A', productType: 'CPN', terms: cpn }));
    expect(body.breakevens).toEqual([]);
  });
});

describe('POST /api/simulate — Mode A errors', () => {
  it('forecast service not configured → AI_UNAVAILABLE (503)', async () => {
    const res = await post({ mode: 'A', productType: 'ELN', terms: eln }, appWith(undefined));
    expect(res.status).toBe(503);
    expect(errorBody(res).code).toBe('AI_UNAVAILABLE');
  });

  it('forecast service down → AI_UNAVAILABLE (503)', async () => {
    const { client } = fakeForecast(
      new ForecastError('AI_UNAVAILABLE', 'Forecast service is unreachable'),
    );
    const res = await post({ mode: 'A', productType: 'ELN', terms: eln }, appWith(client));
    expect(res.status).toBe(503);
    expect(errorBody(res).message).toMatch(/unreachable/);
  });

  it('forecast breaks the contract → AI_INVALID_RESPONSE (502) with details, no fallback', async () => {
    const { client } = fakeForecast(
      new ForecastError('AI_INVALID_RESPONSE', 'Forecast response does not match the contract', [
        { path: 'data', message: 'Required' },
      ]),
    );
    const res = await post({ mode: 'A', productType: 'ELN', terms: eln }, appWith(client));
    expect(res.status).toBe(502);
    expect(errorBody(res)).toMatchObject({
      code: 'AI_INVALID_RESPONSE',
      details: [{ path: 'data', message: 'Required' }],
    });
  });

  describe('DCD in Mode A: Nifty 50 forecast as context only', () => {
    const dcdTerms = {
      depositCurrency: 'usd',
      alternateCurrency: 'INR',
      depositAmount: 100_000,
      tenorDays: 90,
      strikeRate: 84,
      enhancedRatePct: 8,
    };
    const dcdPost = (extra: object = {}, forecast = fakeForecast()) =>
      post({ mode: 'A', productType: 'DCD', terms: dcdTerms, ...extra }, appWith(forecast.client));

    it('asks the forecast service for the Nifty 50, not for the FX pair', async () => {
      const forecast = fakeForecast();
      const res = await dcdPost({ trainingWindowYears: 2 }, forecast);
      expect(res.status).toBe(200);
      expect(forecast.calls).toEqual([
        {
          underlying: { symbol: '^NSEI', assetClass: 'index' },
          tenorDays: 90,
          trainingWindowYears: 2,
          samplePathCount: 500,
        },
      ]);
    });

    it('returns the fan, model card and backtest, labelled as the Nifty 50 forecast', async () => {
      const res = await dcdPost();
      const r = res.body as SimulateModeAContextResponse;
      expect(r).toMatchObject({
        kind: 'forecast_context',
        mode: 'A',
        productType: 'DCD',
        underlying: { symbol: '^NSEI', name: 'Nifty 50' },
        spot: { value: SPOT },
        horizon: { tenorDays: 90 },
        history: { status: 'unavailable' },
      });
      expect(r.fan.p50[0]).toBe(SPOT);
      expect(r.model.name).toBe('garch11-t-montecarlo');
      expect(r.backtest.bandCoverage).toBe(0.88);
      expect(r.notice).toMatch(/context only/i);
      expect(r.notice).toMatch(/USD\/INR/);
      expect(r.notice).toMatch(/Mode B/);
    });

    it('calculates no DCD payoff, risk, scenario or breakeven from the Nifty 50 paths', async () => {
      const body = (await dcdPost()).body as Record<string, unknown>;
      for (const field of [
        'cases',
        'distribution',
        'scenarios',
        'curve',
        'breakevens',
        'simulationId',
      ]) {
        expect(body, field).not.toHaveProperty(field);
      }
    });

    it('does not store the run, so there is nothing to assess, explain or chat about', async () => {
      const app = appWith(fakeForecast().client);
      const res = await post({ mode: 'A', productType: 'DCD', terms: dcdTerms }, app);
      expect(res.status).toBe(200);
      const profile = {
        name: 'A',
        age: 40,
        riskAppetite: 'high',
        horizonMonths: 12,
        lossTolerancePct: 10,
        concentrationPct: 10,
      };
      for (const simulationId of ['none', '00000000-0000-4000-8000-000000000000']) {
        const suit = await request(app).post('/api/suitability').send({ simulationId, profile });
        expect(suit.status).toBe(404);
      }
    });

    it('still fails clearly when the forecast service is down', async () => {
      const failing = fakeForecast(
        new ForecastError('AI_UNAVAILABLE', 'Forecast service is unreachable'),
      );
      const res = await dcdPost({}, failing);
      expect(res.status).toBe(503);
      expect((res.body as { error: { code: string } }).error.code).toBe('AI_UNAVAILABLE');
    });
  });

  it('shows the history as unavailable when no provider is configured', async () => {
    const res = await post({ mode: 'A', productType: 'ELN', terms: eln });
    expect(out(res).history).toEqual({
      status: 'unavailable',
      reason: 'No price history provider is configured',
    });
  });

  it('adds recent closes to the fan when they match the forecast spot', async () => {
    const history: HistoryProvider = {
      name: 'Test history',
      dailyCloses: () =>
        Promise.resolve([
          { date: '2026-09-30', close: 24_800 },
          { date: '2026-10-01', close: 24_900 },
          { date: '2026-10-02', close: SPOT },
          { date: '2026-10-03', close: 25_100 }, // after the forecast's as-of date: dropped
        ]),
    };
    const app = createApp(config, silentLogger, {
      marketData: createMarketDataService({}),
      forecast: fakeForecast().client,
      history,
    });
    const r = out(await post({ mode: 'A', productType: 'ELN', terms: eln }, app));
    expect(r.history).toEqual({
      status: 'ok',
      source: 'Test history',
      points: [
        { date: '2026-09-30', close: 24_800 },
        { date: '2026-10-01', close: 24_900 },
        { date: '2026-10-02', close: SPOT },
      ],
    });
  });

  it.each([
    ['a training window above 3 years', { trainingWindowYears: 7 }],
    ['a training window under 30 days', { trainingWindowYears: 29 / 365 }],
    ['a Mode B shock', { shockPct: -10 }],
    ['a Mode B level', { level: { source: 'manual', value: 25_000 } }],
  ])('rejects %s', async (_name, extra) => {
    const res = await post({ mode: 'A', productType: 'ELN', terms: eln, ...extra });
    expect(res.status).toBe(400);
    expect(errorBody(res).code).toBe('VALIDATION_ERROR');
  });

  it('rejects a tenor outside 30–1,095 days before calling the forecast service', async () => {
    const { client, calls } = fakeForecast();
    const res = await post(
      { mode: 'A', productType: 'ELN', terms: { ...eln, tenorDays: 20 } },
      appWith(client),
    );
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
