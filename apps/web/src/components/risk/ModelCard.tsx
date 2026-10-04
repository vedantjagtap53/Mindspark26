// Mode A model card (PRD §7.3): model, training window and backtest, from the forecast response.
import type { SimulateModeAResponse } from '@mindspark/shared';
import { formatProbability } from '../../utils/format';

interface Props {
  model: SimulateModeAResponse['model'];
  backtest: SimulateModeAResponse['backtest'];
}

export function ModelCard({ model, backtest }: Props) {
  const rows: Array<[string, string]> = [
    ['Model', `${model.name} v${model.version}`],
    [
      'Training window',
      `${model.trainingWindowYears} years · ${model.trainingStart} to ${model.trainingEnd}`,
    ],
    ['Observations', model.observations.toLocaleString('en-IN')],
    ['Simulations', model.simulations.toLocaleString('en-IN')],
    ['Drift', `${model.drift.method}, ${formatProbability(model.drift.annualized, 2)} a year`],
    [
      'Backtest band coverage',
      `${formatProbability(backtest.bandCoverage)} (target 80–95%) over ${backtest.windows} windows of ${backtest.horizonTradingDays} trading days`,
    ],
    [
      'Backtest error (MAPE)',
      `${formatProbability(backtest.baseMape)} base vs ${formatProbability(backtest.naiveMape)} naive`,
    ],
  ];
  const inTarget = backtest.bandCoverage >= 0.8 && backtest.bandCoverage <= 0.95;

  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="border-b border-[var(--border-subtle)] pb-1.5">
            <dt className="text-[10px] font-mono uppercase text-[var(--ink-muted)]">{k}</dt>
            <dd className="font-mono text-[var(--ink-primary)]">{v}</dd>
          </div>
        ))}
      </dl>
      {!inTarget && (
        <p className="text-[11px] text-[var(--status-caution-text)]">
          Backtest band coverage is outside the 80–95% target.
        </p>
      )}
    </div>
  );
}
