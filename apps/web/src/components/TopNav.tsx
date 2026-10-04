import {
  BarChart3,
  Compass,
  FileCheck,
  History,
  Loader2,
  Printer,
  Sliders,
  Sparkles,
} from 'lucide-react';
import type { ProductType } from '../state/forms';

export type Stage = 'MANDATE' | 'STRUCTURE' | 'SIMULATE' | 'OUTCOMES' | 'VERDICT';

export const STAGES: Array<{ id: Stage; label: string; icon: typeof Compass }> = [
  { id: 'MANDATE', label: '1. Mandate', icon: Compass },
  { id: 'STRUCTURE', label: '2. Structure', icon: Sliders },
  { id: 'SIMULATE', label: '3. Simulate', icon: Sparkles },
  { id: 'OUTCOMES', label: '4. Payoffs', icon: BarChart3 },
  { id: 'VERDICT', label: '5. Verdict', icon: FileCheck },
];



interface Props {
  stage: Stage;
  onStage: (s: Stage) => void;
  product: ProductType;
  onProduct: (p: ProductType) => void;
  runCount: number;
  onOpenRuns: () => void;
  /** Absent when there is no result to print. */
  onPrint?: () => void;
  loading: boolean;
  elapsedSeconds: number;
}

export function TopNav({
  stage,
  onStage,
  product,
  onProduct,
  runCount,
  onOpenRuns,
  onPrint,
  loading,
  elapsedSeconds,
}: Props) {
  return (
    <header className="no-print sticky top-0 z-20 border-b border-[var(--border-color)] bg-[var(--canvas-bg)]/95 backdrop-blur">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 flex flex-wrap items-center gap-3 justify-between">
        <div>
          <span className="font-serif text-lg font-bold text-[var(--ink-primary)]">
            FinStrukt
          </span>
          <span className="block text-[11px] font-mono text-[var(--ink-muted)]">
            Structured products suitability simulator
          </span>
        </div>

        <nav aria-label="Journey stages" className="flex flex-wrap gap-1">
          {STAGES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onStage(id)}
              aria-current={stage === id ? 'step' : undefined}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                stage === id
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-text)]'
                  : 'text-[var(--ink-secondary)] hover:bg-[var(--well-bg)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">

          {loading && (
            <span
              role="status"
              className="flex items-center gap-1 text-[11px] font-mono text-[var(--ink-muted)]"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              {elapsedSeconds.toFixed(1)}s
            </span>
          )}
          <button
            type="button"
            onClick={onOpenRuns}
            className="clay-btn-secondary px-2.5 py-1 text-xs font-semibold flex items-center gap-1.5"
          >
            <History className="w-3.5 h-3.5" aria-hidden />
            Runs
            <span className="font-mono text-[10px] text-[var(--ink-muted)]">{runCount}</span>
          </button>
          <button
            type="button"
            onClick={onPrint}
            disabled={!onPrint}
            aria-label="Print memo"
            title={onPrint ? 'Print memo' : 'Run a simulation to print a memo'}
            className="clay-btn-secondary p-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
}
