// Deterministic suitability rules (PRD §7.2, docs/suitability-rules.md). Pure: no I/O, no LLM.
// Decided by Karan 2026-10-04: hard flags are low-case loss above tolerance and a High-risk
// product for a low appetite; everything else raised is Caution. Concentration limit is fixed
// (default 25%). Mode B low case is the worst outcome among the scenario shocks and the RM's shock.

import type {
  SuitabilityProfile,
  ProductType,
  SuitabilityFlag,
  SuitabilityVerdict,
} from '@mindspark/shared';

export const PRODUCT_RISK_RATINGS: Record<ProductType, 'Low' | 'High'> = {
  CPN: 'Low',
  DCD: 'High',
  ELN: 'High',
};

const DAYS_PER_MONTH = 365 / 12;

export interface CaseOutcome {
  label: string;
  /** Percent number relative to the amount invested. */
  returnPct: number;
  /** `null` when the product has no barrier. */
  knockedIn: boolean | null;
}

export interface SuitabilityInput {
  productType: ProductType;
  tenorDays: number;
  lowCase: CaseOutcome;
  baseCase: CaseOutcome;
  /** Only the rule fields: name and age are display-only and never reach the rules. */
  profile: SuitabilityProfile;
  concentrationLimitPct: number;
}

export interface SuitabilityResult {
  verdict: SuitabilityVerdict;
  flags: SuitabilityFlag[];
}

const pct = (v: number) => `${Number(v.toFixed(1))}%`;

export function assessSuitability(input: SuitabilityInput): SuitabilityResult {
  const { profile, lowCase, baseCase } = input;
  const flags: SuitabilityFlag[] = [];

  // 1. Low-case loss above the client's loss tolerance (hard).
  const lowLossPct = Math.max(-lowCase.returnPct, 0);
  if (lowLossPct > profile.lossTolerancePct) {
    flags.push({
      rule: 'low_case_loss',
      severity: 'not_suitable',
      message: `Low-case loss of ${pct(lowLossPct)} (${lowCase.label}) exceeds the client's loss tolerance of ${pct(profile.lossTolerancePct)}`,
    });
  }

  // 2. ELN: barrier knocked in in the low or base case.
  if (input.productType === 'ELN') {
    const hit = [lowCase, baseCase].filter((c) => c.knockedIn === true).map((c) => c.label);
    if (hit.length > 0) {
      flags.push({
        rule: 'barrier_knock_in',
        severity: 'caution',
        message: `The barrier is knocked in in the ${hit.join(' and ')} case`,
      });
    }
  }

  // 3. Tenor longer than the investment horizon.
  const horizonDays = profile.horizonMonths * DAYS_PER_MONTH;
  if (input.tenorDays > horizonDays) {
    flags.push({
      rule: 'tenor_vs_horizon',
      severity: 'caution',
      message: `Tenor of ${input.tenorDays} days is longer than the client's ${profile.horizonMonths}-month horizon (about ${Math.round(horizonDays)} days)`,
    });
  }

  // 4. Exposure above the concentration limit.
  if (profile.concentrationPct > input.concentrationLimitPct) {
    flags.push({
      rule: 'concentration',
      severity: 'caution',
      message: `Concentration of ${pct(profile.concentrationPct)} is above the ${pct(input.concentrationLimitPct)} limit`,
    });
  }

  // 5. Product risk rating above the client's risk appetite.
  const rating = PRODUCT_RISK_RATINGS[input.productType];
  if (rating === 'High' && profile.riskAppetite !== 'high') {
    flags.push({
      rule: 'risk_vs_appetite',
      severity: profile.riskAppetite === 'low' ? 'not_suitable' : 'caution',
      message: `${input.productType} is rated High risk; the client's risk appetite is ${profile.riskAppetite}`,
    });
  }

  const verdict: SuitabilityVerdict = flags.some((f) => f.severity === 'not_suitable')
    ? 'Not suitable'
    : flags.length > 0
      ? 'Caution'
      : 'Suitable';
  return { verdict, flags };
}
