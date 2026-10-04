// Shared helpers for the deterministic payoff engines. No I/O, no market data, no randomness.

export class PayoffInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayoffInputError';
  }
}

/** Percent number → fraction (95 → 0.95). Each percent field is converted exactly once. */
export const fromPct = (pct: number): number => pct / 100;

/** Level from a percent of S_0, e.g. strike 95% of 25,000. Multiplies before dividing to limit rounding. */
export const levelFromPct = (pct: number, s0: number): number => (pct * s0) / 100;

/**
 * Relative tolerance for boundary comparisons (S_T = K, S_T = B, X_T = K). Values this close
 * are treated as equal so that a level derived as `pct × S_0 / 100` is not missed by a rounding
 * error. It is far below any price precision a market quotes.
 */
export const BOUNDARY_REL_TOLERANCE = 1e-9;

/** `a <= b`, counting values within the boundary tolerance as equal. */
export function lessOrEqual(a: number, b: number): boolean {
  return a <= b || Math.abs(a - b) <= BOUNDARY_REL_TOLERANCE * Math.max(Math.abs(a), Math.abs(b));
}

export function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new PayoffInputError(`${name} must be a positive finite number`);
  }
}

/** Underlying path: path[0] = S_0 (trade date), last = S_T. Mode B passes [S_0, shocked level]. */
export function validatePath(path: readonly number[]): { s0: number; sT: number } {
  if (path.length < 2)
    throw new PayoffInputError('path must contain S_0 and at least one more level');
  path.forEach((v, i) => assertPositiveFinite(`path[${i}]`, v));
  return { s0: path[0]!, sT: path[path.length - 1]! };
}
