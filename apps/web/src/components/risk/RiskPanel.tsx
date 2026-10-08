// Mode A risk panel: payoff, return and knock-in for the low, base and high case paths.
import type { SimulateModeAResponse } from '@mindspark/shared';
import { revealStyle } from '../../motion/reveal';
import { formatLevel, formatMoney, formatPct, knockInLabel } from '../../utils/format';

interface Props {
  response: SimulateModeAResponse;
  currency: string;
  compact?: boolean;
}

export function RiskPanel({ response, currency, compact = false }: Props) {
  const rows = [
    { name: 'Low', c: response.cases.low },
    { name: 'Base', c: response.cases.base },
    { name: 'High', c: response.cases.high },
  ];
  const cell = compact ? 'py-1.5 px-2' : 'py-2.5 px-3';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-left">
        <caption className="sr-only">Low, base and high case outcomes</caption>
        <thead>
          <tr className="border-b border-[var(--border-color)] text-[var(--ink-muted)] font-mono text-[11px] uppercase">
            <th scope="col" className={cell}>
              Case
            </th>
            <th scope="col" className={`${cell} text-right`}>
              End level
            </th>
            <th scope="col" className={`${cell} text-right`}>
              Path low
            </th>
            <th scope="col" className={`${cell} text-right`}>
              Payoff
            </th>
            <th scope="col" className={`${cell} text-right`}>
              Return
            </th>
            <th scope="col" className={cell}>
              Barrier
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
          {rows.map(({ name, c }, i) => (
            <tr key={name} className="reveal-fade" style={revealStyle(i)}>
              <th scope="row" className={`${cell} font-sans font-semibold`}>
                {name} <span className="text-[var(--ink-muted)] font-mono">P{c.percentile}</span>
              </th>
              <td className={`${cell} text-right`}>{formatLevel(c.terminal)}</td>
              <td className={`${cell} text-right text-[var(--ink-secondary)]`}>
                {formatLevel(c.pathMin)}
              </td>
              <td className={`${cell} text-right font-semibold`}>
                {formatMoney(c.payoff, currency)}
              </td>
              <td
                className={`${cell} text-right font-bold ${c.returnPct < 0 ? 'text-[var(--status-breach-text)]' : 'text-[var(--status-suitable-text)]'}`}
              >
                {formatPct(c.returnPct)}
              </td>
              <td className={cell}>
                {c.knockedIn === null ? (
                  <span className="text-[var(--ink-muted)]">{knockInLabel(null)}</span>
                ) : (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${c.knockedIn ? 'clay-badge-unsafe' : 'clay-badge-suitable'}`}
                  >
                    {knockInLabel(c.knockedIn)}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
