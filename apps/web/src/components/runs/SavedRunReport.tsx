// One saved run, opened from the database: the evidence record of its suitability check
// (PRD §7.2), printable as a memo. Shows only what the backend stored when the run was made;
// nothing is recalculated or editable here.
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { SavedRunDetail, SavedRunResponse } from '@mindspark/shared';
import { ApiRequestError } from '../../api/client';
import { PRODUCTS } from '../../constants/products';
import {
  formatLevel,
  formatMoney,
  formatPct,
  formatProbability,
  knockInLabel,
} from '../../utils/format';
import { termPairs } from './RunTable';

interface Props {
  id: string;
  /** Fetches the run: the user's own route, or the admin's. */
  load: (id: string) => Promise<SavedRunResponse>;
  /** Admin view: name the account that made the run. */
  showUser?: boolean;
  onClose: () => void;
}

const toApiError = (err: unknown) =>
  err instanceof ApiRequestError
    ? err
    : new ApiRequestError(0, 'UNEXPECTED_ERROR', err instanceof Error ? err.message : String(err));

/** Payoffs are in the deposit currency for a DCD and in rupees for the Nifty-linked notes. */
function currencyOf(r: SavedRunDetail): string {
  if (r.productType !== 'DCD') return 'INR';
  return r.currencyPair?.split('/')[0]?.toUpperCase() ?? 'USD';
}

/** Reads a nested value from the stored forecast metadata, which is free-form JSON. */
function pick(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (v, k) =>
        v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined,
      obj,
    );
}
const text = (v: unknown): string | null =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : null;
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

const SCENARIO_LABEL: Record<string, string> = {
  low: 'Low case',
  base: 'Base case',
  high: 'High case',
  shock: 'Shock',
};

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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="text-neutral-500">{label}: </span>
      {children}
    </div>
  );
}

function StartedFrom({ run }: { run: SavedRunDetail }) {
  const i = run.inputs;
  if (run.mode === 'B') {
    return (
      <div className="text-xs font-sans space-y-0.5">
        <Field label="Starting level">
          {i.levelValue === null ? '—' : formatLevel(i.levelValue)} ({i.levelSource ?? 'unknown'}
          {run.levelAsOf ? `, ${run.levelAsOf}` : ''})
        </Field>
        <Field label="Shock">
          {i.shockPct === null ? '—' : formatPct(i.shockPct)} to{' '}
          {i.shockedLevel === null ? '—' : formatLevel(i.shockedLevel)}
        </Field>
      </div>
    );
  }
  const f = run.forecast;
  const start = text(pick(f, 'data.trainingStart'));
  const end = text(pick(f, 'data.trainingEnd'));
  const spot = num(pick(f, 'data.spot'));
  const asOf = text(pick(f, 'data.asOf'));
  const tradingDays = num(pick(f, 'horizon.tradingDays'));
  return (
    <div className="text-xs font-sans space-y-0.5">
      <Field label="Training window">
        {i.trainingWindowYears === null ? '—' : `${i.trainingWindowYears.toFixed(2)} years`}
        {start && end ? ` (${start} to ${end})` : ''}
      </Field>
      {spot !== null && (
        <Field label="Spot">
          {formatLevel(spot)}
          {asOf ? ` (close ${asOf})` : ''}
        </Field>
      )}
      {tradingDays !== null && <Field label="Horizon">{tradingDays} trading days</Field>}
    </div>
  );
}

function ForecastModel({ forecast }: { forecast: Record<string, unknown> }) {
  const name = text(pick(forecast, 'model.name'));
  const version = text(pick(forecast, 'model.version'));
  const simulations = num(pick(forecast, 'model.simulations'));
  const drift = text(pick(forecast, 'model.drift.method'));
  const coverage = num(pick(forecast, 'backtest.bandCoverage'));
  const baseMape = num(pick(forecast, 'backtest.baseMape'));
  const naiveMape = num(pick(forecast, 'backtest.naiveMape'));
  return (
    <div className="text-xs font-sans space-y-0.5">
      <Field label="Model">
        {name ?? '—'}
        {version ? ` v${version}` : ''}
        {simulations !== null ? `, ${simulations} simulated paths` : ''}
      </Field>
      {drift && <Field label="Drift">{drift}</Field>}
      {coverage !== null && (
        <Field label="Backtest">
          P5–P95 band held the outcome {formatProbability(coverage)} of the time
          {baseMape !== null && naiveMape !== null
            ? `; base-case error ${baseMape.toFixed(1)}% vs ${naiveMape.toFixed(1)}% for a no-change forecast`
            : ''}
        </Field>
      )}
    </div>
  );
}

function RunRecord({ run, showUser }: { run: SavedRunDetail; showUser: boolean }) {
  const ccy = currencyOf(run);
  const product = PRODUCTS[run.productType];
  const d = run.distribution;
  const base = run.cases.find((c) => c.scenario === 'base');

  return (
    <div className="space-y-5">
      <header className="border-b-2 border-black pb-4 flex flex-wrap justify-between items-start gap-3">
        <div>
          <div className="text-[10px] font-sans uppercase tracking-[0.25em] text-neutral-600">
            Structured products · saved suitability record
          </div>
          <h1 className="text-2xl font-bold mt-1 tracking-tight">Saved run record</h1>
          <div className="text-xs font-mono text-neutral-500 mt-1">
            Run {run.id} · saved {new Date(run.createdAt).toLocaleString()}
          </div>
        </div>
        <div className="text-right text-xs font-mono">
          {run.mode === 'A' ? 'Mode A · forecast' : 'Mode B · shock'}
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs font-sans">
        <div>
          <span className="text-[10px] uppercase font-bold text-neutral-500 block mb-1">
            Client profile
          </span>
          {run.client ? (
            <>
              <div>Risk appetite: {run.client.riskAppetite}</div>
              <div>Horizon: {run.client.horizonMonths} months</div>
              <div>Loss tolerance: {run.client.lossTolerancePct}%</div>
              <div>Concentration: {run.client.concentrationPct}%</div>
            </>
          ) : (
            <div>Not recorded with this run.</div>
          )}
          {showUser && (
            <div className="mt-2">
              Run by: {run.user ? `${run.user.displayName} (${run.user.email})` : 'no account'}
            </div>
          )}
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold text-neutral-500 block mb-1">
            Product
          </span>
          <div className="font-semibold text-sm">
            {run.productType} · {product.name} on{' '}
            {run.underlyingSymbol ?? run.currencyPair ?? 'underlying'}
          </div>
          <div>Amount invested: {formatMoney(run.notional, ccy)}</div>
          <div>Tenor: {run.tenorDays} calendar days</div>
          <div>Product risk rating: {product.riskRating}</div>
        </div>
      </div>

      <Section title="Terms as run">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 font-mono text-[11px]">
          {termPairs(run.terms).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-neutral-500">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Started from">
        <StartedFrom run={run} />
      </Section>

      <Section title="Result">
        {d && base && (
          <p className="text-sm">
            Base <strong>{formatMoney(base.payoff, ccy)}</strong>, likely range{' '}
            <strong>
              {formatMoney(d.payoffQuantiles.p5, ccy)}–{formatMoney(d.payoffQuantiles.p95, ccy)}
            </strong>{' '}
            (5th–95th percentile of {d.pathCount} paths). Probability of loss{' '}
            {formatProbability(d.probabilityOfLoss)}
            {d.probabilityOfKnockIn === null
              ? '.'
              : `; probability of knock-in ${formatProbability(d.probabilityOfKnockIn)}.`}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-sans">
            <caption className="sr-only">Stored results for each case</caption>
            <thead>
              <tr className="text-left text-[10px] uppercase text-neutral-500">
                <th className="py-1 pr-3">Case</th>
                <th className="py-1 pr-3 text-right">Level at maturity</th>
                {run.mode === 'A' && <th className="py-1 pr-3 text-right">Lowest on path</th>}
                <th className="py-1 pr-3 text-right">Payoff</th>
                <th className="py-1 pr-3 text-right">Return</th>
                <th className="py-1 pr-3 text-right">Loss</th>
                <th className="py-1">Barrier</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {run.cases.map((c) => (
                <tr key={c.scenario} className="border-t border-neutral-200">
                  <td className="py-1 pr-3 font-sans">
                    {SCENARIO_LABEL[c.scenario] ?? c.scenario}
                    {c.percentile !== null && ` (P${c.percentile})`}
                  </td>
                  <td className="py-1 pr-3 text-right">{formatLevel(c.terminal)}</td>
                  {run.mode === 'A' && (
                    <td className="py-1 pr-3 text-right">
                      {c.pathMin === null ? '—' : formatLevel(c.pathMin)}
                    </td>
                  )}
                  <td className="py-1 pr-3 text-right">{formatMoney(c.payoff, ccy)}</td>
                  <td className="py-1 pr-3 text-right">{formatPct(c.returnPct)}</td>
                  <td className="py-1 pr-3 text-right">{formatMoney(c.lossAmount, ccy)}</td>
                  <td className="py-1 font-sans">{knockInLabel(c.knockedIn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {run.forecast && (
        <Section title="Forecast model">
          <ForecastModel forecast={run.forecast} />
        </Section>
      )}

      <Section title="Suitability verdict">
        {run.verdict ? (
          <div className="text-xs font-sans space-y-1">
            <p className="font-mono font-bold text-sm">VERDICT: {run.verdict}</p>
            {run.flags.length === 0 ? (
              <p>No rule raised a concern for this profile.</p>
            ) : (
              <ul className="list-disc pl-5">
                {run.flags.map((f) => (
                  <li key={f.rule}>
                    {f.reason}
                    {f.hard ? ' (hard flag)' : ''}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-neutral-500">
              Rules version {run.rulesVersion ?? '—'}
              {run.assessedAt ? `, checked ${new Date(run.assessedAt).toLocaleString()}` : ''}
            </p>
          </div>
        ) : (
          <p className="text-xs font-sans text-neutral-700">No verdict was recorded.</p>
        )}
      </Section>

      {run.explanations.map((e, i) => (
        <Section
          key={`${e.createdAt}-${i}`}
          title={`Explanation${run.explanations.length > 1 ? ` ${i + 1}` : ''} (AI-written from the computed results)`}
        >
          <div className="text-xs font-sans space-y-1 leading-relaxed">
            <p className="whitespace-pre-wrap">{e.text}</p>
            <p className="text-neutral-500">
              {e.model} · {new Date(e.createdAt).toLocaleString()}
              {e.sources && e.sources.length > 0 ? ` · sources: ${e.sources.join(', ')}` : ''}
            </p>
          </div>
        </Section>
      ))}

      <p className="text-[9px] font-sans text-neutral-500 leading-tight pt-2 border-t border-neutral-200">
        This record shows a simulation as it was saved, not a guarantee of future returns. It is not
        an offer, trade confirmation or price. Structured products can lose principal.
      </p>
    </div>
  );
}

export function SavedRunReport({ id, load, showUser = false, onClose }: Props) {
  const [run, setRun] = useState<SavedRunDetail | null>(null);
  const [error, setError] = useState<ApiRequestError | null>(null);

  useEffect(() => {
    // Mounted afresh for each run opened (the overlay covers the list), so there is no state to reset.
    let cancelled = false;
    load(id).then(
      (res) => {
        if (!cancelled) setRun(res.run);
      },
      (err: unknown) => {
        if (!cancelled) setError(toApiError(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, load]);

  // Escape closes this record only, not the Runs window under it: caught first and stopped there.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // Rendered at the top of the page: the Runs window it opens from is hidden when printing.
  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="print-overlay fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm overflow-y-auto p-4 sm:p-8 flex justify-center animate-modal-in"
    >
      <article
        data-theme="executive"
        role="dialog"
        aria-modal="true"
        aria-label="Saved run record"
        className="print-memo bg-white text-black max-w-4xl w-full h-fit p-6 sm:p-12 shadow-2xl rounded-[2px] font-serif"
      >
        <div className="no-print flex items-center justify-between border-b border-neutral-300 pb-4 mb-8">
          <div className="font-mono text-xs text-neutral-600">Saved run · {id}</div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!run}
              className="px-4 py-1.5 bg-[#575757] text-white font-mono text-xs uppercase tracking-wider rounded-lg hover:bg-[#3D3D3D] disabled:opacity-50"
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

        {error ? (
          <p role="alert" className="text-sm font-sans">
            This run could not be opened: {error.message}
          </p>
        ) : run ? (
          <RunRecord run={run} showUser={showUser} />
        ) : (
          <p className="text-xs font-sans text-neutral-600">Loading the saved run…</p>
        )}
      </article>
    </div>,
    document.body,
  );
}
