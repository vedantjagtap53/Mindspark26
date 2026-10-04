// Printable memo of one run. Holds only what the backend returned; the verdict and explanation
// sections stay empty until /api/suitability and /api/explain exist.
import { useEffect, type ReactNode } from 'react';
import { PRODUCTS } from '../constants/products';
import type { SessionRun } from '../types/session';
import { formatMoney } from '../utils/format';
import { currencyOf, investedOf, modeLabel, underlyingLabel } from '../utils/run';
import { ModelCard } from './risk/ModelCard';
import { RiskPanel } from './risk/RiskPanel';
import { ScenarioTable } from './risk/ScenarioTable';
import { RunSummary } from './simulation/RunSummary';

interface Props {
  run: SessionRun;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t border-neutral-300 pt-4">
      <h3 className="text-[11px] font-sans uppercase font-bold tracking-wider text-neutral-600">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function PrintReport({ run, onClose }: Props) {
  const ccy = currencyOf(run);
  const invested = investedOf(run);
  const r = run.response;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="print-overlay fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm overflow-y-auto p-4 sm:p-8 flex justify-center animate-modal-in"
    >
      <article
        data-theme="executive"
        role="dialog"
        aria-modal="true"
        aria-label="Simulation memo"
        className="print-memo bg-white text-black max-w-4xl w-full h-fit p-6 sm:p-12 shadow-2xl rounded-[2px] font-serif"
      >
        <div className="no-print flex items-center justify-between border-b border-neutral-300 pb-4 mb-8">
          <div className="font-mono text-xs text-neutral-600">Memo preview · {run.id}</div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-1.5 bg-[#575757] text-white font-mono text-xs uppercase tracking-wider rounded-lg hover:bg-[#3D3D3D]"
            >
              Print / save as PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 border border-neutral-300 font-mono text-xs rounded-[2px] hover:bg-neutral-100"
            >
              Close
            </button>
          </div>
        </div>

        <div className="space-y-5">
          <header className="border-b-2 border-black pb-4 flex flex-wrap justify-between items-start gap-3">
            <div>
              <div className="text-[10px] font-sans uppercase tracking-[0.25em] text-neutral-600">
                Structured products · suitability simulation
              </div>
              <h1 className="text-2xl font-bold mt-1 tracking-tight">Payoff simulation memo</h1>
              <div className="text-xs font-mono text-neutral-500 mt-1">
                Run {run.id} · {new Date(run.at).toLocaleString()}
              </div>
            </div>
            <div className="text-right text-xs font-mono">{modeLabel(run)}</div>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs font-sans">
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-500 block mb-1">
                Client profile
              </span>
              <div className="font-semibold text-sm">
                {run.profile.clientRef || 'No client reference'}
                {run.profile.label && ` · ${run.profile.label}`}
              </div>
              <div>Risk appetite: {run.profile.riskAppetite}</div>
              <div>Horizon: {run.profile.horizonMonths} months</div>
              <div>Loss tolerance: {run.profile.lossTolerancePct}%</div>
              <div>Concentration: {run.profile.concentrationPct}%</div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-500 block mb-1">
                Product
              </span>
              <div className="font-semibold text-sm">
                {run.product} · {PRODUCTS[run.product].name} on {underlyingLabel(run)}
              </div>
              {invested !== null && <div>Amount invested: {formatMoney(invested, ccy)}</div>}
              <div>Tenor: {String(run.terms.tenorDays)} calendar days</div>
              <div>Product risk rating: {PRODUCTS[run.product].riskRating}</div>
            </div>
          </div>

          <Section title="Result">
            <RunSummary run={run} />
          </Section>

          {r.mode === 'B' ? (
            <Section title="Scenario comparison">
              <ScenarioTable
                scenarios={r.scenarios}
                currency={ccy}
                levelLabel={`${underlyingLabel(run)} level`}
                compact
              />
            </Section>
          ) : (
            <>
              <Section title="Low, base and high cases">
                <RiskPanel response={r} currency={ccy} compact />
              </Section>
              <Section title="Forecast model">
                <ModelCard model={r.model} backtest={r.backtest} />
              </Section>
            </>
          )}

          <Section title="Suitability verdict">
            {run.suitability ? (
              <div className="text-xs font-sans space-y-1">
                <p className="font-mono font-bold text-sm">VERDICT: {run.suitability.verdict}</p>
                {run.suitability.flags.length === 0 ? (
                  <p>No rule raised a concern for this profile.</p>
                ) : (
                  <ul className="list-disc pl-5">
                    {run.suitability.flags.map((f) => (
                      <li key={f.rule}>
                        {f.message}
                        {f.severity === 'not_suitable' ? ' (hard flag)' : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-xs font-sans text-neutral-700">
                Not available for this run
                {run.suitabilityError ? `: ${run.suitabilityError.message}` : '.'}
              </p>
            )}
          </Section>

          {run.explanation && (
            <Section title="Explanation (AI-written from the computed results)">
              <div className="text-xs font-sans space-y-2 leading-relaxed">
                {!run.explanation.checksPassed && (
                  <p className="font-semibold">
                    Note: not every number in this text could be matched to the computed results.
                  </p>
                )}
                <p>
                  <strong>What it is.</strong> {run.explanation.sections.whatItIs}
                </p>
                <p>
                  <strong>Best case.</strong> {run.explanation.sections.bestCase}
                </p>
                <p>
                  <strong>Worst case.</strong> {run.explanation.sections.worstCase}
                </p>
                <p>
                  <strong>What causes a loss.</strong> {run.explanation.sections.lossTriggers}
                </p>
                <p>
                  <strong>Why this verdict.</strong> {run.explanation.sections.suitabilityReasoning}
                </p>
                <p className="italic">{run.explanation.riskNotice}</p>
              </div>
            </Section>
          )}

          <div className="pt-8 border-t-2 border-black grid grid-cols-1 sm:grid-cols-2 gap-8 text-xs font-sans">
            <div>
              <div className="h-10 border-b border-black mb-1" />
              <div className="font-semibold">Relationship manager</div>
            </div>
            <div>
              <div className="h-10 border-b border-black mb-1" />
              <div className="font-semibold">Supervisor sign-off and date</div>
            </div>
          </div>

          <p className="text-[9px] font-sans text-neutral-500 leading-tight pt-2 border-t border-neutral-200">
            This memo records a simulation, not a guarantee of future returns. It is not an offer,
            trade confirmation or price. Structured products can lose principal.
          </p>
        </div>
      </article>
    </div>
  );
}
