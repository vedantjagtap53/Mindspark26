// ELN terms (PRD §3): underlying, notional, tenor, strike, coupon and an optional barrier.
import { TENOR_PRESETS } from '../../../constants/products';
import type { ElnForm } from '../../../state/forms';
import { Segmented, TextInput } from '../../ui';
import { TenorField, TermField, TermNumber } from '../fields';

interface Props {
  value: ElnForm;
  onChange: (v: ElnForm) => void;
  issues: Record<string, string>;
}

export function ElnTermsForm({ value, onChange, issues }: Props) {
  const set = <K extends keyof ElnForm>(key: K, v: ElnForm[K]) => onChange({ ...value, [key]: v });

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TermField
          label="Underlying symbol"
          htmlFor="eln-symbol"
          hint="Mode A forecast: ^NSEI only. Live level (Finnhub): e.g. AAPL, BINANCE:BTCUSDT."
          issue={issues['underlying.symbol']}
        >
          <TextInput id="eln-symbol" value={value.symbol} onChange={(v) => set('symbol', v)} />
        </TermField>
        <TermField label="Notional (INR)" htmlFor="eln-notional" issue={issues.notional}>
          <TermNumber
            id="eln-notional"
            value={value.notional}
            onChange={(v) => set('notional', v)}
            step={100000}
            min={0}
          />
        </TermField>
      </div>

      <TenorField
        id="eln-tenor"
        value={value.tenorDays}
        presets={TENOR_PRESETS.ELN}
        issue={issues.tenorDays}
        onChange={(v) => set('tenorDays', v)}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TermField
          label="Strike (% of starting level)"
          htmlFor="eln-strike"
          issue={issues.strikePct}
        >
          <TermNumber
            id="eln-strike"
            value={value.strikePct}
            onChange={(v) => set('strikePct', v)}
            step={0.5}
          />
        </TermField>
        <TermField label="Coupon (% p.a.)" htmlFor="eln-coupon" issue={issues.couponPct}>
          <TermNumber
            id="eln-coupon"
            value={value.couponPct}
            onChange={(v) => set('couponPct', v)}
            step={0.25}
            min={0}
          />
        </TermField>
      </div>

      <div className="p-3 rounded-xl clay-tile-light border border-[var(--border-subtle)] space-y-3">
        <label className="flex items-center gap-2 text-xs font-semibold">
          <input
            type="checkbox"
            checked={value.barrierEnabled}
            onChange={(e) => set('barrierEnabled', e.target.checked)}
            className="accent-[var(--accent-primary)]"
          />
          Barrier ELN (uncheck for a plain ELN)
        </label>
        {value.barrierEnabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TermField
              label="Barrier (% of starting level)"
              htmlFor="eln-barrier"
              hint="Must be below the strike. Touching the barrier counts as knock-in."
              issue={issues.barrierPct}
            >
              <TermNumber
                id="eln-barrier"
                value={value.barrierPct}
                onChange={(v) => set('barrierPct', v)}
                step={1}
              />
            </TermField>
            <div>
              <span className="text-[11px] font-mono text-[var(--ink-muted)] font-semibold block mb-1 uppercase">
                Barrier observation
              </span>
              <Segmented<ElnForm['barrierType']>
                label="Barrier observation"
                value={value.barrierType}
                onChange={(v) => set('barrierType', v)}
                options={[
                  { value: 'European', label: 'European (maturity)' },
                  { value: 'American', label: 'American (daily)' },
                ]}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
