// CPN payoff. PRD.md §7.2, docs/product-formulas.md:
//   Payoff = N[p + min(α · max(S_T/S_0 − 1, 0), C)], cap C optional.
// Implements the formula as written: C caps the participation return (α × upside), as a
// fraction of notional. Whether that is the intended cap meaning is still an open product
// decision in docs/product-formulas.md; do not change it here without that decision.

import type { CpnTerms } from '@mindspark/shared';
import { assertPositiveFinite, fromPct, validatePath } from '../common.js';

export interface CpnFormulaInput {
  notional: number;
  /** Protection as a fraction (1.00 = 100%). */
  protection: number;
  /** Participation as a fraction. */
  participation: number;
  /** Cap on the participation return as a fraction; `undefined` = uncapped. */
  cap?: number;
  initial: number;
  terminal: number;
}

export interface CpnFormulaResult {
  payoff: number;
  /** α × max(S_T/S_0 − 1, 0), before the cap. */
  participationReturn: number;
  /** The participation return actually paid (after the cap). */
  paidReturn: number;
  capApplied: boolean;
}

export function cpnFormula(i: CpnFormulaInput): CpnFormulaResult {
  const upside = Math.max(i.terminal / i.initial - 1, 0);
  const participationReturn = i.participation * upside;
  const capApplied = i.cap !== undefined && participationReturn > i.cap;
  const paidReturn = capApplied && i.cap !== undefined ? i.cap : participationReturn;
  return {
    payoff: i.notional * (i.protection + paidReturn),
    participationReturn,
    paidReturn,
    capApplied,
  };
}

export interface CpnPayoffResult extends CpnFormulaResult {
  initial: number;
  terminal: number;
}

export function cpnPayoff(terms: CpnTerms, path: readonly number[]): CpnPayoffResult {
  assertPositiveFinite('notional', terms.notional);
  const { s0, sT } = validatePath(path);
  const result = cpnFormula({
    notional: terms.notional,
    protection: fromPct(terms.protectionPct),
    participation: fromPct(terms.participationPct),
    cap: terms.capPct === undefined ? undefined : fromPct(terms.capPct),
    initial: s0,
    terminal: sT,
  });
  return { ...result, initial: s0, terminal: sT };
}
