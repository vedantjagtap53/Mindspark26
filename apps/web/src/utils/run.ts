// Reading a stored run for display. Positions chart guide lines from the RM's own terms; every
// payoff, return and probability shown comes from the backend response.
import type { SessionRun } from '../types/session';
import type { ChartMarker } from '../components/charts/PayoffChart';

type Terms = Record<string, unknown>;
const num = (t: Terms, k: string): number | null => {
  const v = t[k];
  return typeof v === 'number' ? v : null;
};
const str = (t: Terms, k: string): string | null => {
  const v = t[k];
  return typeof v === 'string' ? v : null;
};

/** Currency of the payoff: the deposit currency for DCD, INR for the Nifty-linked notes. */
export function currencyOf(run: SessionRun): string {
  if (run.product === 'DCD') return str(run.terms, 'depositCurrency')?.toUpperCase() ?? 'USD';
  return 'INR';
}

export function underlyingLabel(run: SessionRun): string {
  if (run.product === 'DCD') {
    const dep = str(run.terms, 'depositCurrency') ?? '?';
    const alt = str(run.terms, 'alternateCurrency') ?? '?';
    return `${dep.toUpperCase()}/${alt.toUpperCase()}`;
  }
  const u = run.terms.underlying as { symbol?: string } | undefined;
  return u?.symbol ?? 'Underlying';
}

export function investedOf(run: SessionRun): number | null {
  return num(run.terms, run.product === 'DCD' ? 'depositAmount' : 'notional');
}

/** The starting level the backend used (S_0, or FX spot for DCD). */
export function startLevelOf(run: SessionRun): number {
  return run.response.mode === 'A' ? run.response.spot.value : run.response.level.value;
}

/** Strike and barrier guide lines on the shock axis of the payoff chart. */
export function payoffMarkers(run: SessionRun): ChartMarker[] {
  const t = run.terms;
  if (run.product === 'ELN') {
    const markers: ChartMarker[] = [];
    const strike = num(t, 'strikePct');
    const barrier = num(t, 'barrierPct');
    if (strike !== null) {
      markers.push({ shockPct: strike - 100, label: `Strike ${strike}%`, tone: 'strike' });
    }
    if (barrier !== null) {
      markers.push({ shockPct: barrier - 100, label: `Barrier ${barrier}%`, tone: 'barrier' });
    }
    return markers;
  }
  if (run.product === 'DCD') {
    const strike = num(t, 'strikeRate');
    const spot = startLevelOf(run);
    return strike === null || !(spot > 0)
      ? []
      : [{ shockPct: (strike / spot - 1) * 100, label: `Strike ${strike}`, tone: 'strike' }];
  }
  return [];
}

/** Strike and barrier guide lines in level terms for the fan chart (ELN, Mode A). */
export function fanLines(run: SessionRun) {
  const spot = startLevelOf(run);
  const lines: Array<{ level: number; label: string; tone: 'strike' | 'barrier' }> = [];
  if (run.product !== 'ELN') return lines;
  const strike = num(run.terms, 'strikePct');
  const barrier = num(run.terms, 'barrierPct');
  if (strike !== null) {
    lines.push({ level: (spot * strike) / 100, label: `Strike ${strike}%`, tone: 'strike' });
  }
  if (barrier !== null) {
    lines.push({ level: (spot * barrier) / 100, label: `Barrier ${barrier}%`, tone: 'barrier' });
  }
  return lines;
}

export function modeLabel(run: SessionRun): string {
  return run.response.mode === 'A' ? 'Mode A · forecast' : 'Mode B · shock';
}
