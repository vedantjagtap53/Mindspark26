// DCD in Mode A: the forecast service has no USD/INR data, so the backend returns its Nifty 50
// forecast as context only. This panel says so plainly and shows no DCD payoff, risk or verdict.
import { Info } from 'lucide-react';
import type { SimulateModeAContextResponse } from '@mindspark/shared';
import { formatLevel } from '../../utils/format';
import { FanChart } from '../charts/FanChart';
import { ModelCard } from '../risk/ModelCard';
import { SectionHeader, Tile } from '../ui';

interface Props {
  context: SimulateModeAContextResponse;
  /** Switches the run settings to Mode B, where the DCD payoff and verdict are calculated. */
  onUseModeB: () => void;
}

export function ForecastContextPanel({ context, onUseModeB }: Props) {
  return (
    <Tile>
      <SectionHeader
        kicker="Mode A forecast · context only"
        title={`${context.underlying.name}: 5th–95th percentile range`}
        aside={
          <span className="text-xs text-[var(--ink-muted)] font-mono">
            {context.underlying.name} level {formatLevel(context.spot.value)}
          </span>
        }
      />
      <div
        role="note"
        className="flex gap-2.5 items-start rounded-xl border border-[var(--border-subtle)] bg-[var(--well-bg)] p-3 mb-4 text-xs text-[var(--ink-secondary)] leading-relaxed"
      >
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-[var(--accent-gold)]" aria-hidden />
        <div className="space-y-2">
          <p>{context.notice}</p>
          <button
            type="button"
            onClick={onUseModeB}
            className="font-semibold underline underline-offset-2 text-[var(--ink-primary)]"
          >
            Switch to Mode B for the DCD payoff
          </button>
        </div>
      </div>
      <FanChart
        fan={context.fan}
        history={context.history}
        asOf={context.spot.asOf}
        lines={[]}
        cases={[]}
      />
      <div className="mt-4">
        <SectionHeader kicker="Model card" title="How the forecast was made" />
        <ModelCard model={context.model} backtest={context.backtest} />
      </div>
    </Tile>
  );
}
