// Display formatting only. Values are never recalculated here.

export function formatMoney(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatLevel(level: number, digits = 2): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(level);
}

/** A percent number (12.5 → "+12.5%"). */
export function formatPct(pct: number, digits = 1): string {
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(digits)}%`;
}

/** A fraction (0.032 → "3.2%"). */
export function formatProbability(p: number, digits = 1): string {
  return `${(p * 100).toFixed(digits)}%`;
}

export function knockInLabel(knockedIn: boolean | null): string {
  if (knockedIn === null) return 'No barrier';
  return knockedIn ? 'Knocked in' : 'Not knocked in';
}
