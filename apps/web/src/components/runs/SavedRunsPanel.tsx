// "Saved runs": the signed-in account's own runs from the database, across sessions and devices.
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { AuditSimulation } from '@mindspark/shared';
import { ApiRequestError, api } from '../../api/client';
import { ErrorBlock } from '../ErrorBlock';
import { RunTable } from './RunTable';
import { SavedRunReport } from './SavedRunReport';

const toApiError = (err: unknown) =>
  err instanceof ApiRequestError
    ? err
    : new ApiRequestError(0, 'UNEXPECTED_ERROR', err instanceof Error ? err.message : String(err));

export function SavedRunsPanel() {
  const [rows, setRows] = useState<AuditSimulation[] | null>(null);
  const [error, setError] = useState<ApiRequestError | null>(null);
  // Bumping `reload` fetches the list again (Refresh button).
  const [reload, setReload] = useState(0);
  /** The run whose full record is open, if any. */
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.runs.mine().then(
      ({ runs }) => {
        if (cancelled) return;
        setRows(runs);
        setError(null);
      },
      (err: unknown) => {
        if (!cancelled) setError(toApiError(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [reload]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--ink-muted)]">
          Every run you have saved to your account, newest first. Only you can see them.
        </p>
        <button
          type="button"
          onClick={() => setReload((n) => n + 1)}
          className="clay-btn-secondary px-2.5 py-1 text-xs font-semibold flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden />
          Refresh
        </button>
      </div>
      {error && <ErrorBlock error={error} onDismiss={() => setError(null)} />}
      {rows === null ? (
        <p className="text-xs text-[var(--ink-muted)]">{error ? '' : 'Loading your runs…'}</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-[var(--ink-muted)]">
          Nothing saved yet. A run is saved to your account when its verdict is calculated.
        </p>
      ) : (
        <RunTable rows={rows} caption="Your saved runs, newest first" onOpen={setOpenId} />
      )}
      {openId && <SavedRunReport id={openId} load={api.runs.get} onClose={() => setOpenId(null)} />}
    </div>
  );
}
