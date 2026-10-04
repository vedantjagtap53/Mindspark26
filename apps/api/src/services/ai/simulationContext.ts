// Builds the AI service's SimulationContext (services/rag/rag/schemas.py) from a stored run.
// Only numbers the backend computed are sent: the AI explains them and never recalculates.
// No client reference or name is sent, only the four profile fields the rules use.

import type { SimulationRecord } from '../simulation/simulationRecords.js';
import { AppError } from '../../utils/errors.js';

type Terms =
  | {
      product: 'ELN';
      tenor_days: number;
      underlying: string;
      notional: number;
      strike_pct: number;
      barrier_pct?: number;
      barrier_type?: 'european' | 'american';
      coupon_pct_pa: number;
    }
  | {
      product: 'DCD';
      tenor_days: number;
      currency_pair: string;
      deposit_amount: number;
      strike_rate: number;
      enhanced_rate_pct_pa: number;
    }
  | {
      product: 'CPN';
      tenor_days: number;
      underlying: string;
      notional: number;
      protection_pct: number;
      participation_pct: number;
      cap_pct?: number;
    };

export interface RagCase {
  label: string;
  shock_pct?: number;
  terminal_level?: number;
  payoff: number;
  return_pct: number;
  knocked_in?: boolean | null;
}

export interface RagSimulationContext {
  simulation_id: string;
  mode: 'A' | 'B';
  currency: string;
  terms: Terms;
  profile: {
    risk_appetite: 'low' | 'medium' | 'high';
    investment_horizon_days: number;
    loss_tolerance_pct: number;
    concentration_pct: number;
  };
  cases: RagCase[];
  suitability: {
    verdict: 'Suitable' | 'Caution' | 'Not suitable';
    flags: Array<{ rule: string; severity: 'caution' | 'not_suitable'; message: string }>;
  };
  distribution?: {
    prob_loss: number;
    prob_knock_in?: number | null;
    payoff_p5: number;
    payoff_p50: number;
    payoff_p95: number;
  };
  forecast_meta?: {
    model_name: string;
    training_start: string;
    training_end: string;
    as_of: string;
    drift_assumption: string;
    backtest_band_coverage: number;
    backtest_base_mape: number;
    backtest_naive_mape: number;
  };
}

function termsOf(record: SimulationRecord): Terms {
  const { request } = record;
  switch (request.productType) {
    case 'ELN': {
      const t = request.terms;
      return {
        product: 'ELN',
        tenor_days: t.tenorDays,
        underlying: t.underlying.symbol,
        notional: t.notional,
        strike_pct: t.strikePct,
        ...(t.barrierPct !== undefined && t.barrierType !== undefined
          ? {
              barrier_pct: t.barrierPct,
              barrier_type: t.barrierType === 'American' ? 'american' : 'european',
            }
          : {}),
        coupon_pct_pa: t.couponPct,
      };
    }
    case 'DCD': {
      const t = request.terms;
      return {
        product: 'DCD',
        tenor_days: t.tenorDays,
        currency_pair: `${t.depositCurrency}/${t.alternateCurrency}`,
        deposit_amount: t.depositAmount,
        strike_rate: t.strikeRate,
        enhanced_rate_pct_pa: t.enhancedRatePct,
      };
    }
    case 'CPN': {
      const t = request.terms;
      return {
        product: 'CPN',
        tenor_days: t.tenorDays,
        underlying: t.underlying.symbol,
        notional: t.notional,
        protection_pct: t.protectionPct,
        participation_pct: t.participationPct,
        ...(t.capPct !== undefined ? { cap_pct: t.capPct } : {}),
      };
    }
  }
}

const shockLabel = (pct: number) => `${pct > 0 ? '+' : ''}${pct}%`;

/** Requires the suitability check to have run: the AI explains the verdict, it never sets it. */
export function buildRagContext(record: SimulationRecord): RagSimulationContext {
  const { profile, suitability } = record;
  if (!profile || !suitability) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Run the suitability check for this simulation first (POST /api/suitability)',
    );
  }
  const base = {
    simulation_id: record.id,
    currency: record.request.productType === 'DCD' ? record.request.terms.depositCurrency : 'INR',
    terms: termsOf(record),
    profile: {
      risk_appetite: profile.riskAppetite,
      investment_horizon_days: Math.round((profile.horizonMonths * 365) / 12),
      loss_tolerance_pct: profile.lossTolerancePct,
      concentration_pct: profile.concentrationPct,
    },
    suitability: { verdict: suitability.verdict, flags: suitability.flags },
  };

  if (record.response.mode === 'A') {
    const r = record.response;
    const caseOf = (label: 'low' | 'base' | 'high', c: (typeof r.cases)['low']): RagCase => ({
      label,
      terminal_level: c.terminal,
      payoff: c.payoff,
      return_pct: c.returnPct,
      knocked_in: c.knockedIn,
    });
    return {
      ...base,
      mode: 'A',
      cases: [
        caseOf('low', r.cases.low),
        caseOf('base', r.cases.base),
        caseOf('high', r.cases.high),
      ],
      distribution: {
        prob_loss: r.distribution.probabilityOfLoss,
        prob_knock_in: r.distribution.probabilityOfKnockIn,
        payoff_p5: r.distribution.payoffQuantiles.p5,
        payoff_p50: r.distribution.payoffQuantiles.p50,
        payoff_p95: r.distribution.payoffQuantiles.p95,
      },
      forecast_meta: {
        model_name: `${r.model.name} v${r.model.version}`,
        training_start: r.model.trainingStart.slice(0, 10),
        training_end: r.model.trainingEnd.slice(0, 10),
        as_of: r.spot.asOf.slice(0, 10),
        drift_assumption: `${r.model.drift.method}, ${(r.model.drift.annualized * 100).toFixed(2)}% a year`,
        backtest_band_coverage: r.backtest.bandCoverage,
        backtest_base_mape: r.backtest.baseMape,
        backtest_naive_mape: r.backtest.naiveMape,
      },
    };
  }

  const r = record.response;
  const cases: RagCase[] = r.scenarios.map((s) => ({
    label: shockLabel(s.shockPct),
    shock_pct: s.shockPct,
    terminal_level: s.level,
    payoff: s.payoff,
    return_pct: s.returnPct,
    knocked_in: s.knockedIn,
  }));
  if (!r.scenarios.some((s) => s.shockPct === r.shock.pct)) {
    cases.push({
      label: `${shockLabel(r.shock.pct)} (RM shock)`,
      shock_pct: r.shock.pct,
      terminal_level: r.shock.shockedLevel,
      payoff: r.result.payoff,
      return_pct: r.result.returnPct,
      knocked_in: r.result.knockedIn,
    });
  }
  return { ...base, mode: 'B', cases };
}
