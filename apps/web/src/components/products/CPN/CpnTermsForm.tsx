// CPN terms (PRD §3): underlying, notional, tenor, protection, participation and an optional cap.
import { TENOR_PRESETS } from '../../../constants/products';
import type { CpnForm } from '../../../state/forms';
import { TextInput } from '../../ui';
import { TenorField, TermField, TermNumber } from '../fields';

interface Props {
  value: CpnForm;
  onChange: (v: CpnForm) => void;
  issues: Record<string, string>;
}

export function CpnTermsForm({ value, onChange, issues }: Props) {
  const set = <K extends keyof CpnForm>(key: K, v: CpnForm[K]) => onChange({ ...value, [key]: v });

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TermField
          label="Underlying symbol"
          htmlFor="cpn-symbol"
          hint="Mode A forecast: ^NSEI only. Live level (Finnhub): e.g. AAPL, BINANCE:BTCUSDT."
          issue={issues['underlying.symbol']}
        >
          <TextInput id="cpn-symbol" value={value.symbol} onChange={(v) => set('symbol', v)} />
        </TermField>
        <TermField label="Notional (INR)" htmlFor="cpn-notional" issue={issues.notional}>
          <TermNumber
            id="cpn-notional"
            value={value.notional}
            onChange={(v) => set('notional', v)}
            step={100000}
            min={0}
          />
        </TermField>
      </div>

      <TenorField
        id="cpn-tenor"
        value={value.tenorDays}
        presets={TENOR_PRESETS.CPN}
        issue={issues.tenorDays}
        onChange={(v) => set('tenorDays', v)}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TermField
          label="Capital protection (%)"
          htmlFor="cpn-protection"
          hint="0–100% of the notional."
          issue={issues.protectionPct}
        >
          <TermNumber
            id="cpn-protection"
            value={value.protectionPct}
            onChange={(v) => set('protectionPct', v)}
            step={1}
            min={0}
            max={100}
          />
        </TermField>
        <TermField
          label="Participation (%)"
          htmlFor="cpn-participation"
          issue={issues.participationPct}
        >
          <TermNumber
            id="cpn-participation"
            value={value.participationPct}
            onChange={(v) => set('participationPct', v)}
            step={5}
            min={0}
          />
        </TermField>
      </div>

      <div className="p-3 rounded-xl clay-tile-light border border-[var(--border-subtle)] space-y-3">
        <label className="flex items-center gap-2 text-xs font-semibold">
          <input
            type="checkbox"
            checked={value.capEnabled}
            onChange={(e) => set('capEnabled', e.target.checked)}
            className="accent-[var(--accent-primary)]"
          />
          Capped upside
        </label>
        {value.capEnabled && (
          <TermField
            label="Cap (%)"
            htmlFor="cpn-cap"
            hint="Cap semantics are pending confirmation (docs/product-formulas.md)."
            issue={issues.capPct}
          >
            <TermNumber
              id="cpn-cap"
              value={value.capPct}
              onChange={(v) => set('capPct', v)}
              step={1}
              min={0}
            />
          </TermField>
        )}
      </div>
    </div>
  );
}
