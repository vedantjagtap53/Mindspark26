// Breakeven points of a payoff, found by scanning the return across underlying moves and
// bisecting wherever it crosses from a loss to no loss (or back). Pure: the caller supplies the
// return function, so every product and both modes use the same search.

export interface BreakevenOptions {
  /** Lowest shock scanned, percent (must stay above -100). Default -99. */
  minShockPct?: number;
  /** Highest shock scanned, percent. Default +100. */
  maxShockPct?: number;
  /** Scan step in percent points. Default 0.25. */
  stepPct?: number;
}

/** A return below this (percent) counts as a loss; absorbs floating-point noise around 0. */
const LOSS_EPSILON = 1e-9;
const BISECTION_ROUNDS = 40;

/**
 * Shocks (percent, ascending) at which the outcome flips between loss and no loss.
 * Empty when it never does within the scanned range, e.g. a fully protected note (never a loss) or
 * a payoff that loses everywhere in range.
 *
 * At a cliff (a knock-in barrier, where the payoff jumps) the result is the cliff itself, to
 * within the bisection precision.
 */
export function findBreakevenShocks(
  returnPctAt: (shockPct: number) => number,
  options: BreakevenOptions = {},
): number[] {
  const min = options.minShockPct ?? -99;
  const max = options.maxShockPct ?? 100;
  const step = options.stepPct ?? 0.25;
  if (!(min > -100) || !(max > min) || !(step > 0)) {
    throw new RangeError('breakeven scan needs -100 < min < max and a positive step');
  }

  const isLoss = (shock: number) => returnPctAt(shock) < -LOSS_EPSILON;
  const crossings: number[] = [];
  let lo = min;
  let loIsLoss = isLoss(lo);
  for (let i = 1; ; i++) {
    const hi = Math.min(min + i * step, max);
    const hiIsLoss = isLoss(hi);
    if (hiIsLoss !== loIsLoss) {
      // Bisect between a loss point and a no-loss point to locate the flip.
      let a = lo;
      let b = hi;
      for (let round = 0; round < BISECTION_ROUNDS; round++) {
        const mid = (a + b) / 2;
        if (isLoss(mid) === loIsLoss) a = mid;
        else b = mid;
      }
      crossings.push(Number(((a + b) / 2).toFixed(6)));
    }
    if (hi >= max) break;
    lo = hi;
    loIsLoss = hiIsLoss;
  }
  return crossings;
}
