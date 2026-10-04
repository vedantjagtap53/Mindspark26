// ELN (reverse convertible) payoff. PRD.md §7.2, docs/product-formulas.md:
//   Payoff = N(1 + cT) − 1_KI · N · max(K − S_T, 0) / K
// Plain ELN: the loss term always applies (1_KI = 1 whenever S_T < K).
// Barrier ELN: touching the barrier counts as knock-in (S ≤ B).
//   European: checks S_T only. American: checks every level after S_0 on the path.
//   Mode B passes [S_0, shocked], so both types test the shocked level (settled convention).

import { tenorYears, type ElnBarrierType, type ElnTerms } from '@mindspark/shared';
import {
  assertPositiveFinite,
  fromPct,
  levelFromPct,
  lessOrEqual,
  validatePath,
} from '../common.js';

export interface ElnFormulaInput {
  notional: number;
  /** Annual coupon as a fraction (0.10 = 10%). */
  coupon: number;
  /** Year fraction. */
  t: number;
  strike: number;
  terminal: number;
  /** Whether the loss term applies (plain ELN, or barrier knocked in). */
  lossApplies: boolean;
}

export interface ElnFormulaResult {
  payoff: number;
  couponAmount: number;
  principalRepaid: number;
}

/** The ELN formula on normalized values (fractions, year fraction, absolute levels). */
export function elnFormula(i: ElnFormulaInput): ElnFormulaResult {
  const couponAmount = i.notional * i.coupon * i.t;
  const shortfall = lessOrEqual(i.strike, i.terminal) ? 0 : (i.strike - i.terminal) / i.strike;
  const principalRepaid = i.notional * (1 - (i.lossApplies ? shortfall : 0));
  return { payoff: principalRepaid + couponAmount, couponAmount, principalRepaid };
}

/** Knock-in test on a path (path[0] = S_0). Touching the barrier counts. */
export function isBarrierKnockedIn(
  path: readonly number[],
  barrierLevel: number,
  type: ElnBarrierType,
): boolean {
  if (type === 'European') return lessOrEqual(path[path.length - 1]!, barrierLevel);
  for (let i = 1; i < path.length; i++) if (lessOrEqual(path[i]!, barrierLevel)) return true;
  return false;
}

export interface ElnPayoffResult extends ElnFormulaResult {
  strikeLevel: number;
  /** `null` for a plain ELN. */
  barrierLevel: number | null;
  terminal: number;
  /** `null` for a plain ELN (no barrier). */
  knockedIn: boolean | null;
}

export function elnPayoff(terms: ElnTerms, path: readonly number[]): ElnPayoffResult {
  assertPositiveFinite('notional', terms.notional);
  const { s0, sT } = validatePath(path);
  const strikeLevel = levelFromPct(terms.strikePct, s0);

  let barrierLevel: number | null = null;
  let knockedIn: boolean | null = null;
  if (terms.barrierPct !== undefined && terms.barrierType !== undefined) {
    barrierLevel = levelFromPct(terms.barrierPct, s0);
    knockedIn = isBarrierKnockedIn(path, barrierLevel, terms.barrierType);
  }

  const result = elnFormula({
    notional: terms.notional,
    coupon: fromPct(terms.couponPct),
    t: tenorYears(terms.tenorDays),
    strike: strikeLevel,
    terminal: sT,
    lossApplies: knockedIn ?? true,
  });
  return { ...result, strikeLevel, barrierLevel, terminal: sT, knockedIn };
}
