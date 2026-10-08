// Read-only view of persisted simulations: every account's runs for the admin, and the shape a
// user's own saved-runs list reuses.
import type { AuditSimulation, SavedRunDetail } from '@mindspark/shared';
import type { Repositories, SimulationRecord } from '../../repositories/interfaces/index.js';
import { AppError } from '../../utils/errors.js';
import { toAppError } from '../persistence/persistenceService.js';

export const AUDIT_DEFAULT_LIMIT = 50;
export const AUDIT_MAX_LIMIT = 200;

export interface AuditService {
  recentSimulations(limit?: number): Promise<AuditSimulation[]>;
  /** Any account's run, in full. NOT_FOUND when there is no such run. */
  simulation(id: string): Promise<SavedRunDetail>;
}

export function toAuditSimulation(r: SimulationRecord): AuditSimulation {
  return {
    id: r.id,
    createdAt: r.createdAt,
    user: r.owner,
    mode: r.mode,
    productType: r.configuration.productType,
    underlyingSymbol: r.configuration.underlyingSymbol,
    currencyPair:
      r.configuration.depositCurrency && r.configuration.alternateCurrency
        ? `${r.configuration.depositCurrency}/${r.configuration.alternateCurrency}`
        : null,
    tenorDays: r.configuration.tenorDays,
    notional: r.configuration.notional,
    terms: r.configuration.terms,
    inputs:
      r.mode === 'B'
        ? {
            levelValue: r.levelValue,
            levelSource: r.levelSource,
            shockPct: r.shockPct,
            shockedLevel: r.shockedLevel,
            trainingWindowYears: null,
          }
        : {
            levelValue: null,
            levelSource: null,
            shockPct: null,
            shockedLevel: null,
            trainingWindowYears: r.trainingWindowYears,
          },
    client: r.profileSnapshot,
    results: r.riskResults.map((x) => ({
      scenario: x.scenario,
      payoff: x.payoff,
      returnPct: x.returnPct,
      lossAmount: x.lossAmount,
      knockedIn: x.knockedIn,
    })),
    verdict: r.suitability?.verdict ?? null,
    flags: r.suitability?.flags ?? [],
    explanationCount: r.explanations.length,
  };
}

/** The full stored record of one run, for the saved-run view and its printed memo. */
export function toSavedRunDetail(r: SimulationRecord): SavedRunDetail {
  return {
    ...toAuditSimulation(r),
    levelAsOf: r.mode === 'B' ? r.levelAsOf : null,
    cases: r.riskResults.map((x) => ({
      scenario: x.scenario,
      percentile: x.percentile,
      terminal: x.terminal,
      pathMin: x.pathMin,
      payoff: x.payoff,
      returnPct: x.returnPct,
      lossAmount: x.lossAmount,
      knockedIn: x.knockedIn,
    })),
    distribution:
      r.mode === 'A'
        ? {
            pathCount: r.pathCount,
            probabilityOfLoss: r.probabilityOfLoss,
            probabilityOfKnockIn: r.probabilityOfKnockIn,
            payoffQuantiles: { ...r.payoffQuantiles },
          }
        : null,
    forecast: r.mode === 'A' ? r.forecastMeta : null,
    rulesVersion: r.suitability?.rulesVersion ?? null,
    assessedAt: r.suitability?.createdAt ?? null,
    explanations: [...r.explanations]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((e) => ({ createdAt: e.createdAt, text: e.text, model: e.model, sources: e.sources })),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads one stored run; null when there is none. A malformed id is treated like a missing one,
 * so the response never says more than "no such run".
 */
export async function findSimulation(
  repositories: Repositories,
  id: string,
): Promise<SimulationRecord | null> {
  if (!UUID.test(id)) return null;
  try {
    return await repositories.simulations.getById(id.toLowerCase());
  } catch (err) {
    return toAppError(err);
  }
}

export const runNotFound = () => new AppError('NOT_FOUND', 'Saved run not found');

export function createAuditService(repositories?: Repositories): AuditService {
  return {
    async simulation(id) {
      if (!repositories) {
        throw new AppError(
          'DATABASE_NOT_CONFIGURED',
          'The audit view needs the database: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
        );
      }
      const record = await findSimulation(repositories, id);
      if (!record) throw runNotFound();
      return toSavedRunDetail(record);
    },

    async recentSimulations(limit = AUDIT_DEFAULT_LIMIT) {
      if (!repositories) {
        throw new AppError(
          'DATABASE_NOT_CONFIGURED',
          'The audit view needs the database: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
        );
      }
      try {
        const records = await repositories.simulations.listRecent(
          Math.min(Math.max(1, Math.trunc(limit)), AUDIT_MAX_LIMIT),
        );
        return records.map(toAuditSimulation);
      } catch (err) {
        return toAppError(err);
      }
    },
  };
}
