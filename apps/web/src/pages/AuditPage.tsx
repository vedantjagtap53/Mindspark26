// Admin: every account's saved runs with their suitability verdicts, read only.
// Everything shown was computed and stored by the backend; nothing here can be edited.
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { AuditSimulation } from '@mindspark/shared';
import { ApiRequestError, api } from '../api/client';
import { ErrorBlock } from '../components/ErrorBlock';
import { RunTable } from '../components/runs/RunTable';
import { SavedRunReport } from '../components/runs/SavedRunReport';
import { SectionHeader, Tile } from '../components/ui';

const toApiError = (err: unknown) =>
  err instanceof ApiRequestError
    ? err
    : new ApiRequestError(0, 'UNEXPECTED_ERROR', err instanceof Error ? err.message : String(err));

export function AuditPage() {
  const [rows, setRows] = useState<AuditSimulation[] | null>(null);
  const [error, setError] = useState<ApiRequestError | null>(null);

  // Bumping `reload` fetches the list again (Refresh button).
  const [reload, setReload] = useState(0);
  /** The run whose full record is open, if any. */
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.audit.simulations().then(
      ({ simulations }) => {
        if (cancelled) return;
        setRows(simulations);
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
    <div className="space-y-5">
      {error && <ErrorBlock error={error} onDismiss={() => setError(null)} />}
      <Tile>
        <SectionHeader
          kicker="Administration"
          title="Recorded simulations"
          aside={
            <button
              type="button"
              onClick={() => setReload((n) => n + 1)}
              className="clay-btn-secondary px-2.5 py-1 text-xs font-semibold flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden />
              Refresh
            </button>
          }
        />
        {rows === null ? (
          <p className="text-xs text-[var(--ink-muted)]">{error ? '' : 'Loading records…'}</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-[var(--ink-muted)]">
            No simulations have been recorded yet. They appear here once a user runs the suitability
            check.
          </p>
        ) : (
          <RunTable
            rows={rows}
            showUser
            caption="Recorded simulations, newest first"
            onOpen={setOpenId}
          />
        )}
      </Tile>
      {openId && (
        <SavedRunReport
          id={openId}
          load={api.audit.simulation}
          showUser
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
