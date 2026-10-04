import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import type { ApiRequestError } from '../api/client';

const FORECAST_CODES = new Set(['AI_UNAVAILABLE', 'AI_INVALID_RESPONSE']);

interface Props {
  error: ApiRequestError;
  onSwitchToModeB?: () => void;
  /** Offered when the live level or FX rate is unavailable. */
  onUseManualLevel?: () => void;
  onDismiss: () => void;
}

/** Shows the backend's error as-is. No substitute result is ever generated. */
export function ErrorBlock({ error, onSwitchToModeB, onUseManualLevel, onDismiss }: Props) {
  const forecastFailed = FORECAST_CODES.has(error.code);
  return (
    <div
      role="alert"
      className="clay-tile p-4 border-l-4 border-l-[var(--status-breach-text)] space-y-2 text-[var(--ink-primary)]"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="w-5 h-5 text-[var(--status-breach-text)] shrink-0 mt-0.5"
          aria-hidden
        />
        <div className="flex-1 space-y-1">
          <p className="text-[11px] font-mono uppercase tracking-wider text-[var(--status-breach-text)] font-bold">
            {error.code}
          </p>
          <p className="text-sm font-serif">{error.message}</p>
          {error.details.length > 0 && (
            <ul className="text-xs text-[var(--ink-secondary)] list-disc pl-4">
              {error.details.map((d) => (
                <li key={`${d.path}:${d.message}`}>
                  <span className="font-mono">{d.path || 'request'}</span>: {d.message}
                </li>
              ))}
            </ul>
          )}
          {forecastFailed && (
            <p className="text-xs text-[var(--ink-muted)]">
              No substitute forecast is ever generated. You can retry, or use Mode B (manual shock).
            </p>
          )}
          {error.code === 'MARKET_DATA_UNAVAILABLE' && (
            <p className="text-xs text-[var(--ink-muted)]">
              You can enter the starting level manually instead.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {forecastFailed && onSwitchToModeB && (
        <button
          type="button"
          onClick={onSwitchToModeB}
          className="clay-btn-primary px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
        >
          Switch to Mode B <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
      {error.code === 'MARKET_DATA_UNAVAILABLE' && onUseManualLevel && (
        <button
          type="button"
          onClick={onUseManualLevel}
          className="clay-btn-primary px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
        >
          Enter level manually <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
