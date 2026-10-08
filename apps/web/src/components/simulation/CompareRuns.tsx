// Two or three runs from this session side by side, for the same client conversation. Every
// figure is the backend's own result for that run; nothing is recalculated here. Runs are shown
// in the order picked and none is marked "best": the verdict for each is the only judgement.
import { useEffect, type ReactNode } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import type { SuitabilityVerdict } from '@mindspark/shared';
import { PRODUCTS } from '../../constants/products';
import type { SessionRun } from '../../types/session';
import { formatMoney, formatPct, formatProbability, knockInLabel } from '../../utils/format';
import { currencyOf, investedOf, modeLabel, underlyingLabel } from '../../utils/run';
import { revealStyle } from '../../motion/reveal';
import { PHONE_QUERY, useMediaQuery } from '../../motion/useMediaQuery';
import { LazyCarousel } from '../LazyCarousel';
import { ModalBackdrop, ModalPanel } from '../ModalMotion';
import { termPairs } from '../runs/RunTable';

export const COMPARE_MIN = 2;
export const COMPARE_MAX = 3;

const BADGE: Record<SuitabilityVerdict, string> = {
  Suitable: 'clay-badge-suitable',
  Caution: 'clay-badge-caution',
  'Not suitable': 'clay-badge-unsafe',
};

const NOT_APPLICABLE = <span className="text-[var(--ink-muted)]">—</span>;

const profileKey = (r: SessionRun) =>
  [
    r.profile.riskAppetite,
    r.profile.horizonMonths,
    r.profile.lossTolerancePct,
    r.profile.concentrationPct,
  ].join('|');

/** Notes that keep the comparison honest: what differs between the runs besides the product. */
export function comparisonNotes(runs: SessionRun[]): string[] {
  const notes: string[] = [];
  if (new Set(runs.map(profileKey)).size > 1) {
    notes.push(
      'These runs were checked against different client profiles, so their verdicts are not for the same client.',
    );
  }
  const modes = new Set(runs.map((r) => r.response.mode));
  if (modes.size > 1) {
    notes.push(
      'Mode A shows a range from a forecast and Mode B one chosen shock; their figures are not like for like.',
    );
  } else if (modes.has('B')) {
    const shocks = new Set(runs.map((r) => (r.response.mode === 'B' ? r.response.shock.pct : 0)));
    if (shocks.size > 1) notes.push('The Mode B runs use different shocks.');
  }
  if (new Set(runs.map(currencyOf)).size > 1) {
    notes.push('Amounts are in each product’s own currency and are not converted.');
  }
  return notes;
}

interface Row {
  label: string;
  cell: (r: SessionRun) => ReactNode;
}

const ROWS: Row[] = [
  {
    label: 'Product',
    cell: (r) => (
      <>
        <span className="font-semibold">
          {r.product} · {PRODUCTS[r.product].name}
        </span>
        <span className="block text-[11px] text-[var(--ink-muted)]">
          on {underlyingLabel(r)} · risk rating {PRODUCTS[r.product].riskRating}
        </span>
      </>
    ),
  },
  { label: 'Mode', cell: (r) => modeLabel(r) },
  {
    label: 'Amount invested',
    cell: (r) => {
      const invested = investedOf(r);
      return invested === null ? NOT_APPLICABLE : formatMoney(invested, currencyOf(r));
    },
  },
  { label: 'Tenor', cell: (r) => `${String(r.terms.tenorDays)} days` },
  {
    label: 'Started from',
    cell: (r) =>
      r.response.mode === 'A'
        ? `Forecast, ${r.run.trainingWindowDays}-day training window`
        : `${formatPct(r.response.shock.pct)} shock`,
  },
  {
    label: 'Payoff (base case or shock)',
    cell: (r) => {
      const res = r.response.mode === 'A' ? r.response.cases.base : r.response.result;
      return (
        <>
          <span className="font-semibold">{formatMoney(res.payoff, currencyOf(r))}</span>
          <span
            className={`block text-[11px] font-bold ${res.returnPct < 0 ? 'text-[var(--status-breach-text)]' : 'text-[var(--status-suitable-text)]'}`}
          >
            {formatPct(res.returnPct)}
          </span>
        </>
      );
    },
  },
  {
    label: 'Likely range (P5–P95 payoff)',
    cell: (r) => {
      if (r.response.mode !== 'A') return NOT_APPLICABLE;
      const q = r.response.distribution.payoffQuantiles;
      const ccy = currencyOf(r);
      return `${formatMoney(q.p5, ccy)} – ${formatMoney(q.p95, ccy)}`;
    },
  },
  {
    label: 'Low case (P5 path)',
    cell: (r) =>
      r.response.mode === 'A'
        ? `${formatPct(r.response.cases.low.returnPct)} (${formatMoney(r.response.cases.low.payoff, currencyOf(r))})`
        : NOT_APPLICABLE,
  },
  {
    label: 'Loss amount',
    cell: (r) => {
      const ccy = currencyOf(r);
      return r.response.mode === 'A'
        ? `${formatMoney(r.response.cases.low.lossAmount, ccy)} in the low case`
        : formatMoney(r.response.result.lossAmount, ccy);
    },
  },
  {
    label: 'Probability of loss',
    cell: (r) =>
      r.response.mode === 'A'
        ? formatProbability(r.response.distribution.probabilityOfLoss)
        : NOT_APPLICABLE,
  },
  {
    label: 'Barrier',
    cell: (r) => {
      if (r.response.mode === 'B') return knockInLabel(r.response.result.knockedIn);
      const p = r.response.distribution.probabilityOfKnockIn;
      return p === null ? 'No barrier' : `${formatProbability(p)} chance of knock-in`;
    },
  },
  {
    label: 'Client profile',
    cell: (r) =>
      `${r.profile.riskAppetite} risk · ${r.profile.horizonMonths} months · loss tolerance ${r.profile.lossTolerancePct}% · concentration ${r.profile.concentrationPct}%`,
  },
  {
    label: 'Suitability verdict',
    cell: (r) => {
      if (!r.suitability) {
        return (
          <span className="text-[var(--ink-muted)]">
            {r.suitabilityError ? `Not available: ${r.suitabilityError.message}` : 'Pending'}
          </span>
        );
      }
      const { verdict, flags } = r.suitability;
      return (
        <>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${BADGE[verdict]}`}>
            {verdict}
          </span>
          {flags.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-[11px] text-[var(--ink-secondary)]">
              {flags.map((f) => (
                <li key={f.rule}>
                  {f.severity === 'not_suitable' ? 'Breach' : 'Caution'}: {f.message}
                </li>
              ))}
            </ul>
          )}
        </>
      );
    },
  },
  {
    label: 'Terms',
    cell: (r) => (
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono text-[11px] text-[var(--ink-secondary)]">
        {termPairs(r.terms).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-[var(--ink-muted)]">{k}</dt>
            <dd className="break-all">{v}</dd>
          </div>
        ))}
      </dl>
    ),
  },
];

interface Props {
  runs: SessionRun[];
  onClose: () => void;
}

/**
 * Phone layout: each run is its own card and the user swipes between them, because a 3-column
 * table does not fit. It shows exactly the same rows and the same backend figures as the table.
 */
function CompareCards({ runs }: { runs: SessionRun[] }) {
  return (
    <LazyCarousel label={`Runs to compare, ${runs.length}`} slidesPerView={1.06}>
      {runs.map((r) => (
        <article
          key={r.id}
          aria-label={`Run ${r.id}`}
          className="clay-tile-light p-3 space-y-2 text-xs"
        >
          <h3 className="text-[11px] font-mono uppercase text-[var(--ink-muted)]">
            {r.id} · {new Date(r.at).toLocaleTimeString()}
          </h3>
          <dl className="space-y-2">
            {ROWS.map((row) => (
              <div key={row.label} className="border-t border-[var(--border-subtle)] pt-2">
                <dt className="text-[11px] font-semibold text-[var(--ink-muted)]">{row.label}</dt>
                <dd className="text-[var(--ink-primary)]">{row.cell(r)}</dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </LazyCarousel>
  );
}

export function CompareRuns({ runs, onClose }: Props) {
  const notes = comparisonNotes(runs);
  const phone = useMediaQuery(PHONE_QUERY);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <ModalBackdrop
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 no-print"
    >
      <ModalPanel
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-title"
        className="clay-tile text-[var(--ink-primary)] max-w-6xl w-full max-h-[90vh] rounded-3xl flex flex-col overflow-hidden border border-[var(--border-strong)]"
      >
        <div className="h-14 border-b border-[var(--border-color)] bg-[var(--well-bg)] px-4 sm:px-6 flex items-center justify-between shrink-0">
          <span id="compare-title" className="font-serif text-base font-bold">
            Compare {runs.length} runs
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-xl clay-btn-secondary flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-[var(--card-bg)] p-4 sm:p-6 space-y-4">
          {notes.length > 0 && (
            <ul className="space-y-1 rounded-2xl border border-[var(--border-color)] bg-[var(--well-bg)] p-3 text-xs text-[var(--ink-secondary)]">
              {notes.map((n) => (
                <li key={n} className="flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
                  {n}
                </li>
              ))}
            </ul>
          )}

          {phone ? (
            <CompareCards runs={runs} />
          ) : (
            <table className="w-full text-xs">
              <caption className="sr-only">Selected runs side by side</caption>
              <thead>
                <tr className="text-left">
                  <th scope="col" className="py-2 pr-3 w-40">
                    <span className="sr-only">Figure</span>
                  </th>
                  {runs.map((r) => (
                    <th
                      key={r.id}
                      scope="col"
                      className="py-2 pr-3 align-bottom text-[11px] font-mono uppercase text-[var(--ink-muted)]"
                    >
                      {r.id}
                      <span className="block normal-case">
                        {new Date(r.at).toLocaleTimeString()}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, i) => (
                  <tr
                    key={row.label}
                    className="reveal-fade border-t border-[var(--border-subtle)] align-top"
                    style={revealStyle(i)}
                  >
                    <th
                      scope="row"
                      className="py-2 pr-3 text-left text-[11px] font-semibold text-[var(--ink-muted)]"
                    >
                      {row.label}
                    </th>
                    {runs.map((r) => (
                      <td key={r.id} className="py-2 pr-3 text-[var(--ink-primary)]">
                        {row.cell(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="flex items-start gap-1.5 text-[11px] text-[var(--ink-muted)]">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
            Each column is a simulation, not a guarantee, with the backend’s own verdict for its
            client profile. The comparison does not rank the products or recommend one.
          </p>
        </div>
      </ModalPanel>
    </ModalBackdrop>
  );
}
