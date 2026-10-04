// Writes the audit record of a simulation (PRD §7.2 "Session and record keeping") through the
// repository interfaces. Business logic never sees the Supabase SDK. There is no fallback store:
// when Supabase is configured and a write fails, the request fails with a clear error;
// when it is not configured (development, tests) nothing is persisted and the caller is told so.
//
// A simulation row is immutable and carries a frozen copy of the client as entered (name, age and
// the rule fields), so the whole record (configuration, simulation with its risk results, verdict)
// is written when the verdict is computed, i.e. when the profile is known. A re-assessment with
// another profile writes another simulation row.

import type { ClientProfile, SuitabilityResponse } from '@mindspark/shared';
import {
  RepositoryError,
  type ProductConfigurationInput,
  type Repositories,
  type RiskResultInput,
  type SimulationInput,
} from '../../repositories/interfaces/index.js';
import { AppError } from '../../utils/errors.js';
import type { SimulationRecord } from '../simulation/simulationRecords.js';

/** Bump when the suitability rules (docs/suitability-rules.md) change; stored with each verdict. */
export const SUITABILITY_RULES_VERSION = '2026-10-04';

export interface PersistedIds {
  configurationId: string;
  simulationId: string;
}

export interface PersistenceService {
  /** False when no database is configured: nothing is written. */
  readonly enabled: boolean;
  /** Writes configuration (once per run), simulation, risk results, profile snapshot and verdict. */
  recordAssessment(input: {
    record: SimulationRecord;
    profile: ClientProfile;
    suitability: SuitabilityResponse;
  }): Promise<PersistedIds | null>;
  recordExplanation(
    persistedSimulationId: string,
    explanation: { text: string; model: string; sources: string[] },
  ): Promise<void>;
}

/** Maps a database-neutral repository failure to the API error the client sees. */
export function toAppError(err: unknown): never {
  if (err instanceof AppError) throw err;
  if (err instanceof RepositoryError) {
    switch (err.kind) {
      case 'not_configured':
        throw new AppError('DATABASE_NOT_CONFIGURED', err.message);
      case 'conflict':
        throw new AppError('CONFLICT', err.message);
      case 'invalid_reference':
        throw new AppError('NOT_FOUND', err.message);
      case 'invalid_input':
        throw new AppError('VALIDATION_ERROR', err.message);
      case 'unavailable':
        throw new AppError('DATABASE_ERROR', `The database is unavailable: ${err.message}`);
    }
  }
  throw err;
}

function configurationInput(record: SimulationRecord): ProductConfigurationInput {
  if (record.request.productType === 'DCD') {
    const t = record.request.terms;
    return {
      productType: 'DCD',
      underlyingSymbol: null,
      depositCurrency: t.depositCurrency,
      alternateCurrency: t.alternateCurrency,
      tenorDays: t.tenorDays,
      notional: t.depositAmount,
      terms: { ...t },
    };
  }
  const t = record.request.terms;
  return {
    productType: record.request.productType,
    underlyingSymbol: t.underlying.symbol,
    depositCurrency: null,
    alternateCurrency: null,
    tenorDays: t.tenorDays,
    notional: t.notional,
    terms: { ...t },
  };
}

function riskResults(record: SimulationRecord): RiskResultInput[] {
  const r = record.response;
  if (r.mode === 'A') {
    return (['low', 'base', 'high'] as const).map((scenario) => {
      const c = r.cases[scenario];
      return {
        scenario,
        percentile: c.percentile,
        terminal: c.terminal,
        pathMin: c.pathMin,
        payoff: c.payoff,
        returnPct: c.returnPct,
        lossAmount: c.lossAmount,
        knockedIn: c.knockedIn,
        details: { ...c.details },
      };
    });
  }
  return [
    {
      scenario: 'shock',
      percentile: null,
      terminal: r.shock.shockedLevel,
      pathMin: null,
      payoff: r.result.payoff,
      returnPct: r.result.returnPct,
      lossAmount: r.result.lossAmount,
      knockedIn: r.result.knockedIn,
      details: { ...r.result.details },
    },
  ];
}

function simulationInput(
  record: SimulationRecord,
  configurationId: string,
  profile: ClientProfile,
): SimulationInput {
  const base = { configurationId, profileSnapshot: profile };
  const results = riskResults(record);
  const r = record.response;
  if (r.mode === 'A') {
    return {
      ...base,
      mode: 'A',
      riskResults: results,
      trainingWindowYears: r.model.trainingWindowYears,
      // No sample paths and no fan (PRD §7.2): metadata only.
      forecastMeta: record.forecastMeta ?? {},
      pathCount: r.distribution.pathCount,
      probabilityOfLoss: r.distribution.probabilityOfLoss,
      probabilityOfKnockIn: r.distribution.probabilityOfKnockIn,
      payoffQuantiles: r.distribution.payoffQuantiles,
    };
  }
  return {
    ...base,
    mode: 'B',
    riskResults: results,
    levelValue: r.level.value,
    levelSource: r.level.source,
    levelAsOf: r.level.asOf,
    shockPct: r.shock.pct,
    shockedLevel: r.shock.shockedLevel,
  };
}

export function createPersistenceService(repositories?: Repositories): PersistenceService {
  return {
    enabled: repositories !== undefined,

    async recordAssessment({ record, profile, suitability }) {
      if (!repositories) return null;
      try {
        const configurationId =
          record.configurationId ??
          (await repositories.productConfigurations.create(configurationInput(record)));
        const simulationId = await repositories.simulations.record(
          simulationInput(record, configurationId, profile),
        );
        await repositories.suitabilityResults.create({
          simulationId,
          verdict: suitability.verdict,
          flags: suitability.flags.map((f) => ({
            rule: f.rule,
            hard: f.severity === 'not_suitable',
            reason: f.message,
          })),
          rulesVersion: SUITABILITY_RULES_VERSION,
        });
        return { configurationId, simulationId };
      } catch (err) {
        return toAppError(err);
      }
    },

    async recordExplanation(persistedSimulationId, { text, model, sources }) {
      if (!repositories) return;
      try {
        await repositories.explanations.create({
          simulationId: persistedSimulationId,
          text,
          model,
          sources,
        });
      } catch (err) {
        toAppError(err);
      }
    },
  };
}
