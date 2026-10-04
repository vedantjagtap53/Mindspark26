import { ArrowLeft, ArrowRight, Printer } from 'lucide-react';
import { STAGES, type Stage } from './TopNav';

const COPY: Record<Stage, { kicker: string; title: string }> = {
  MANDATE: { kicker: 'Client profile', title: '1. Capture the client mandate' },
  STRUCTURE: { kicker: 'Product and terms', title: '2. Choose a product and enter its terms' },
  SIMULATE: { kicker: 'Mode A forecast · Mode B shock', title: '3. Run the simulation' },
  OUTCOMES: { kicker: 'Payoff and risk', title: '4. Inspect payoffs and scenarios' },
  VERDICT: { kicker: 'Suitability and explanation', title: '5. Review the verdict' },
};

interface Props {
  stage: Stage;
  onStage: (s: Stage) => void;
  onPrint?: () => void;
}

export function StageHeader({ stage, onStage, onPrint }: Props) {
  const index = STAGES.findIndex((s) => s.id === stage);
  const prev = STAGES[index - 1];
  const next = STAGES[index + 1];
  const copy = COPY[stage];

  return (
    <div className="clay-tile p-3 sm:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-text)] flex items-center justify-center font-bold text-sm font-mono shrink-0">
          0{index + 1}
        </div>
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
            Stage {index + 1} of {STAGES.length} · {copy.kicker}
          </span>
          <h1 className="font-serif text-lg sm:text-xl font-bold text-[var(--ink-primary)] tracking-tight">
            {copy.title}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
        {prev && (
          <button
            type="button"
            onClick={() => onStage(prev.id)}
            className="clay-btn-secondary px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
            Back
          </button>
        )}
        {next && (
          <button
            type="button"
            onClick={() => onStage(next.id)}
            className="clay-btn-primary px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5"
          >
            Next stage
            <ArrowRight className="w-3.5 h-3.5" aria-hidden />
          </button>
        )}
        {!next && onPrint && (
          <button
            type="button"
            onClick={onPrint}
            className="clay-btn-primary px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden />
            Print memo
          </button>
        )}
      </div>
    </div>
  );
}
