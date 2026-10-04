// POST /api/suitability: deterministic rules on a stored run plus the client profile.
// Mode A: low = P5 case path, base = P50. Mode B (decided 2026-10-04): low = the worst outcome
// among the scenario shocks and the RM's own shock; base = the RM's shock.

import type { SuitabilityRequest, SuitabilityResponse } from '@mindspark/shared';
import {
  assessSuitability,
  PRODUCT_RISK_RATINGS,
  type CaseOutcome,
} from '../../engines/suitability/suitability.js';
import type { PersistenceService } from '../persistence/persistenceService.js';
import type { SimulationRecord, SimulationRecords } from '../simulation/simulationRecords.js';

export interface SuitabilityService {
  assess(request: SuitabilityRequest): Promise<SuitabilityResponse>;
}

const shockLabel = (pct: number) => `${pct > 0 ? '+' : ''}${pct}% shock`;

/** The outcomes the loss and knock-in checks look at. */
export function lowAndBaseCases(record: SimulationRecord): { low: CaseOutcome; base: CaseOutcome } {
  if (record.response.mode === 'A') {
    const { low, base } = record.response.cases;
    return {
      low: {
        label: `low (P${low.percentile})`,
        returnPct: low.returnPct,
        knockedIn: low.knockedIn,
      },
      base: {
        label: `base (P${base.percentile})`,
        returnPct: base.returnPct,
        knockedIn: base.knockedIn,
      },
    };
  }
  const r = record.response;
  const own: CaseOutcome = {
    label: shockLabel(r.shock.pct),
    returnPct: r.result.returnPct,
    knockedIn: r.result.knockedIn,
  };
  const candidates: CaseOutcome[] = [
    own,
    ...r.scenarios.map((s) => ({
      label: shockLabel(s.shockPct),
      returnPct: s.returnPct,
      knockedIn: s.knockedIn,
    })),
  ];
  // Worst return; on a tie, prefer a knocked-in outcome.
  const low = candidates.reduce((worst, c) =>
    c.returnPct < worst.returnPct ||
    (c.returnPct === worst.returnPct && c.knockedIn === true && worst.knockedIn !== true)
      ? c
      : worst,
  );
  return { low, base: own };
}

export function createSuitabilityService(deps: {
  records: SimulationRecords;
  persistence: PersistenceService;
  concentrationLimitPct: number;
}): SuitabilityService {
  return {
    async assess({ simulationId, profile }) {
      const record = deps.records.get(simulationId);
      const { low, base } = lowAndBaseCases(record);
      const { verdict, flags } = assessSuitability({
        productType: record.request.productType,
        tenorDays: record.request.terms.tenorDays,
        lowCase: low,
        baseCase: base,
        profile,
        concentrationLimitPct: deps.concentrationLimitPct,
      });
      const response: SuitabilityResponse = {
        simulationId,
        verdict,
        flags,
        lowCase: low,
        productRiskRating: PRODUCT_RISK_RATINGS[record.request.productType],
        persisted: deps.persistence.enabled,
      };
      // Written before the verdict is shown: a configured database that fails fails the request.
      const ids = await deps.persistence.recordAssessment({
        record,
        profile,
        suitability: response,
      });
      // A new profile invalidates any explanation written for the previous verdict.
      deps.records.update(simulationId, {
        profile,
        suitability: response,
        explanation: undefined,
        configurationId: ids?.configurationId ?? record.configurationId,
        persistedSimulationId: ids?.simulationId,
      });
      return response;
    },
  };
}
