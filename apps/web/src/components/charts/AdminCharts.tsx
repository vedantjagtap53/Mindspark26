// Small SVG charts for the admin overview. No chart library: the data is a few dozen numbers.
import type { DailyActivity } from '@mindspark/shared';

const W = 640;
const H = 190;
const M = { top: 12, right: 12, bottom: 28, left: 32 };

/** Runs per day as bars, with sign-ins per day as a line, over the analytics window. */
export function DailyChart({ daily }: { daily: DailyActivity[] }) {
  const max = Math.max(1, ...daily.map((d) => Math.max(d.runs, d.logins)));
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const step = plotW / Math.max(1, daily.length);
  const barW = Math.max(2, step * 0.62);
  const x = (i: number) => M.left + i * step + step / 2;
  const y = (v: number) => M.top + plotH - (v / max) * plotH;
  const line = daily.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.logins)}`).join(' ');
  const ticks = [0, Math.ceil(max / 2), max];
  const totalRuns = daily.reduce((n, d) => n + d.runs, 0);
  const totalLogins = daily.reduce((n, d) => n + d.logins, 0);

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Runs and sign-ins per day over the last ${daily.length} days: ${totalRuns} runs, ${totalLogins} sign-ins`}
        className="w-full h-auto"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--chart-grid-stroke)"
              strokeWidth={1}
            />
            <text
              x={M.left - 6}
              y={y(t) + 3}
              textAnchor="end"
              className="fill-[var(--ink-muted)] text-[10px] font-mono"
            >
              {t}
            </text>
          </g>
        ))}
        {daily.map((d, i) => (
          <rect
            key={d.date}
            x={x(i) - barW / 2}
            y={y(d.runs)}
            width={barW}
            height={Math.max(0, M.top + plotH - y(d.runs))}
            rx={2}
            fill="var(--accent-primary)"
            opacity={0.85}
          >
            <title>{`${d.date}: ${d.runs} run${d.runs === 1 ? '' : 's'}, ${d.logins} sign-in${d.logins === 1 ? '' : 's'}`}</title>
          </rect>
        ))}
        <path d={line} fill="none" stroke="var(--accent-gold)" strokeWidth={2} />
        {daily.map((d, i) => (
          <circle key={d.date} cx={x(i)} cy={y(d.logins)} r={2.5} fill="var(--accent-gold)" />
        ))}
        {daily.map((d, i) =>
          i % 5 === 0 || i === daily.length - 1 ? (
            <text
              key={d.date}
              x={x(i)}
              y={H - 10}
              textAnchor="middle"
              className="fill-[var(--ink-muted)] text-[10px] font-mono"
            >
              {d.date.slice(5)}
            </text>
          ) : null,
        )}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-[var(--ink-muted)]">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-sm bg-[var(--accent-primary)]"
            aria-hidden
          />
          Runs saved
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 bg-[var(--accent-gold)]" aria-hidden />
          Sign-ins
        </span>
      </div>
    </div>
  );
}

export interface BarItem {
  label: string;
  value: number;
  /** CSS colour for the bar; defaults to the accent. */
  color?: string;
}

/** Horizontal bars with their counts, for a handful of categories. */
export function BreakdownBars({ items, label }: { items: BarItem[]; label: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((n, i) => n + i.value, 0);
  if (total === 0) {
    return <p className="text-xs text-[var(--ink-muted)]">Nothing in this period yet.</p>;
  }
  return (
    <ul aria-label={label} className="space-y-2">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex justify-between text-xs mb-0.5">
            <span className="text-[var(--ink-secondary)] font-semibold">{item.label}</span>
            <span className="font-mono text-[var(--ink-primary)]">
              {item.value}
              <span className="text-[var(--ink-muted)]">
                {' '}
                ({Math.round((item.value / total) * 100)}%)
              </span>
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-[var(--well-deep)] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(item.value / max) * 100}%`,
                background: item.color ?? 'var(--accent-primary)',
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
