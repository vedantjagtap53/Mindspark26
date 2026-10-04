// Basic outcome metrics for one payoff, relative to the amount invested. Pure arithmetic only:
// breakeven, scenario tables and suitability belong to later work.

export interface OutcomeMetrics {
  /** Percent number: 0 means the amount invested is returned exactly. */
  returnPct: number;
  /** max(invested − payoff, 0) */
  lossAmount: number;
}

export function outcomeMetrics(invested: number, payoff: number): OutcomeMetrics {
  if (!Number.isFinite(invested) || invested <= 0) {
    throw new RangeError('invested must be a positive finite number');
  }
  return {
    returnPct: (payoff / invested - 1) * 100,
    lossAmount: Math.max(invested - payoff, 0),
  };
}
