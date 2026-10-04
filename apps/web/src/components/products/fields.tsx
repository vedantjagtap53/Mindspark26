// Shared inputs for the product term forms: a field with its schema message, and the tenor input.
import type { ReactNode } from 'react';
import { TENOR_DAYS_MAX, TENOR_DAYS_MIN } from '@mindspark/shared';
import { Field, NumberInput } from '../ui';

export function TermField({
  label,
  htmlFor,
  hint,
  issue,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  issue?: string;
  children: ReactNode;
}) {
  return (
    <Field label={label} htmlFor={htmlFor} hint={issue ? undefined : hint}>
      {children}
      {issue && (
        <p role="alert" className="text-[10px] text-[var(--status-breach-text)] mt-1 font-semibold">
          {issue}
        </p>
      )}
    </Field>
  );
}

/** Number field that keeps a cleared box as NaN so the schema reports it instead of hiding it. */
export function TermNumber({
  id,
  value,
  onChange,
  step,
  min,
  max,
}: {
  id: string;
  value: number;
  onChange: (v: number) => void;
  step?: number | 'any';
  min?: number;
  max?: number;
}) {
  return (
    <NumberInput
      id={id}
      value={Number.isNaN(value) ? null : value}
      onChange={(v) => onChange(v ?? Number.NaN)}
      step={step}
      min={min}
      max={max}
    />
  );
}

export function TenorField({
  id,
  value,
  presets,
  issue,
  onChange,
}: {
  id: string;
  value: number;
  presets: number[];
  issue?: string;
  onChange: (v: number) => void;
}) {
  return (
    <TermField
      label="Tenor (days)"
      htmlFor={id}
      hint={`${TENOR_DAYS_MIN}–${TENOR_DAYS_MAX.toLocaleString('en-IN')} calendar days`}
      issue={issue}
    >
      <div className="flex gap-1">
        <div className="flex-1">
          <TermNumber id={id} value={value} onChange={onChange} step={1} />
        </div>
        {presets.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={value === t}
            onClick={() => onChange(t)}
            className={`px-2 rounded-lg text-xs font-mono font-semibold ${
              value === t
                ? 'bg-[var(--accent-primary)] text-[var(--accent-text)]'
                : 'bg-[var(--well-bg)] text-[var(--ink-secondary)]'
            }`}
          >
            {t}d
          </button>
        ))}
      </div>
    </TermField>
  );
}
