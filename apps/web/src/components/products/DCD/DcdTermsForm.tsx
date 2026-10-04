// DCD terms (PRD §3): currency pair, deposit amount, tenor, strike rate and enhanced rate.
import { TENOR_PRESETS } from '../../../constants/products';
import type { DcdForm } from '../../../state/forms';
import { TextInput } from '../../ui';
import { TenorField, TermField, TermNumber } from '../fields';

interface Props {
  value: DcdForm;
  onChange: (v: DcdForm) => void;
  issues: Record<string, string>;
}

export function DcdTermsForm({ value, onChange, issues }: Props) {
  const set = <K extends keyof DcdForm>(key: K, v: DcdForm[K]) => onChange({ ...value, [key]: v });
  const dep = value.depositCurrency.toUpperCase() || '?';
  const alt = value.alternateCurrency.toUpperCase() || '?';

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TermField
          label="Deposit currency"
          htmlFor="dcd-deposit-ccy"
          hint="3-letter code. Payoffs are shown in this currency."
          issue={issues.depositCurrency}
        >
          <TextInput
            id="dcd-deposit-ccy"
            value={value.depositCurrency}
            onChange={(v) => set('depositCurrency', v)}
            maxLength={3}
          />
        </TermField>
        <TermField
          label="Alternate currency"
          htmlFor="dcd-alt-ccy"
          issue={issues.alternateCurrency}
        >
          <TextInput
            id="dcd-alt-ccy"
            value={value.alternateCurrency}
            onChange={(v) => set('alternateCurrency', v)}
            maxLength={3}
          />
        </TermField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TermField label="Deposit amount" htmlFor="dcd-amount" issue={issues.depositAmount}>
          <TermNumber
            id="dcd-amount"
            value={value.depositAmount}
            onChange={(v) => set('depositAmount', v)}
            step={1000}
            min={0}
          />
        </TermField>
        <TermField label="Enhanced rate (% p.a.)" htmlFor="dcd-rate" issue={issues.enhancedRatePct}>
          <TermNumber
            id="dcd-rate"
            value={value.enhancedRatePct}
            onChange={(v) => set('enhancedRatePct', v)}
            step={0.25}
            min={0}
          />
        </TermField>
      </div>

      <TenorField
        id="dcd-tenor"
        value={value.tenorDays}
        presets={TENOR_PRESETS.DCD}
        issue={issues.tenorDays}
        onChange={(v) => set('tenorDays', v)}
      />

      <TermField
        label="Strike rate"
        htmlFor="dcd-strike"
        hint={`Quoted as ${alt} per 1 ${dep}.`}
        issue={issues.strikeRate}
      >
        <TermNumber
          id="dcd-strike"
          value={value.strikeRate}
          onChange={(v) => set('strikeRate', v)}
          step={0.01}
          min={0}
        />
      </TermField>
    </div>
  );
}
