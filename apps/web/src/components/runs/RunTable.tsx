// A table of saved runs. The same component shows a user their own runs and the admin everyone's
// (`showUser`). Everything shown was computed and stored by the backend; nothing here is editable.
import type { AuditSimulation, SuitabilityVerdict } from '@mindspark/shared';
import { revealStyle } from '../../motion/reveal';

const BADGE: Record<SuitabilityVerdict, string> = {
  Suitable: 'clay-badge-suitable',
  Caution: 'clay-badge-caution',
  'Not suitable': 'clay-badge-unsafe',
};

const money = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
const signed = (n: number, digits = 1) => `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`;

/** The outcome worth a glance: the shock result (Mode B) or the base case (Mode A). */
function headlineResult(r: AuditSimulation) {
  return r.results.find((x) => x.scenario === 'shock' || x.scenario === 'base') ?? r.results[0];
}

function startText(r: AuditSimulation): string {
  if (r.mode === 'A') {
    return r.inputs.trainingWindowYears === null
      ? 'Forecast'
      : `Forecast · ${r.inputs.trainingWindowYears.toFixed(2)} y window`;
  }
  const level = r.inputs.levelValue === null ? '—' : r.inputs.levelValue.toLocaleString('en-IN');
  const shock = r.inputs.shockPct === null ? '' : ` · ${signed(r.inputs.shockPct, 0)} shock`;
  return `${level}${shock}`;
}

const show = (v: unknown): string =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
    ? String(v)
    : JSON.stringify(v);

/** Terms as `name: value` pairs; nested objects (the underlying) are flattened one level. */
export function termPairs(terms: Record<string, unknown>): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(terms)) {
    if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out.push([`${key}.${k}`, show(v)]);
      }
    } else if (value !== undefined) {
      out.push([key, show(value)]);
    }
  }
  return out;
}

interface Props {
  rows: AuditSimulation[];
  /** Adds the account column (admin view). */
  showUser?: boolean;
  caption: string;
  /** Opens the full stored record of a run. */
  onOpen?: (id: string) => void;
}

export function RunTable({ rows, showUser = false, caption, onOpen }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-left text-[11px] font-mono uppercase text-[var(--ink-muted)]">
            <th className="py-2 pr-3">Saved</th>
            {showUser && <th className="py-2 pr-3">Account</th>}
            <th className="py-2 pr-3">Product</th>
            <th className="py-2 pr-3">Started from</th>
            <th className="py-2 pr-3 text-right">Result</th>
            <th className="py-2 pr-3">Verdict</th>
            <th className="py-2">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, index) => {
            const head = headlineResult(r);
            return (
              <tr
                key={r.id}
                className="reveal-fade border-t border-[var(--border-subtle)] align-top"
                style={revealStyle(index)}
              >
                <td className="py-2 pr-3 font-mono text-[11px] text-[var(--ink-muted)]">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                {showUser && (
                  <td className="py-2 pr-3 text-[var(--ink-primary)]">
                    {r.user ? (
                      <>
                        <span className="font-semibold">{r.user.displayName}</span>
                        <span className="block text-[11px] text-[var(--ink-muted)]">
                          {r.user.email}
                        </span>
                      </>
                    ) : (
                      <span className="text-[var(--ink-muted)]">No account</span>
                    )}
                  </td>
                )}
                <td className="py-2 pr-3 text-[var(--ink-primary)]">
                  <span className="font-semibold">
                    {r.productType} · Mode {r.mode}
                  </span>
                  <span className="block font-mono text-[11px] text-[var(--ink-muted)]">
                    {r.underlyingSymbol ?? r.currencyPair ?? 'FX'} · {r.tenorDays}d ·{' '}
                    {money(r.notional)}
                  </span>
                </td>
                <td className="py-2 pr-3 font-mono text-[11px] text-[var(--ink-secondary)]">
                  {startText(r)}
                </td>
                <td className="py-2 pr-3 text-right font-mono">
                  {head ? (
                    <>
                      <span
                        className={`font-bold ${head.returnPct < 0 ? 'text-[var(--status-breach-text)]' : 'text-[var(--status-suitable-text)]'}`}
                      >
                        {signed(head.returnPct)}
                      </span>
                      <span className="block text-[11px] text-[var(--ink-muted)]">
                        {money(head.payoff)}
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2 pr-3">
                  {r.verdict ? (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${BADGE[r.verdict]}`}
                    >
                      {r.verdict}
                    </span>
                  ) : (
                    <span className="text-[var(--ink-muted)]">Pending</span>
                  )}
                </td>
                <td className="py-2">
                  {onOpen && (
                    <button
                      type="button"
                      onClick={() => onOpen(r.id)}
                      aria-label={`Open the ${r.productType} run saved ${new Date(r.createdAt).toLocaleString()}`}
                      className="clay-btn-secondary px-2.5 py-0.5 mb-1 text-[11px] font-semibold"
                    >
                      Open
                    </button>
                  )}
                  <details>
                    <summary className="cursor-pointer text-[var(--ink-secondary)] font-semibold">
                      Terms, {r.results.length} result{r.results.length === 1 ? '' : 's'},{' '}
                      {r.flags.length} flag{r.flags.length === 1 ? '' : 's'}
                    </summary>
                    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px] text-[var(--ink-secondary)]">
                      {termPairs(r.terms).map(([k, v]) => (
                        <div key={k} className="contents">
                          <dt className="text-[var(--ink-muted)]">{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-[var(--ink-secondary)]">
                      {r.results.map((x) => (
                        <li key={x.scenario}>
                          {x.scenario}: payoff {money(x.payoff)} ({x.returnPct.toFixed(1)}%)
                          {x.knockedIn ? ', barrier hit' : ''}
                        </li>
                      ))}
                      {r.flags.map((f) => (
                        <li key={f.rule}>
                          {f.hard ? 'Breach' : 'Caution'} · {f.rule}: {f.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
