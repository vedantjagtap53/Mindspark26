// Admin overview: accounts, runs and sign-ins at a glance, with charts over the last 30 days.
// Every number comes from /api/admin/analytics (the saved runs and the activity log).
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { AdminAnalytics, SuitabilityVerdict } from '@mindspark/shared';
import { ApiRequestError, api } from '../../api/client';
import { BreakdownBars, DailyChart } from '../../components/charts/AdminCharts';
import { ErrorBlock } from '../../components/ErrorBlock';
import { Metric, SectionHeader, Tile } from '../../components/ui';

const toApiError = (err: unknown) =>
  err instanceof ApiRequestError
    ? err
    : new ApiRequestError(0, 'UNEXPECTED_ERROR', err instanceof Error ? err.message : String(err));

const VERDICT_COLOR: Record<SuitabilityVerdict | 'none', string> = {
  Suitable: 'var(--status-suitable-text)',
  Caution: 'var(--status-caution-text)',
  'Not suitable': 'var(--status-breach-text)',
  none: 'var(--ink-muted)',
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'Never');

export function OverviewPanel() {
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [error, setError] = useState<ApiRequestError | null>(null);
  // Bumping `reload` fetches the numbers again (Refresh button).
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.admin.analytics().then(
      (a) => {
        if (cancelled) return;
        setData(a);
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
          title="Overview"
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
        {data === null ? (
          <p className="text-xs text-[var(--ink-muted)]">{error ? '' : 'Loading the numbers…'}</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <Metric
                label="Accounts"
                value={String(data.totals.activeUsers)}
                note={`${data.totals.users} in total`}
              />
              <Metric label="Admins" value={String(data.totals.admins)} />
              <Metric label="Runs saved" value={String(data.totals.runsAllTime)} note="all time" />
              <Metric label="Runs, 7 days" value={String(data.totals.runsLast7Days)} />
              <Metric label="Sign-ins, 7 days" value={String(data.totals.loginsLast7Days)} />
              <Metric
                label="Failed sign-ins"
                value={String(data.totals.failedLoginsLast7Days)}
                note="last 7 days"
                tone={data.totals.failedLoginsLast7Days > 0 ? 'bad' : 'neutral'}
              />
            </div>
            <p className="text-[11px] font-mono text-[var(--ink-muted)]">
              Updated {when(data.generatedAt)}. Charts cover the last {data.windowDays} days (UTC).
            </p>
            {data.truncated && (
              <p role="status" className="text-xs text-[var(--status-caution-text)]">
                There were more runs in this period than a report reads, so the charts undercount.
              </p>
            )}
          </div>
        )}
      </Tile>

      {data && (
        <>
          <Tile>
            <SectionHeader
              kicker={`Last ${data.windowDays} days`}
              title="Runs and sign-ins per day"
            />
            <DailyChart daily={data.daily} />
          </Tile>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Tile>
              <SectionHeader kicker="Runs" title="By product" />
              <BreakdownBars
                label="Runs by product"
                items={data.byProduct.map((p) => ({ label: p.product, value: p.runs }))}
              />
            </Tile>
            <Tile>
              <SectionHeader kicker="Runs" title="By mode" />
              <BreakdownBars
                label="Runs by mode"
                items={data.byMode.map((m) => ({
                  label: m.mode === 'A' ? 'Mode A · forecast' : 'Mode B · shock',
                  value: m.runs,
                }))}
              />
            </Tile>
            <Tile>
              <SectionHeader kicker="Suitability" title="Verdicts" />
              <BreakdownBars
                label="Runs by verdict"
                items={data.verdicts.map((v) => ({
                  label: v.verdict ?? 'No verdict yet',
                  value: v.count,
                  color: VERDICT_COLOR[v.verdict ?? 'none'],
                }))}
              />
            </Tile>
          </div>

          <Tile>
            <SectionHeader kicker={`Last ${data.windowDays} days`} title="Most active accounts" />
            {data.topUsers.length === 0 ? (
              <p className="text-xs text-[var(--ink-muted)]">No runs have been saved yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <caption className="sr-only">Most active accounts</caption>
                  <thead>
                    <tr className="text-left text-[11px] font-mono uppercase text-[var(--ink-muted)]">
                      <th className="py-2 pr-3">Account</th>
                      <th className="py-2 pr-3 text-right">Runs</th>
                      <th className="py-2 pr-3">Last run</th>
                      <th className="py-2">Last sign-in</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topUsers.map((u) => (
                      <tr key={u.user.id} className="border-t border-[var(--border-subtle)]">
                        <td className="py-2 pr-3">
                          <span className="font-semibold text-[var(--ink-primary)]">
                            {u.user.displayName}
                          </span>
                          <span className="block text-[11px] text-[var(--ink-muted)]">
                            {u.user.email}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right font-mono font-bold">{u.runs}</td>
                        <td className="py-2 pr-3 font-mono text-[11px] text-[var(--ink-muted)]">
                          {when(u.lastRunAt)}
                        </td>
                        <td className="py-2 font-mono text-[11px] text-[var(--ink-muted)]">
                          {when(u.lastLoginAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tile>
        </>
      )}
    </div>
  );
}
