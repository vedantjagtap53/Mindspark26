// Client profile (PRD §7.1): risk appetite, horizon, loss tolerance, concentration.
import { Compass } from 'lucide-react';
import type { ProfileForm, RiskAppetite } from '../../state/forms';
import { Field, Segmented, TextInput, Tile } from '../ui';


interface Props {
  profile: ProfileForm;
  onChange: (p: ProfileForm) => void;
}

function Range({
  id,
  label,
  value,
  display,
  min,
  max,
  step,
  scale,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  scale: [string, string, string];
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <label htmlFor={id} className="font-mono text-[var(--ink-muted)] font-semibold uppercase">
          {label}
        </label>
        <span className="font-bold text-[var(--ink-primary)]">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent-primary)]"
      />
      <div className="flex justify-between text-[10px] text-[var(--ink-muted)] font-mono">
        {scale.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
    </div>
  );
}

export function ClientProfileForm({ profile, onChange }: Props) {
  const set = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) =>
    onChange({ ...profile, [key]: value });

  return (
    <Tile className="space-y-4">
      <div className="flex items-center gap-2.5 border-b border-[var(--border-color)] pb-3">
        <div className="w-8 h-8 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-text)] flex items-center justify-center">
          <Compass className="w-4 h-4 text-[var(--accent-gold)]" aria-hidden />
        </div>
        <div>
          <h2 className="font-serif text-base font-bold">Client suitability profile</h2>
          <p className="text-xs text-[var(--ink-muted)]">
            Risk classification and mandate limits used by the suitability check
          </p>
        </div>
      </div>



      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Client reference" htmlFor="client-ref" hint="Internal reference, not a name.">
          <TextInput
            id="client-ref"
            value={profile.clientRef}
            onChange={(v) => onChange({ ...profile, clientRef: v, profileId: null })}
            placeholder="e.g. CL-0042"
            maxLength={64}
          />
        </Field>
        <Field label="Profile label" htmlFor="client-label">
          <TextInput
            id="client-label"
            value={profile.label}
            onChange={(v) => set('label', v)}
            placeholder="e.g. Retirement portfolio"
            maxLength={120}
          />
        </Field>
      </div>

      <div>
        <span className="text-[11px] font-mono text-[var(--ink-muted)] font-semibold block mb-1 uppercase">
          Risk appetite
        </span>
        <Segmented<RiskAppetite>
          label="Risk appetite"
          value={profile.riskAppetite}
          onChange={(v) => set('riskAppetite', v)}
          options={[
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
          ]}
        />
      </div>

      <div className="space-y-3.5 pt-1">
        <Range
          id="horizon"
          label="Investment horizon"
          value={profile.horizonMonths}
          display={`${profile.horizonMonths} months`}
          min={1}
          max={60}
          step={1}
          scale={['1 month', '12 months', '60 months']}
          onChange={(v) => set('horizonMonths', v)}
        />
        <Range
          id="loss-tolerance"
          label="Max loss tolerance"
          value={profile.lossTolerancePct}
          display={`${profile.lossTolerancePct}% of amount invested`}
          min={0}
          max={100}
          step={1}
          scale={['0% (no loss)', '50%', '100%']}
          onChange={(v) => set('lossTolerancePct', v)}
        />
        <Range
          id="concentration"
          label="Concentration in this product"
          value={profile.concentrationPct}
          display={`${profile.concentrationPct}% of portfolio`}
          min={0}
          max={100}
          step={1}
          scale={['0%', '50%', '100%']}
          onChange={(v) => set('concentrationPct', v)}
        />
      </div>
    </Tile>
  );
}
