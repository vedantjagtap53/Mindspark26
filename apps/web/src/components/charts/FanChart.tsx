// Mode A forecast fan: recent daily closes, then the P5–P95 band and P50 line per trading day, from
// the forecast service via the backend. History is drawn only when the backend matched it to the
// forecast spot; otherwise the reason is shown and nothing stands in for it.
import { useId } from 'react';
import type { PriceHistory } from '@mindspark/shared';
import { formatLevel } from '../../utils/format';

interface Props {
  fan: { p5: number[]; p50: number[]; p95: number[] };
  history?: PriceHistory;
  asOf: string;
  lines: Array<{ level: number; label: string; tone: 'strike' | 'barrier' }>;
  cases: Array<{ label: string; terminal: number }>;
}

const W = 760;
const H = 300;
const M = { top: 20, right: 96, bottom: 40, left: 72 };

export function FanChart({ fan, history, asOf, lines, cases }: Props) {
  const titleId = useId();
  const n = fan.p50.length;
  if (n < 2) return null;

  // History ends at day 0 (the forecast's as-of close), so it sits at x = −(points − 1) … 0.
  const past = history?.status === 'ok' ? history.points : [];
  const h = Math.max(past.length - 1, 0);

  const values = [
    ...past.map((p) => p.close),
    ...fan.p5,
    ...fan.p95,
    ...lines.map((l) => l.level),
    ...cases.map((c) => c.terminal),
  ];
  const yMin = Math.min(...values) * 0.98;
  const yMax = Math.max(...values) * 1.02;
  const pw = W - M.left - M.right;
  const ph = H - M.top - M.bottom;
  const x = (i: number) => M.left + ((i + h) / (n - 1 + h)) * pw;
  const y = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin)) * ph;

  const upper = fan.p95.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  const lower = [...fan.p5]
    .reverse()
    .map((v, k) => `L${x(n - 1 - k)},${y(v)}`)
    .join(' ');
  const median = fan.p50.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  const historyPath = past.map((p, k) => `${k ? 'L' : 'M'}${x(k - h)},${y(p.close)}`).join(' ');
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4);

  return (
    <figure className="space-y-2">
      <figcaption id={titleId} className="sr-only">
        Forecast range of the underlying over {n - 1} trading days from {asOf}: 5th to 95th
        percentile band and median.
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-labelledby={titleId}>
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--chart-grid-stroke)"
            />
            <text
              x={M.left - 8}
              y={y(t) + 4}
              textAnchor="end"
              className="fill-[var(--ink-muted)] text-[11px] font-mono"
            >
              {formatLevel(t, 0)}
            </text>
          </g>
        ))}
        {past.length > 1 && (
          <>
            <path
              d={historyPath}
              fill="none"
              stroke="var(--ink-secondary)"
              strokeWidth={1.5}
              data-testid="fan-history"
            />
            <line
              x1={x(0)}
              x2={x(0)}
              y1={M.top}
              y2={H - M.bottom}
              stroke="var(--chart-grid-stroke)"
              strokeDasharray="2 3"
            />
          </>
        )}
        <path
          d={`${upper} ${lower} Z`}
          fill="var(--chart-area-fill)"
          fillOpacity={0.18}
          stroke="none"
        />
        <path d={median} fill="none" stroke="var(--chart-payoff-stroke)" strokeWidth={2} />
        {lines.map((l) => (
          <g key={l.label}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={y(l.level)}
              y2={y(l.level)}
              stroke={l.tone === 'barrier' ? 'var(--status-breach-text)' : 'var(--ink-secondary)'}
              strokeDasharray="4 4"
            />
            <text
              x={W - M.right + 4}
              y={y(l.level) + 4}
              className="fill-[var(--ink-secondary)] text-[10px] font-mono"
            >
              {l.label}
            </text>
          </g>
        ))}
        {cases.map((c) => (
          <g key={c.label}>
            <circle cx={x(n - 1)} cy={y(c.terminal)} r={4} fill="var(--accent-primary)" />
            <text
              x={x(n - 1) - 6}
              y={y(c.terminal) - 6}
              textAnchor="end"
              className="fill-[var(--ink-primary)] text-[10px] font-mono"
            >
              {c.label}
            </text>
          </g>
        ))}
        <text x={M.left} y={H - 8} className="fill-[var(--ink-muted)] text-[11px] font-mono">
          {past.length > 1 ? `From ${past[0]!.date}` : `Day 0 = close of ${asOf}`}
        </text>
        {past.length > 1 && (
          <text
            x={x(0)}
            y={H - 8}
            textAnchor="middle"
            className="fill-[var(--ink-muted)] text-[11px] font-mono"
          >
            {asOf}
          </text>
        )}
        <text
          x={W - M.right}
          y={H - 8}
          textAnchor="end"
          className="fill-[var(--ink-muted)] text-[11px] font-mono"
        >
          Trading day {n - 1}
        </text>
      </svg>
      <p className="text-[11px] font-mono text-[var(--ink-muted)]">
        Shaded: 5th–95th percentile of simulated levels. Line: median. Dots: low, base and high case
        end levels.{' '}
        {history?.status === 'ok'
          ? `Grey line: daily closes from ${history.source} (holidays skipped).`
          : history
            ? `Price history not shown: ${history.reason}.`
            : ''}
      </p>
    </figure>
  );
}
