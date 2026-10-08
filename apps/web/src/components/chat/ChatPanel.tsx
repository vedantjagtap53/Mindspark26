// Explanation (POST /api/explain) and chat (POST /api/chat). The text comes from the AI service
// (services/rag), which explains the backend's numbers and verdict; it never changes them.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, MessageSquare, RefreshCw, Send, Sparkles } from 'lucide-react';
import { CHAT_QUESTION_MAX_CHARS } from '@mindspark/shared';
import type { ApiRequestError } from '../../api/client';
import { useElapsed } from '../../hooks/useElapsed';
import { toApiError } from '../../hooks/useSimulation';
import { groupSources } from '../../utils/sources';

/** Start time of a request; only called from event handlers. */
const clock = () => Date.now();
import { askChat, explain } from '../../services/simulation';
import type { ChatMessage, SessionRun } from '../../types/session';
import { ErrorBlock } from '../ErrorBlock';
import { Placeholder, SectionHeader, Tile } from '../ui';

type UpdateRun = (
  id: string,
  patch: Partial<SessionRun> | ((run: SessionRun) => Partial<SessionRun>),
) => void;

interface Props {
  run: SessionRun | null;
  onUpdate: UpdateRun;
}

/** Why the AI panels cannot be used yet, or null when they can. */
function blocker(run: SessionRun | null): { title: string; reason: string } | null {
  if (!run) {
    return { title: 'No simulation yet', reason: 'Run a simulation first (stage 3).' };
  }
  if (!run.suitability) {
    return {
      title: 'Verdict needed first',
      reason:
        'The explanation and chat explain the suitability verdict, which is not available for this run.',
    };
  }
  return null;
}

const SECTIONS = [
  ['whatItIs', 'What it is'],
  ['bestCase', 'Best case'],
  ['worstCase', 'Worst case'],
  ['lossTriggers', 'What causes a loss'],
  ['suitabilityReasoning', 'Why this verdict'],
] as const;

/** "Writing the explanation… 7 s (usually about 20 s)" while an AI request is running. */
function Progress({
  label,
  startedAt,
  typical,
}: {
  label: string;
  startedAt: number;
  typical: string;
}) {
  const elapsed = useElapsed(startedAt);
  return (
    <p role="status" className="text-xs text-[var(--ink-muted)] italic">
      {label}… {elapsed} s{elapsed < 60 ? ` (usually ${typical})` : ' (taking longer than usual)'}
    </p>
  );
}

/** Retrieved passages the text was grounded in, grouped by document. */
function Sources({ model, sources }: { model: string; sources: string[] }) {
  const groups = groupSources(sources);
  return (
    <details className="text-[10px] text-[var(--ink-muted)]">
      <summary className="font-mono cursor-pointer select-none">
        {model}
        {groups.length > 0 &&
          ` · grounded in ${groups.length} document${groups.length > 1 ? 's' : ''}`}
      </summary>
      <ul className="mt-1 space-y-0.5 pl-3">
        {groups.map((g) => (
          <li key={g.document}>
            <span className="font-semibold text-[var(--ink-secondary)]">{g.document}</span>
            {g.sections.length > 0 && `: ${g.sections.join(' · ')}`}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function ExplanationPanel({ run, onUpdate }: Props) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const blocked = blocker(run);
  const explanation = run?.explanation;
  const pending = startedAt !== null;

  const generate = async () => {
    if (!run) return;
    setStartedAt(clock());
    setError(null);
    try {
      const result = await explain(run.response.simulationId);
      onUpdate(run.id, { explanation: result });
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setStartedAt(null);
    }
  };

  return (
    <Tile className="space-y-3">
      <SectionHeader
        kicker="POST /api/explain · AI service"
        title="Plain-language explanation"
        aside={
          explanation && (
            <button
              type="button"
              onClick={() => void generate()}
              disabled={pending}
              className="clay-btn-secondary px-2.5 py-1 text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden /> Regenerate
            </button>
          )
        }
      />
      {startedAt !== null && (
        <Progress label="Writing the explanation" startedAt={startedAt} typical="about 20 s" />
      )}
      {blocked ? (
        <Placeholder title={blocked.title} reason={blocked.reason} />
      ) : explanation ? (
        <div className={`space-y-3 ${pending ? 'opacity-50' : ''}`}>
          {!explanation.checksPassed && (
            <p
              role="alert"
              className="flex items-start gap-1.5 text-xs text-[var(--status-caution-text)]"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
              <span>
                The AI service could not match every number in this text to the computed results
                {explanation.ungroundedNumbers.length > 0 &&
                  ` (${explanation.ungroundedNumbers.join(', ')})`}
                . Check it against the figures above before sharing it.
              </span>
            </p>
          )}
          {SECTIONS.map(([key, title]) => (
            <section key={key}>
              <h3 className="text-[11px] font-mono uppercase text-[var(--ink-muted)] font-semibold">
                {title}
              </h3>
              <p className="text-xs leading-relaxed text-[var(--ink-primary)]">
                {explanation.sections[key]}
              </p>
            </section>
          ))}
          <p className="text-[11px] text-[var(--ink-secondary)] italic">{explanation.riskNotice}</p>
          <Sources model={explanation.model} sources={explanation.sources} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void generate()}
          disabled={pending}
          className="clay-btn-primary w-full py-2 px-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" aria-hidden />
          {pending ? 'Writing…' : 'Generate explanation'}
        </button>
      )}
      {error && <ErrorBlock error={error} onDismiss={() => setError(null)} />}
    </Tile>
  );
}

const QUICK_PROMPTS = [
  'Explain the barrier in plain language',
  'Summarise the downside for the client',
  'What happens if the underlying drops 15%?',
  'Why is this the verdict?',
];

export function ChatPanel({ run, onUpdate }: Props) {
  const [question, setQuestion] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const blocked = blocker(run);
  const messages = run?.chat ?? [];
  const pending = startedAt !== null;

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages.length, pending]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!run || !q || pending) return;
    const history = messages.map(({ role, content }) => ({ role, content }));
    const userMessage: ChatMessage = { role: 'user', content: q };
    onUpdate(run.id, (r) => ({ chat: [...r.chat, userMessage] }));
    setQuestion('');
    setStartedAt(clock());
    setError(null);
    try {
      const answer = await askChat(run.response.simulationId, q, history);
      onUpdate(run.id, (r) => ({
        chat: [...r.chat, { role: 'assistant', content: answer.answer, answer }],
      }));
    } catch (err) {
      // Drop the unanswered question from the history and give it back to the RM to retry.
      onUpdate(run.id, (r) => ({ chat: r.chat.filter((m) => m !== userMessage) }));
      setQuestion(q);
      setError(toApiError(err));
    } finally {
      setStartedAt(null);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(question);
  };

  return (
    <Tile className="space-y-3">
      <SectionHeader
        kicker="POST /api/chat · AI service"
        title="Ask about this simulation"
        aside={<MessageSquare className="w-4 h-4 text-[var(--ink-muted)]" aria-hidden />}
      />
      {blocked ? (
        <Placeholder title={blocked.title} reason={blocked.reason} />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                disabled={pending}
                onClick={() => void send(p)}
                className="px-2.5 py-1 rounded-lg text-xs bg-[var(--well-bg)] text-[var(--ink-primary)] hover:bg-[var(--accent-primary)] hover:text-[var(--accent-text)] transition-colors text-left disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>

          <div
            className="p-3 rounded-xl clay-tile-light border border-[var(--border-subtle)] h-64 overflow-y-auto space-y-2.5"
            aria-live="polite"
            aria-label="Conversation"
          >
            {messages.length === 0 && !pending && (
              <p className="text-xs text-[var(--ink-muted)]">
                Questions are answered from this simulation’s numbers, its verdict and the product
                notes. Off-topic questions are declined.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`reveal-up flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl p-2.5 text-xs leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-text)]'
                      : m.answer?.scope === 'out_of_scope'
                        ? 'bg-[var(--well-bg)] text-[var(--ink-muted)] italic border border-[var(--border-subtle)]'
                        : 'bg-[var(--well-bg)] text-[var(--ink-primary)] border border-[var(--border-subtle)]'
                  }`}
                >
                  {m.content}
                </div>
                {m.answer && (
                  <span className="text-[9px] text-[var(--ink-muted)] mt-0.5 px-1 font-mono">
                    {m.answer.scope === 'out_of_scope' ? 'Outside this simulation · ' : ''}
                    {m.answer.riskNote}
                  </span>
                )}
              </div>
            ))}
            {startedAt !== null && (
              <Progress label="Answering" startedAt={startedAt} typical="under 10 s" />
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={onSubmit} className="flex gap-2">
            <label htmlFor="chat-input" className="sr-only">
              Question
            </label>
            <input
              id="chat-input"
              type="text"
              value={question}
              maxLength={CHAT_QUESTION_MAX_CHARS}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about this product, its outcomes or the verdict"
              className="clay-inset flex-1 px-3 py-2 text-xs text-[var(--ink-primary)] focus:outline-none"
            />
            <button
              type="submit"
              disabled={pending || !question.trim()}
              className="clay-btn-primary px-3.5 py-2 text-xs font-semibold flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5" aria-hidden />
              <span className="hidden sm:inline">Ask</span>
            </button>
          </form>
        </>
      )}
      {error && <ErrorBlock error={error} onDismiss={() => setError(null)} />}
    </Tile>
  );
}
