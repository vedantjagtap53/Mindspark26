// Product form plus a plain-language description of the payoff and a server check of the terms
// (POST /api/configure). Instant checks use the shared schemas; the server's answer is final.
import { useState } from 'react';
import { CheckCircle2, ShieldCheck, Sliders } from 'lucide-react';
import type { ConfigureResponse } from '@mindspark/shared';
import { ApiRequestError } from '../../api/client';
import { PRODUCTS } from '../../constants/products';
import { termIssues } from '../../schemas/terms';
import { validateTerms } from '../../services/simulation';
import { configureRequest, type Forms, type ProductType } from '../../state/forms';
import { ErrorBlock } from '../ErrorBlock';
import { SectionHeader, Tile } from '../ui';
import { CpnTermsForm } from './CPN/CpnTermsForm';
import { DcdTermsForm } from './DCD/DcdTermsForm';
import { ElnTermsForm } from './ELN/ElnTermsForm';

interface Props {
  product: ProductType;
  forms: Forms;
  onForms: (f: Forms) => void;
}

type Check =
  | { key: string; status: 'ok'; response: ConfigureResponse }
  | { key: string; status: 'error'; error: ApiRequestError };

const TONE = {
  good: 'text-[var(--status-suitable-text)]',
  bad: 'text-[var(--status-breach-text)]',
  neutral: 'text-[var(--ink-primary)]',
} as const;

export function TermsEditor({ product, forms, onForms }: Props) {
  const [check, setCheck] = useState<Check | null>(null);
  const [checking, setChecking] = useState(false);
  const issues = termIssues(product, forms);
  const issueCount = Object.keys(issues).length;
  const info = PRODUCTS[product];
  // A server check only applies to the exact request it was made for.
  const requestKey = JSON.stringify(configureRequest(product, forms));
  const currentCheck = check?.key === requestKey ? check : null;

  const runCheck = async () => {
    setChecking(true);
    try {
      setCheck({ key: requestKey, status: 'ok', response: await validateTerms(product, forms) });
    } catch (err) {
      const error =
        err instanceof ApiRequestError
          ? err
          : new ApiRequestError(0, 'UNEXPECTED_ERROR', String(err));
      setCheck({ key: requestKey, status: 'error', error });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <Tile className="lg:col-span-7 space-y-4">
        <SectionHeader
          kicker={`${product} · ${info.name}`}
          title="Product terms"
          aside={<Sliders className="w-4 h-4 text-[var(--ink-muted)]" aria-hidden />}
        />
        {product === 'ELN' && (
          <ElnTermsForm
            value={forms.ELN}
            onChange={(v) => onForms({ ...forms, ELN: v })}
            issues={issues}
          />
        )}
        {product === 'DCD' && (
          <DcdTermsForm
            value={forms.DCD}
            onChange={(v) => onForms({ ...forms, DCD: v })}
            issues={issues}
          />
        )}
        {product === 'CPN' && (
          <CpnTermsForm
            value={forms.CPN}
            onChange={(v) => onForms({ ...forms, CPN: v })}
            issues={issues}
          />
        )}
      </Tile>

      <div className="lg:col-span-5 space-y-5">
        <Tile className="space-y-3">
          <SectionHeader kicker="Transparency and disclosure" title="How the payoff works" />
          <div className="p-3.5 rounded-xl clay-tile-light border border-[var(--border-subtle)] space-y-2.5">
            {info.outcomes.map((o, i) => (
              <div
                key={o.title}
                className={`text-[11px] text-[var(--ink-secondary)] ${i ? 'pt-2 border-t border-[var(--border-subtle)]' : ''}`}
              >
                <strong className={`block ${TONE[o.tone]}`}>{o.title}</strong>
                {o.text}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[var(--ink-muted)]">
            Amounts are computed by the backend when you run the simulation.
          </p>
        </Tile>

        <Tile className="space-y-3">
          <SectionHeader kicker="POST /api/configure" title="Check terms with the server" />
          {issueCount > 0 ? (
            <p className="text-xs text-[var(--status-breach-text)]">
              {issueCount} field{issueCount > 1 ? 's need' : ' needs'} attention before the terms
              can be checked.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void runCheck()}
              disabled={checking}
              className="clay-btn-primary w-full py-2 px-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" aria-hidden />
              {checking ? 'Checking…' : 'Validate terms'}
            </button>
          )}
          {currentCheck?.status === 'ok' && (
            <div className="text-xs space-y-1" role="status">
              <p className="flex items-center gap-1.5 font-semibold text-[var(--status-suitable-text)]">
                <CheckCircle2 className="w-4 h-4" aria-hidden /> Terms accepted
              </p>
              <p className="text-[var(--ink-muted)] font-mono text-[11px]">
                Tenor {currentCheck.response.derived.tenorYears.toFixed(4)} years
                {currentCheck.response.productType === 'ELN' &&
                  ` · ${currentCheck.response.derived.variant} ELN`}
              </p>
            </div>
          )}
          {currentCheck?.status === 'error' && (
            <ErrorBlock error={currentCheck.error} onDismiss={() => setCheck(null)} />
          )}
        </Tile>
      </div>
    </div>
  );
}
