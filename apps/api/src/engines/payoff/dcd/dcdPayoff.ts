// DCD payoff. PRD.md §7.2, docs/product-formulas.md:
//   Payoff (deposit currency) = N(1 + cT) · min(1, K / X_T)
// K and X_T are alternate-currency units per 1 deposit-currency unit.
// X_T ≤ K: repaid N(1 + cT) in the deposit currency.
// X_T > K: repaid N(1 + cT) · K in the alternate currency, worth N(1 + cT) · K / X_T.

import { tenorYears, type DcdTerms } from '@mindspark/shared';
import { assertPositiveFinite, fromPct, lessOrEqual } from '../common.js';

export interface DcdFormulaInput {
  deposit: number;
  /** Annual enhanced rate as a fraction. */
  rate: number;
  t: number;
  strikeRate: number;
  terminalRate: number;
}

export interface DcdFormulaResult {
  /** Value in the deposit currency (base-currency equivalent when converted). */
  payoff: number;
  /** N(1 + cT), in the deposit currency. */
  amountDue: number;
  converted: boolean;
  /** Amount actually repaid, in the settlement currency. */
  settlementAmount: number;
}

export function dcdFormula(i: DcdFormulaInput): DcdFormulaResult {
  const amountDue = i.deposit * (1 + i.rate * i.t);
  if (lessOrEqual(i.terminalRate, i.strikeRate)) {
    return { payoff: amountDue, amountDue, converted: false, settlementAmount: amountDue };
  }
  const settlementAmount = amountDue * i.strikeRate;
  return {
    payoff: settlementAmount / i.terminalRate,
    amountDue,
    converted: true,
    settlementAmount,
  };
}

export interface DcdPayoffResult extends DcdFormulaResult {
  settlementCurrency: string;
  terminalRate: number;
}

export function dcdPayoff(terms: DcdTerms, terminalRate: number): DcdPayoffResult {
  assertPositiveFinite('depositAmount', terms.depositAmount);
  assertPositiveFinite('strikeRate', terms.strikeRate);
  assertPositiveFinite('terminalRate', terminalRate);
  const result = dcdFormula({
    deposit: terms.depositAmount,
    rate: fromPct(terms.enhancedRatePct),
    t: tenorYears(terms.tenorDays),
    strikeRate: terms.strikeRate,
    terminalRate,
  });
  return {
    ...result,
    settlementCurrency: result.converted ? terms.alternateCurrency : terms.depositCurrency,
    terminalRate,
  };
}
