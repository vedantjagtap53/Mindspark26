// PRD §7.1 scenario comparison: −25%, −10%, 0%, +15% from the backend's `scenarios`.
import type { ShockOutcome } from '@mindspark/shared';
import { formatLevel, formatMoney, formatPct, knockInLabel } from '../../utils/format';

interface Props {
  scenarios: ShockOutcome[];
  currency: string;
  /** Column header for the level, e.g. "^NSEI level" or "USD/INR rate". */
  levelLabel: string;
  /** Header of the payoff column. A DCD says it is the deposit-currency equivalent. */
  payoffLabel?: string;
  compact?: boolean;
}

export function ScenarioTable({
  scenarios,
  currency,
  levelLabel,
  payoffLabel = 'Payoff',
  compact = false,
}: Props) {
  const cell = compact ? 'py-1.5 px-2' : 'py-2.5 px-3';
  // A DCD pays in the deposit or the alternate currency: show what is paid next to its equivalent.
  const showSettlement = scenarios.some((s) => s.settlement !== undefined);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-left">
        <caption className="sr-only">Payoff at each scenario shock</caption>
        <thead>
          <tr className="border-b border-[var(--border-color)] text-[var(--ink-muted)] font-mono text-[11px] uppercase">
            <th scope="col" className={cell}>
              Shock
            </th>
            <th scope="col" className={cell}>
              {levelLabel}
            </th>
            {showSettlement && (
              <th scope="col" className={`${cell} text-right`}>
                Paid as
              </th>
            )}
            <th scope="col" className={`${cell} text-right`}>
              {payoffLabel}
            </th>
            <th scope="col" className={`${cell} text-right`}>
              Return
            </th>
            <th scope="col" className={`${cell} text-right`}>
              Loss
            </th>
            <th scope="col" className={cell}>
              Barrier
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
          {scenarios.map((s) => (
            <tr key={s.shockPct} className="hover:bg-[var(--well-bg)]/50">
              <th
                scope="row"
                className={`${cell} font-bold ${s.shockPct < 0 ? 'text-[var(--status-breach-text)]' : 'text-[var(--status-suitable-text)]'}`}
              >
                {formatPct(s.shockPct, 0)}
              </th>
              <td className={`${cell} text-[var(--ink-secondary)]`}>{formatLevel(s.level)}</td>
              {showSettlement && (
                <td className={`${cell} text-right text-[var(--ink-secondary)]`}>
                  {s.settlement ? (
                    <>
                      {formatMoney(s.settlement.amount, s.settlement.currency)}
                      <span className="block text-[10px] text-[var(--ink-muted)]">
                        {s.settlement.converted ? 'converted at strike' : 'no conversion'}
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              )}
              <td className={`${cell} text-right font-semibold`}>
                {formatMoney(s.payoff, currency)}
              </td>
              <td
                className={`${cell} text-right font-bold ${s.returnPct < 0 ? 'text-[var(--status-breach-text)]' : 'text-[var(--status-suitable-text)]'}`}
              >
                {formatPct(s.returnPct)}
              </td>
              <td className={`${cell} text-right`}>{formatMoney(s.lossAmount, currency)}</td>
              <td className={cell}>
                {s.knockedIn === null ? (
                  <span className="text-[var(--ink-muted)]">{knockInLabel(null)}</span>
                ) : (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${s.knockedIn ? 'clay-badge-unsafe' : 'clay-badge-suitable'}`}
                  >
                    {knockInLabel(s.knockedIn)}
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
