// Runs from this browser session (prototype: "Saved Simulations & Audit Archive"). The audit record
// is the backend's job (/api/suitability saves the simulation); until then nothing here is persisted.
import { useEffect, useState } from 'react';
import { ArrowRight, History, Printer, X } from 'lucide-react';
import type { SessionRun } from '../types/session';
import { formatMoney, formatPct } from '../utils/format';
import { currencyOf, investedOf, modeLabel, underlyingLabel } from '../utils/run';
import { RunSummary } from './simulation/RunSummary';
import { Placeholder } from './ui';

interface Props {
  runs: SessionRun[];
  onLoad: (run: SessionRun) => void;
  onPrint: (run: SessionRun) => void;
  onClose: () => void;
}

function headline(run: SessionRun): string {
  const r = run.response;
  return r.mode === 'A'
    ? `base ${formatPct(r.cases.base.returnPct)}`
    : formatPct(r.result.returnPct);
}

export function SessionRunsModal({ runs, onLoad, onPrint, onClose }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(runs[0]?.id ?? null);
  const selected = runs.find((r) => r.id === selectedId) ?? null;

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
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 no-print"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="runs-title"
        className="clay-tile text-[var(--ink-primary)] max-w-5xl w-full h-[85vh] rounded-3xl flex flex-col overflow-hidden border border-[var(--border-strong)] animate-modal-in"
      >
        <div className="h-14 border-b border-[var(--border-color)] bg-[var(--well-bg)] px-4 sm:px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[var(--accent-primary)] flex items-center justify-center text-[var(--accent-text)]">
              <History className="w-4 h-4 text-[var(--accent-gold)]" aria-hidden />
            </div>
            <div>
              <span id="runs-title" className="font-serif text-base font-bold">
                Session runs
              </span>
              <span className="text-[10px] font-mono text-[var(--ink-muted)] ml-2 font-semibold">
                ({runs.length} in this tab, not saved)
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-xl clay-btn-secondary flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          <ul className="md:w-80 max-h-48 md:max-h-none border-b md:border-b-0 md:border-r border-[var(--border-color)] bg-[var(--well-bg)] overflow-y-auto p-3 space-y-2">
            {runs.length === 0 && (
              <li className="p-6 text-center text-xs font-mono text-[var(--ink-muted)]">
                No runs yet in this session.
              </li>
            )}
            {runs.map((r) => {
              const invested = investedOf(r);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    aria-current={r.id === selectedId}
                    className={`w-full text-left p-3 rounded-2xl transition-all ${
                      r.id === selectedId
                        ? 'clay-tile-light border-l-4 border-l-[var(--accent-primary)]'
                        : 'hover:bg-[var(--well-deep)]'
                    }`}
                  >
                    <div className="flex justify-between text-[10px] font-mono text-[var(--ink-muted)] mb-1">
                      <span>{r.id}</span>
                      <span>{new Date(r.at).toLocaleTimeString()}</span>
                    </div>
                    <div className="font-semibold text-xs">
                      {r.product} · {underlyingLabel(r)}
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono mt-1 text-[var(--ink-secondary)]">
                      <span>
                        {modeLabel(r)}
                        {invested !== null && ` · ${formatMoney(invested, currencyOf(r))}`}
                      </span>
                      <span className="font-bold">{headline(r)}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex-1 bg-[var(--card-bg)] overflow-y-auto p-4 sm:p-6 space-y-4">
            {selected ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-color)] pb-4">
                  <div>
                    <div className="text-[10px] font-mono text-[var(--ink-muted)] uppercase tracking-wider">
                      {selected.id} · {new Date(selected.at).toLocaleString()}
                    </div>
                    <h2 className="font-serif text-xl font-bold">
                      {selected.product} ({underlyingLabel(selected)})
                    </h2>
                    <div className="text-xs text-[var(--ink-muted)] mt-1">
                      Client {selected.profile.clientRef || '(no reference)'} · risk appetite{' '}
                      {selected.profile.riskAppetite}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onPrint(selected)}
                      className="clay-btn-secondary px-3.5 py-1.5 text-xs font-mono uppercase flex items-center gap-1.5"
                    >
                      <Printer className="w-3.5 h-3.5" aria-hidden /> Print memo
                    </button>
                    <button
                      type="button"
                      onClick={() => onLoad(selected)}
                      className="clay-btn-primary px-3.5 py-1.5 text-xs font-mono uppercase flex items-center gap-1.5"
                    >
                      Load into desk <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
                <RunSummary run={selected} />
                <Placeholder
                  title="Not an audit record"
                  reason="Simulation records are saved by /api/suitability, which is not built yet. These runs disappear when the tab is closed."
                />
              </>
            ) : (
              <div className="p-12 text-center text-xs font-mono text-[var(--ink-muted)]">
                Select a run to view its details.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
