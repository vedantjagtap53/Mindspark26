// Payoff at maturity across underlying moves. Plots the backend's `curve` only (no payoff maths
// in the browser). Strike/barrier lines are the RM's own terms, placed on the shock axis.
import { useId, useState, type MouseEvent } from 'react';
import type { BreakevenPoint, ShockOutcome } from '@mindspark/shared';
import { formatLevel, formatMoney, formatPct, knockInLabel } from '../../utils/format';

export interface ChartMarker {
  /** Position on the shock axis, as a percent move from the starting level. */
  shockPct: number;
  label: string;
  tone: 'strike' | 'barrier';
}

interface Props {
  curve: ShockOutcome[];
  currency: string;
  currentShockPct: number | null;
  markers: ChartMarker[];
  /** Backend-computed breakevens (shock where the outcome flips between loss and no loss). */
  breakevens: BreakevenPoint[];
  /** Shown on the axis, e.g. "Underlying" or "USD/INR". */
  axisLabel: string;
}

const W = 760;
const H = 320;
const M = { top: 24, right: 24, bottom: 44, left: 64 };

export function PayoffChart({
  curve,
  currency,
  currentShockPct,
  markers,
  breakevens,
  axisLabel,
}: Props) {
  const titleId = useId();
  const [hover, setHover] = useState<ShockOutcome | null>(null);
  if (curve.length < 2) return null;

  const xs = curve.map((p) => p.shockPct);
  const ys = curve.map((p) => p.returnPct);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.floor(Math.min(...ys, 0) / 5) * 5 - 5;
  const yMax = Math.ceil(Math.max(...ys, 0) / 5) * 5 + 5;
  const pw = W - M.left - M.right;
  const ph = H - M.top - M.bottom;
  const x = (v: number) => M.left + ((v - xMin) / (xMax - xMin)) * pw;
  const y = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin)) * ph;

  const path = curve.map((p, i) => `${i ? 'L' : 'M'}${x(p.shockPct)},${y(p.returnPct)}`).join(' ');
  const step = yMax - yMin > 60 ? 10 : 5;
  const yTicks = Array.from(
    { length: Math.floor((yMax - yMin) / step) + 1 },
    (_, i) => yMin + i * step,
  );
  const xTicks = xs.filter((v) => v % 10 === 0);

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const target = xMin + ((px - M.left) / pw) * (xMax - xMin);
    const nearest = curve.reduce((best, p) =>
      Math.abs(p.shockPct - target) < Math.abs(best.shockPct - target) ? p : best,
    );
    setHover(nearest);
  };

  return (
    <figure className="space-y-2">
      <figcaption id={titleId} className="sr-only">
        Payoff at maturity versus {axisLabel} move, from {xMin}% to {xMax}%.
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-labelledby={titleId}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {yTicks.map((t) => (
          <g key={`y${t}`}>
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
              {formatPct(t, 0)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text
            key={`x${t}`}
            x={x(t)}
            y={H - M.bottom + 18}
            textAnchor="middle"
            className="fill-[var(--ink-muted)] text-[11px] font-mono"
          >
            {formatPct(t, 0)}
          </text>
        ))}
        <text
          x={M.left + pw / 2}
          y={H - 6}
          textAnchor="middle"
          className="fill-[var(--ink-muted)] text-[11px] font-mono"
        >
          {axisLabel} move at maturity
        </text>
        <line x1={M.left} x2={W - M.right} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" />

        {markers
          .filter((m) => m.shockPct >= xMin && m.shockPct <= xMax)
          .map((m) => (
            <g key={m.label}>
              <line
                x1={x(m.shockPct)}
                x2={x(m.shockPct)}
                y1={M.top}
                y2={H - M.bottom}
                stroke={m.tone === 'barrier' ? 'var(--status-breach-text)' : 'var(--ink-secondary)'}
                strokeDasharray="4 4"
              />
              <text
                x={x(m.shockPct) + 4}
                y={M.top + 12}
                className="fill-[var(--ink-secondary)] text-[10px] font-mono"
              >
                {m.label}
              </text>
            </g>
          ))}

        {breakevens
          .filter((b) => b.shockPct >= xMin && b.shockPct <= xMax)
          .map((b) => (
            <circle
              key={b.shockPct}
              cx={x(b.shockPct)}
              cy={y(0)}
              r={4}
              fill="var(--accent-gold)"
              aria-hidden
            />
          ))}

        <path d={path} fill="none" stroke="var(--chart-payoff-stroke)" strokeWidth={2.5} />
        {curve
          .filter((p) => p.knockedIn)
          .map((p) => (
            <circle
              key={`ki${p.shockPct}`}
              cx={x(p.shockPct)}
              cy={y(p.returnPct)}
              r={3}
              fill="var(--status-breach-text)"
            />
          ))}

        {currentShockPct !== null && currentShockPct >= xMin && currentShockPct <= xMax && (
          <line
            x1={x(currentShockPct)}
            x2={x(currentShockPct)}
            y1={M.top}
            y2={H - M.bottom}
            stroke="var(--accent-primary)"
            strokeWidth={2}
          />
        )}

        {hover && (
          <circle
            cx={x(hover.shockPct)}
            cy={y(hover.returnPct)}
            r={6}
            fill="none"
            stroke="var(--accent-primary)"
            strokeWidth={2}
          />
        )}
      </svg>

      <div
        className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-[var(--ink-muted)]"
        aria-live="polite"
      >
        {hover ? (
          <>
            <span>Move {formatPct(hover.shockPct, 0)}</span>
            <span>Level {hover.level.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
            <span>Payoff {formatMoney(hover.payoff, currency)}</span>
            <span>Return {formatPct(hover.returnPct)}</span>
            <span>{knockInLabel(hover.knockedIn)}</span>
          </>
        ) : (
          <span>Hover the chart for exact values.</span>
        )}
        {breakevens.length > 0 ? (
          <span>
            ● Breakeven{' '}
            {breakevens
              .map((b) => `${formatPct(b.shockPct)} (${formatLevel(b.level)})`)
              .join(' and ')}
          </span>
        ) : (
          <span>No breakeven in −99% to +100%: no loss, or a loss at every level.</span>
        )}
        <span>Red dots: barrier knocked in.</span>
      </div>
    </figure>
  );
}
