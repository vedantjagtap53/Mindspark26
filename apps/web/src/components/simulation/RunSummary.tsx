// Headline figures of a run, straight from the backend response. Mode A is always worded as a
// range (PRD: "Base ₹X, likely range ₹L–₹H"); every run carries the not-a-guarantee notice.
import { Info } from 'lucide-react';
import type { SessionRun } from '../../types/session';
import {
  formatLevel,
  formatMoney,
  formatPct,
  formatProbability,
  knockInLabel,
} from '../../utils/format';
import { currencyOf, modeLabel, underlyingLabel } from '../../utils/run';
import { Metric } from '../ui';

export function RunSummary({ run }: { run: SessionRun }) {
  const ccy = currencyOf(run);
  const r = run.response;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-[var(--ink-muted)]">
        <span className="font-bold text-[var(--ink-primary)]">
          {run.product} · {underlyingLabel(run)}
        </span>
        <span>{modeLabel(run)}</span>
        {r.mode === 'A' ? (
          <span>
            Spot {formatLevel(r.spot.value)} (close {r.spot.asOf}) · {r.horizon.tradingDays} trading
            days
          </span>
        ) : (
          <span>
            Start {formatLevel(r.level.value)} ({r.level.source}
            {r.level.asOf ? `, ${r.level.asOf}` : ''}) → {formatLevel(r.shock.shockedLevel)} at{' '}
            {formatPct(r.shock.pct)}
          </span>
        )}
      </div>

      {r.mode === 'A' ? (
        <>
          <p className="text-sm font-serif">
            Base <strong>{formatMoney(r.cases.base.payoff, ccy)}</strong>, likely range{' '}
            <strong>
              {formatMoney(r.distribution.payoffQuantiles.p5, ccy)}–
              {formatMoney(r.distribution.payoffQuantiles.p95, ccy)}
            </strong>{' '}
            (5th–95th percentile of {r.distribution.pathCount} paths).
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Metric
              label="Base payoff (P50 path)"
              value={formatMoney(r.cases.base.payoff, ccy)}
              note={formatPct(r.cases.base.returnPct)}
              tone={r.cases.base.returnPct < 0 ? 'bad' : 'good'}
            />
            <Metric
              label="Low case (P5 path)"
              value={formatPct(r.cases.low.returnPct)}
              note={formatMoney(r.cases.low.payoff, ccy)}
              tone={r.cases.low.returnPct < 0 ? 'bad' : 'neutral'}
            />
            <Metric
              label="Probability of loss"
              value={formatProbability(r.distribution.probabilityOfLoss)}
              tone={r.distribution.probabilityOfLoss > 0 ? 'bad' : 'good'}
            />
            <Metric
              label="Probability of knock-in"
              value={
                r.distribution.probabilityOfKnockIn === null
                  ? 'No barrier'
                  : formatProbability(r.distribution.probabilityOfKnockIn)
              }
            />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric label="Payoff at maturity" value={formatMoney(r.result.payoff, ccy)} />
          <Metric
            label="Return"
            value={formatPct(r.result.returnPct)}
            tone={r.result.returnPct < 0 ? 'bad' : 'good'}
          />
          <Metric
            label="Loss amount"
            value={formatMoney(r.result.lossAmount, ccy)}
            tone={r.result.lossAmount > 0 ? 'bad' : 'neutral'}
          />
          <Metric label="Barrier" value={knockInLabel(r.result.knockedIn)} />
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[11px] text-[var(--ink-muted)]">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
        {r.mode === 'A'
          ? r.notice
          : 'This is a simulation, not a guarantee. Mode B applies one shock to the starting level.'}
      </p>
    </div>
  );
}
