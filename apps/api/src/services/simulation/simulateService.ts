// Mode A and Mode B both run the same deterministic payoff engines (CLAUDE.md engineering rules).
// Mode B: one shocked terminal value. Mode A: the forecast's low/base/high case paths and sample
// paths. The service only orchestrates: inputs → engine → outcome metrics. No payoff maths here.

import { randomUUID } from 'node:crypto';
import {
  DEFAULT_SAMPLE_PATH_COUNT,
  tenorToTradingDays,
  type UnderlyingAssetClass,
  PAYOFF_CURVE_SHOCKS,
  SCENARIO_SHOCKS,
  type BreakevenPoint,
  type CpnTerms,
  type DcdTerms,
  type ElnTerms,
  type ShockOutcome,
  type ModeACaseResult,
  type SimulateModeARequest,
  type SimulateModeAContextResponse,
  type SimulateModeAResponse,
  type SimulateModeBRequest,
  type SimulateModeBResponse,
} from '@mindspark/shared';
import { cpnPayoff } from '../../engines/payoff/cpn/cpnPayoff.js';
import { dcdPayoff } from '../../engines/payoff/dcd/dcdPayoff.js';
import { elnPayoff } from '../../engines/payoff/eln/elnPayoff.js';
import { findBreakevenShocks } from '../../engines/risk/breakeven.js';
import { outcomeMetrics } from '../../engines/risk/outcome.js';
import { AppError } from '../../utils/errors.js';
import { ForecastError, type ForecastClient } from '../ai/forecastClient.js';
import type { HistoryProvider } from '../market-data/history/yahooHistoryProvider.js';
import type { MarketDataService } from '../market-data/marketDataService.js';
import { requestFanHistory } from './fanHistory.js';
import {
  buildModeACases,
  forecastRecordMetadata,
  summarizeDistribution,
  type ModeACase,
  type PathOutcome,
} from './modeAScenarios.js';
import type { SimulationRecords } from './simulationRecords.js';

export interface SimulateService {
  /** `ownerId` is the signed-in account; the run is then usable only by that account. */
  simulateModeA(
    request: SimulateModeARequest,
    ownerId?: string,
  ): Promise<SimulateModeAResponse | SimulateModeAContextResponse>;
  simulateModeB(request: SimulateModeBRequest, ownerId?: string): Promise<SimulateModeBResponse>;
}

export interface SimulateDeps {
  marketData: MarketDataService;
  /** Absent when AI_API_URL is not configured; Mode A then fails with AI_UNAVAILABLE. */
  forecast?: ForecastClient;
  /** Where runs are kept for /api/suitability, /api/explain and /api/chat. */
  records?: SimulationRecords;
  /** Daily closes for the Mode A fan chart; absent when no history provider is configured. */
  history?: HistoryProvider;
}

type Details = SimulateModeBResponse['result']['details'];

interface EngineOutcome extends PathOutcome {
  details: Details;
}

const MODE_A_NOTICE = 'Scenario simulation, not a guarantee.';

/** Engine for one Mode A product, as a path evaluator (path[0] = S_0, last = S_T). */
function modeAEvaluator(request: SimulateModeARequest): (path: readonly number[]) => EngineOutcome {
  if (request.productType === 'ELN') {
    return (path) => {
      const r = elnPayoff(request.terms, path);
      return { payoff: r.payoff, knockedIn: r.knockedIn, details: { ...r } };
    };
  }
  if (request.productType === 'DCD') {
    // DCD pays on the FX fixing at maturity only: X_T is the last value of the path.
    return (path) => {
      const r = dcdPayoff(request.terms, path[path.length - 1]!);
      return { payoff: r.payoff, knockedIn: null, details: { ...r } };
    };
  }
  return (path) => {
    const r = cpnPayoff(request.terms, path);
    return { payoff: r.payoff, knockedIn: null, details: { ...r } };
  };
}

/** The product and its terms: all that an outcome at a given level needs. */
type ProductInput =
  | { productType: 'ELN'; terms: ElnTerms }
  | { productType: 'DCD'; terms: DcdTerms }
  | { productType: 'CPN'; terms: CpnTerms };

/** What a DCD actually pays, from the DCD engine's own result (never recomputed here). */
function dcdSettlement(details: Details): NonNullable<ShockOutcome['settlement']> {
  const d = details as { settlementAmount: number; settlementCurrency: string; converted: boolean };
  return { amount: d.settlementAmount, currency: d.settlementCurrency, converted: d.converted };
}

/**
 * Payoff at maturity for each shock from `startLevel`: the chart curve, the PRD scenario table and
 * the breakevens. Shared by Mode B (starting level from market data or the RM) and Mode A (the
 * forecast's spot), so both modes show the same kind of table from the same engines.
 */
function shockTable(request: ProductInput, startLevel: number) {
  const at = (shockPct: number): ShockOutcome => {
    const o = modeBOutcome(request, startLevel, shockPct);
    return {
      shockPct,
      level: o.shockedLevel,
      payoff: o.payoff,
      returnPct: o.returnPct,
      lossAmount: o.lossAmount,
      knockedIn: o.knockedIn,
      // A DCD pays in one of two currencies; `payoff` is its deposit-currency equivalent.
      ...(request.productType === 'DCD' ? { settlement: dcdSettlement(o.details) } : {}),
    };
  };
  const breakevens: BreakevenPoint[] = findBreakevenShocks(
    (shock) => modeBOutcome(request, startLevel, shock).returnPct,
  ).map((shockPct) => ({ shockPct, level: startLevel * (1 + shockPct / 100) }));
  return {
    curve: PAYOFF_CURVE_SHOCKS.map(at),
    scenarios: SCENARIO_SHOCKS.map(at),
    breakevens,
  };
}

/**
 * One Mode B outcome: the starting level shocked by `shockPct` (a percent number) is the single
 * terminal value. The same function drives the result, the payoff curve and the scenario table.
 */
function modeBOutcome(request: ProductInput, startLevel: number, shockPct: number) {
  const shockedLevel = startLevel * (1 + shockPct / 100);
  let payoff: number;
  let invested: number;
  let knockedIn: boolean | null = null;
  let details: Details;

  switch (request.productType) {
    case 'ELN': {
      const r = elnPayoff(request.terms, [startLevel, shockedLevel]);
      payoff = r.payoff;
      knockedIn = r.knockedIn;
      invested = request.terms.notional;
      details = { ...r };
      break;
    }
    case 'CPN': {
      const r = cpnPayoff(request.terms, [startLevel, shockedLevel]);
      payoff = r.payoff;
      invested = request.terms.notional;
      details = { ...r };
      break;
    }
    case 'DCD': {
      const r = dcdPayoff(request.terms, shockedLevel);
      payoff = r.payoff;
      invested = request.terms.depositAmount;
      details = { ...r };
      break;
    }
  }
  return { shockedLevel, payoff, knockedIn, details, ...outcomeMetrics(invested, payoff) };
}

/** The only underlying the forecast service has data for. */
const NIFTY_50: { symbol: string; assetClass: UnderlyingAssetClass; name: string } = {
  symbol: '^NSEI',
  assetClass: 'index',
  name: 'Nifty 50',
};

const DCD_CONTEXT_NOTICE =
  'Nifty 50 forecast, shown for context only. A DCD pays on the USD/INR rate, not on the Nifty 50, so no DCD payoff, risk or suitability verdict is calculated from this forecast. Use Mode B (FX shock) for the DCD payoff.';

/**
 * What Mode A forecasts: the underlying (ELN, CPN). For a DCD the forecast service has no FX data,
 * so it forecasts the Nifty 50 and the result is context only (see SimulateModeAContextResponse).
 */
function forecastUnderlying(request: SimulateModeARequest): {
  symbol: string;
  assetClass: UnderlyingAssetClass;
} {
  if (request.productType === 'DCD') {
    return { symbol: NIFTY_50.symbol, assetClass: NIFTY_50.assetClass };
  }
  return request.terms.underlying;
}

const investedOf = (request: ProductInput) =>
  request.productType === 'DCD' ? request.terms.depositAmount : request.terms.notional;

function caseResult(c: ModeACase<EngineOutcome>, invested: number): ModeACaseResult {
  return {
    percentile: c.percentile,
    terminal: c.terminal,
    pathMin: c.pathMin,
    payoff: c.outcome.payoff,
    ...outcomeMetrics(invested, c.outcome.payoff),
    knockedIn: c.outcome.knockedIn,
    details: c.outcome.details,
  };
}

export function createSimulateService(deps: SimulateDeps): SimulateService {
  return {
    async simulateModeA(request, ownerId) {
      if (!deps.forecast) {
        throw new AppError('AI_UNAVAILABLE', 'The forecast service is not configured: use Mode B');
      }
      const underlying = forecastUnderlying(request);
      // History is fetched alongside the forecast, so it adds no latency.
      const history = requestFanHistory(
        deps.history,
        underlying,
        tenorToTradingDays(request.terms.tenorDays),
      );
      let forecast;
      try {
        forecast = await deps.forecast.forecast({
          underlying,
          tenorDays: request.terms.tenorDays,
          trainingWindowYears: request.trainingWindowYears,
          samplePathCount: DEFAULT_SAMPLE_PATH_COUNT,
        });
      } catch (err) {
        if (err instanceof ForecastError) {
          throw new AppError(err.code, err.message, err.details.length ? err.details : undefined);
        }
        throw err;
      }

      if (request.productType === 'DCD') {
        // Context only: nothing is evaluated, stored or sent to the AI.
        const context: SimulateModeAContextResponse = {
          kind: 'forecast_context',
          mode: 'A',
          productType: 'DCD',
          underlying: { symbol: NIFTY_50.symbol, name: NIFTY_50.name },
          spot: { value: forecast.data.spot, asOf: forecast.data.asOf },
          horizon: forecast.horizon,
          fan: forecast.fan,
          model: {
            ...forecast.model,
            trainingWindowYears: request.trainingWindowYears,
            trainingStart: forecast.data.trainingStart,
            trainingEnd: forecast.data.trainingEnd,
            observations: forecast.data.observations,
          },
          backtest: forecast.backtest,
          history: await history.match(forecast.data.spot, forecast.data.asOf),
          notice: DCD_CONTEXT_NOTICE,
        };
        return context;
      }

      const evaluate = modeAEvaluator(request);
      const invested = investedOf(request);
      const [low, base, high] = buildModeACases(forecast, evaluate).map((c) =>
        caseResult(c, invested),
      );

      const response: SimulateModeAResponse = {
        simulationId: randomUUID(),
        mode: 'A',
        productType: request.productType,
        spot: { value: forecast.data.spot, asOf: forecast.data.asOf },
        horizon: forecast.horizon,
        cases: { low: low!, base: base!, high: high! },
        distribution: summarizeDistribution(forecast, evaluate, invested),
        fan: forecast.fan,
        model: {
          ...forecast.model,
          trainingWindowYears: request.trainingWindowYears,
          trainingStart: forecast.data.trainingStart,
          trainingEnd: forecast.data.trainingEnd,
          observations: forecast.data.observations,
        },
        backtest: forecast.backtest,
        ...shockTable(request, forecast.data.spot),
        history: await history.match(forecast.data.spot, forecast.data.asOf),
        notice: MODE_A_NOTICE,
      };
      deps.records?.save({
        id: response.simulationId,
        createdAt: Date.now(),
        ownerId,
        request,
        response,
        forecastMeta: forecastRecordMetadata(forecast),
      });
      return response;
    },

    async simulateModeB(request, ownerId) {
      const level = await deps.marketData.resolveLevel(request);
      const main = modeBOutcome(request, level.value, request.shockPct);
      const table = shockTable(request, level.value);
      const response: SimulateModeBResponse = {
        simulationId: randomUUID(),
        mode: 'B',
        productType: request.productType,
        level,
        shock: { pct: request.shockPct, shockedLevel: main.shockedLevel },
        result: {
          payoff: main.payoff,
          returnPct: main.returnPct,
          lossAmount: main.lossAmount,
          knockedIn: main.knockedIn,
          details: main.details,
        },
        ...table,
      };
      deps.records?.save({
        id: response.simulationId,
        createdAt: Date.now(),
        ownerId,
        request,
        response,
      });
      return response;
    },
  };
}
