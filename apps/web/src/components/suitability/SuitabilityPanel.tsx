// Suitability verdict and flags from POST /api/suitability (deterministic backend rules,
// docs/suitability-rules.md). The browser never decides suitability; before a run it only lists
// what will be checked.
import { AlertTriangle, CheckCircle2, ListChecks, OctagonAlert } from 'lucide-react';
import type { SuitabilityVerdict } from '@mindspark/shared';
import { PRODUCTS } from '../../constants/products';
import { revealStyle } from '../../motion/reveal';
import type { ProductType, ProfileForm } from '../../state/forms';
import type { SessionRun } from '../../types/session';
import { formatPct } from '../../utils/format';
import { Placeholder, SectionHeader, Tile } from '../ui';

const RULES = [
  'Low-case loss above the client’s loss tolerance (hard)',
  'ELN: barrier knocked in in the low or base case',
  'Tenor longer than the investment horizon',
  'Concentration above the limit',
  'Product risk rating above the client’s risk appetite (hard for a low appetite)',
];

export const VERDICT_BADGE: Record<SuitabilityVerdict, string> = {
  Suitable: 'clay-badge-suitable',
  Caution: 'clay-badge-caution',
  'Not suitable': 'clay-badge-unsafe',
};

interface Props {
  product: ProductType;
  profile: ProfileForm;
  /** The run being reviewed, if any. */
  run: SessionRun | null;
}

export function SuitabilityPanel({ product, profile, run }: Props) {
  const result = run?.suitability;
  const shownProfile = run?.profile ?? profile;
  const shownProduct = run?.product ?? product;

  return (
    <Tile className="space-y-4">
      <SectionHeader
        kicker="Deterministic rules · /api/suitability"
        title="Suitability verdict"
        aside={
          <span
            key={result?.verdict ?? 'pending'}
            className={`${result ? 'badge-in ' : ''}text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
              result
                ? VERDICT_BADGE[result.verdict]
                : 'bg-[var(--well-bg)] text-[var(--ink-muted)] border border-[var(--border-color)]'
            }`}
          >
            {result ? result.verdict : 'Pending'}
          </span>
        }
      />

      <dl className="grid grid-cols-2 gap-2 text-xs">
        {[
          ['Product', `${shownProduct} · ${PRODUCTS[shownProduct].riskRating} risk`],
          ['Risk appetite', shownProfile.riskAppetite],
          ['Horizon', `${shownProfile.horizonMonths} months`],
          ['Loss tolerance', `${shownProfile.lossTolerancePct}%`],
          ['Concentration', `${shownProfile.concentrationPct}%`],
        ].map(([k, v]) => (
          <div
            key={k}
            className="p-2 rounded-lg bg-[var(--well-bg)] border border-[var(--border-subtle)]"
          >
            <dt className="text-[10px] font-mono uppercase text-[var(--ink-muted)]">{k}</dt>
            <dd className="font-semibold capitalize">{v}</dd>
          </div>
        ))}
      </dl>

      {result ? (
        <div className="space-y-2">
          {result.flags.length === 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-[var(--status-suitable-text)]">
              <CheckCircle2 className="w-4 h-4" aria-hidden /> No rule raised a concern for this
              profile.
            </p>
          ) : (
            <ul className="space-y-1.5" aria-label="Suitability flags">
              {result.flags.map((f, i) => (
                <li
                  key={f.rule}
                  className="reveal-up flex items-start gap-1.5 text-xs"
                  style={revealStyle(i)}
                >
                  {f.severity === 'not_suitable' ? (
                    <OctagonAlert
                      className="w-4 h-4 shrink-0 mt-0.5 text-[var(--status-breach-text)]"
                      aria-label="Hard flag"
                    />
                  ) : (
                    <AlertTriangle
                      className="w-4 h-4 shrink-0 mt-0.5 text-[var(--status-caution-text)]"
                      aria-label="Caution"
                    />
                  )}
                  <span>{f.message}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] font-mono text-[var(--ink-muted)]">
            Low case checked: {result.lowCase.label}, return {formatPct(result.lowCase.returnPct)}.{' '}
            {result.persisted
              ? 'Recorded in the audit database with this profile.'
              : 'Not recorded: the database is not configured.'}
            {run &&
              JSON.stringify(run.profile) !== JSON.stringify(profile) &&
              ' The profile has changed since this run: run again to re-check.'}
          </p>
        </div>
      ) : run?.suitabilityError ? (
        <Placeholder
          title={`Verdict unavailable (${run.suitabilityError.code})`}
          reason={run.suitabilityError.message}
        />
      ) : (
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold mb-1.5">
            <ListChecks className="w-4 h-4 text-[var(--ink-muted)]" aria-hidden />
            Rules that will be checked
          </h3>
          <ul className="text-[11px] text-[var(--ink-secondary)] list-disc pl-5 space-y-0.5">
            {RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="text-[10px] text-[var(--ink-muted)] mt-1.5">
            Any hard flag gives Not suitable, any other flag gives Caution, none gives Suitable. The
            verdict appears after you run a simulation.
          </p>
        </div>
      )}
    </Tile>
  );
}
