// Mode picker (PRD §7.2): Mode A forecast or Mode B shock, and what the run starts from.
import { Play, Sparkles } from 'lucide-react';
import { SHOCK_PRESETS } from '../../constants/products';
import {
  runBlocker,
  type LevelSourceChoice,
  type Mode,
  type ProductType,
  type RunSettings,
} from '../../state/forms';
import { formatPct } from '../../utils/format';
import { Field, NumberInput, Segmented, Tile } from '../ui';
import { LiveTicker } from './LiveTicker';

interface Props {
  product: ProductType;
  /** Underlying symbol of the ELN/CPN terms, for the live ticker. */
  symbol: string;
  run: RunSettings;
  onRun: (r: RunSettings) => void;
  termIssueCount: number;
  loading: boolean;
  elapsedSeconds: number;
  onExecute: () => void;
}

export function ModePicker({
  product,
  run,
  onRun,
  termIssueCount,
  loading,
  elapsedSeconds,
  onExecute,
  symbol,
}: Props) {
  const set = <K extends keyof RunSettings>(key: K, v: RunSettings[K]) =>
    onRun({ ...run, [key]: v });
  const isDcd = product === 'DCD';
  const blocker =
    termIssueCount > 0
      ? 'Fix the highlighted product terms first (stage 2).'
      : runBlocker(product, run);
  const levelOptions: Array<{ value: LevelSourceChoice; label: string }> = isDcd
    ? [
        { value: 'reference', label: 'FX reference rate' },
        { value: 'manual', label: 'Enter FX spot' },
      ]
    : [
        { value: 'live', label: 'Live level' },
        { value: 'manual', label: 'Enter level' },
      ];

  return (
    <Tile className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-text)] flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-[var(--accent-gold)]" aria-hidden />
          </div>
          <div>
            <h2 className="font-serif text-base font-bold">Simulation mode</h2>
            <p className="text-xs text-[var(--ink-muted)]">
              {run.mode === 'A'
                ? `GARCH(1,1) Monte Carlo forecast of the ${isDcd ? 'FX rate' : 'underlying'}, then the payoff engine`
                : 'Starting level moved by a shock, then the payoff engine'}
            </p>
          </div>
        </div>
        <div className="w-full sm:w-auto sm:min-w-[18rem]">
          <Segmented<Mode>
            label="Simulation mode"
            value={run.mode}
            onChange={(v) => set('mode', v)}
            options={[
              { value: 'A', label: 'Mode A: Forecast' },
              { value: 'B', label: 'Mode B: Shock' },
            ]}
          />
        </div>
      </div>

      {run.mode === 'A' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3.5 rounded-xl clay-tile-light border border-[var(--border-subtle)]">
            <span className="text-[11px] font-mono text-[var(--ink-muted)] font-semibold block mb-1 uppercase">
              Training window
            </span>
            <Segmented<5 | 10>
              label="Training window"
              value={run.trainingWindowYears}
              onChange={(v) => set('trainingWindowYears', v)}
              options={[
                { value: 5, label: '5 years' },
                { value: 10, label: '10 years (incl. 2020)' },
              ]}
            />
          </div>
          <div className="p-3.5 rounded-xl clay-tile-light border border-[var(--border-subtle)] text-[11px] text-[var(--ink-muted)] leading-relaxed">
            The forecast service returns low (P5), base (P50) and high (P95) paths plus 500 sample
            paths. If it is down or its answer fails validation, the run fails: no substitute
            forecast is generated.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3.5 rounded-xl clay-tile-light border border-[var(--border-subtle)] space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-mono text-[var(--ink-muted)] font-semibold uppercase">
                {isDcd ? 'FX shock' : 'Market shock'}
              </span>
              <span
                className={`font-bold ${run.shockPct < 0 ? 'text-[var(--status-breach-text)]' : 'text-[var(--status-suitable-text)]'}`}
              >
                {formatPct(run.shockPct, 1)}
              </span>
            </div>
            <div className="flex gap-1">
              {SHOCK_PRESETS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={run.shockPct === s}
                  onClick={() => set('shockPct', s)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold ${
                    run.shockPct === s
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-text)]'
                      : 'bg-[var(--well-bg)] text-[var(--ink-secondary)]'
                  }`}
                >
                  {formatPct(s, 0)}
                </button>
              ))}
            </div>
            <Field label="Custom shock (%)" htmlFor="shock-custom" hint="Above −100%.">
              <NumberInput
                id="shock-custom"
                value={run.shockPct}
                onChange={(v) => set('shockPct', v ?? 0)}
                step={0.5}
                min={-99.9}
              />
            </Field>
          </div>

          <div className="p-3.5 rounded-xl clay-tile-light border border-[var(--border-subtle)] space-y-2">
            <span className="text-[11px] font-mono text-[var(--ink-muted)] font-semibold block uppercase">
              Starting level
            </span>
            <Segmented<LevelSourceChoice>
              label="Starting level source"
              value={run.levelSource}
              onChange={(v) => set('levelSource', v)}
              options={levelOptions}
            />
            {run.levelSource === 'manual' ? (
              <Field
                label={isDcd ? 'FX spot rate' : 'Starting level (S₀)'}
                htmlFor="manual-level"
                hint="Typed by you; reported as manual, not market data."
              >
                <NumberInput
                  id="manual-level"
                  value={run.manualLevel}
                  onChange={(v) => set('manualLevel', v)}
                  step="any"
                  min={0}
                  placeholder={isDcd ? 'e.g. 84.20' : 'e.g. 25000'}
                />
              </Field>
            ) : isDcd ? (
              <p className="text-[11px] text-[var(--ink-muted)] leading-relaxed">
                Latest daily FX reference rate (Frankfurter). Indicative, not live; rejected if too
                old.
              </p>
            ) : (
              <div className="space-y-1.5">
                <LiveTicker symbol={symbol} />
                <p className="text-[10px] text-[var(--ink-muted)] leading-relaxed">
                  Real-time trades via Finnhub (US stocks and crypto, e.g. AAPL or BINANCE:BTCUSDT;
                  not Nifty 50). The run uses the latest trade at that moment and is refused if it
                  is stale.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="pt-1 space-y-2">
        {blocker && (
          <p className="text-xs text-[var(--status-caution-text)]" role="status">
            {blocker}
          </p>
        )}
        <button
          type="button"
          onClick={onExecute}
          disabled={loading || blocker !== null}
          className="clay-btn-primary w-full py-2.5 px-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play className="w-3.5 h-3.5 fill-current" aria-hidden />
          {loading ? `Simulating (${elapsedSeconds.toFixed(1)}s)…` : 'Run simulation'}
        </button>
      </div>
    </Tile>
  );
}
