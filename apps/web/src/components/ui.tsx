// Small building blocks in the Payoff Desk "clay" style (classes from index.css).
import type { ReactNode } from 'react';
import { Clock } from 'lucide-react';

export function Tile({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`clay-tile p-5 text-[var(--ink-primary)] ${className}`}>{children}</section>
  );
}

export function SectionHeader({
  kicker,
  title,
  aside,
}: {
  kicker: string;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border-color)] pb-3 mb-4">
      <div>
        <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
          {kicker}
        </span>
        <h2 className="font-serif text-base font-bold text-[var(--ink-primary)]">{title}</h2>
      </div>
      {aside}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="text-[11px] font-mono text-[var(--ink-muted)] font-semibold block mb-1 uppercase"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-[var(--ink-muted)] mt-1">{hint}</p>}
    </div>
  );
}

const inputClass =
  'clay-inset w-full px-3 py-2 text-xs font-semibold text-[var(--ink-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/40';

export function NumberInput({
  id,
  value,
  onChange,
  step = 'any',
  min,
  max,
  placeholder,
}: {
  id: string;
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number | 'any';
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      className={inputClass}
      value={value ?? ''}
      step={step}
      min={min}
      max={max}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    />
  );
}

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <input
      id={id}
      type="text"
      className={inputClass}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex gap-1 p-1 bg-[var(--well-bg)] rounded-xl border border-[var(--border-color)]"
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            value === o.value
              ? 'bg-[var(--accent-primary)] text-[var(--accent-text)] shadow-xs'
              : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** An honest "not available yet" panel: no invented content stands in for a missing backend. */
export function Placeholder({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="p-4 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--well-bg)]/60">
      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--ink-primary)]">
        <Clock className="w-4 h-4 text-[var(--ink-muted)]" aria-hidden />
        <span>{title}</span>
      </div>
      <p className="text-[11px] text-[var(--ink-muted)] mt-1 leading-relaxed">{reason}</p>
    </div>
  );
}

export function Metric({
  label,
  value,
  note,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'neutral' | 'good' | 'bad';
}) {
  const color =
    tone === 'good'
      ? 'text-[var(--status-suitable-text)]'
      : tone === 'bad'
        ? 'text-[var(--status-breach-text)]'
        : 'text-[var(--ink-primary)]';
  return (
    <div className="p-3 rounded-xl bg-[var(--well-bg)] border border-[var(--border-subtle)] text-center">
      <span className="text-[10px] font-mono text-[var(--ink-muted)] font-semibold block uppercase">
        {label}
      </span>
      <span className={`text-base font-mono font-bold ${color}`}>{value}</span>
      {note && <span className="text-[10px] text-[var(--ink-muted)] block">{note}</span>}
    </div>
  );
}
