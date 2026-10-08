// Admin activity log: sign-ups, sign-ins (and failed ones), account changes and saved runs.
// The API never puts a password, token or request body in an event; only small facts.
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ActivityEvent, ActivityEventType } from '@mindspark/shared';
import { ApiRequestError, api } from '../../api/client';
import { ErrorBlock } from '../../components/ErrorBlock';
import { SectionHeader, Segmented, Tile } from '../../components/ui';

const toApiError = (err: unknown) =>
  err instanceof ApiRequestError
    ? err
    : new ApiRequestError(0, 'UNEXPECTED_ERROR', err instanceof Error ? err.message : String(err));

const LABEL: Record<ActivityEventType, string> = {
  REGISTER: 'Registered',
  LOGIN: 'Signed in',
  LOGIN_FAILED: 'Failed sign-in',
  LOGOUT: 'Signed out',
  USER_CREATED: 'Account created',
  ROLE_CHANGED: 'Role changed',
  USER_ACTIVATED: 'Account reactivated',
  USER_DEACTIVATED: 'Account deactivated',
  RUN_SAVED: 'Run saved',
};

const BADGE: Record<ActivityEventType, string> = {
  REGISTER: 'clay-badge-suitable',
  LOGIN: 'clay-badge-suitable',
  LOGIN_FAILED: 'clay-badge-unsafe',
  LOGOUT: 'bg-[var(--well-deep)] text-[var(--ink-secondary)]',
  USER_CREATED: 'clay-badge-suitable',
  ROLE_CHANGED: 'clay-badge-caution',
  USER_ACTIVATED: 'clay-badge-suitable',
  USER_DEACTIVATED: 'clay-badge-unsafe',
  RUN_SAVED: 'clay-badge-suitable',
};

type Group = 'all' | 'signins' | 'accounts' | 'runs';
const GROUPS: Record<Group, readonly ActivityEventType[] | null> = {
  all: null,
  signins: ['REGISTER', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT'],
  accounts: ['USER_CREATED', 'ROLE_CHANGED', 'USER_ACTIVATED', 'USER_DEACTIVATED'],
  runs: ['RUN_SAVED'],
};

const FAILURE_REASON: Record<string, string> = {
  unknown_email: 'no account with this email',
  wrong_password: 'wrong password',
  inactive: 'account is deactivated',
};

const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

/** One short line of the facts stored with the event. */
function describe(e: ActivityEvent): string {
  const d = e.detail;
  switch (e.event) {
    case 'RUN_SAVED':
      return [text(d.product), d.mode ? `Mode ${text(d.mode)}` : '', text(d.verdict)]
        .filter(Boolean)
        .join(' · ');
    case 'ROLE_CHANGED':
      return `${text(d.from)} → ${text(d.to)}`;
    case 'USER_CREATED':
      return d.role ? `as ${text(d.role)}` : '';
    case 'LOGIN_FAILED':
      return FAILURE_REASON[text(d.reason)] ?? '';
    case 'LOGIN':
      return d.role ? text(d.role) : '';
    default:
      return '';
  }
}

export function ActivityPanel() {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [group, setGroup] = useState<Group>('all');
  // Bumping `reload` fetches the log again (Refresh button).
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.admin.activity().then(
      ({ events: list }) => {
        if (cancelled) return;
        setEvents(list);
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

  const allowed = GROUPS[group];
  const shown = events === null ? [] : events.filter((e) => !allowed || allowed.includes(e.event));

  return (
    <div className="space-y-5">
      {error && <ErrorBlock error={error} onDismiss={() => setError(null)} />}
      <Tile>
        <SectionHeader
          kicker="Administration"
          title="Activity log"
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
        <div className="max-w-md mb-3">
          <Segmented<Group>
            label="Show"
            value={group}
            onChange={setGroup}
            options={[
              { value: 'all', label: 'All' },
              { value: 'signins', label: 'Sign-ins' },
              { value: 'accounts', label: 'Accounts' },
              { value: 'runs', label: 'Runs' },
            ]}
          />
        </div>
        {events === null ? (
          <p className="text-xs text-[var(--ink-muted)]">{error ? '' : 'Loading the log…'}</p>
        ) : shown.length === 0 ? (
          <p className="text-xs text-[var(--ink-muted)]">Nothing to show here yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="sr-only">Recent activity, newest first</caption>
              <thead>
                <tr className="text-left text-[11px] font-mono uppercase text-[var(--ink-muted)]">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Event</th>
                  <th className="py-2 pr-3">Account</th>
                  <th className="py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.id} className="border-t border-[var(--border-subtle)] align-top">
                    <td className="py-2 pr-3 font-mono text-[11px] text-[var(--ink-muted)]">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${BADGE[e.event]}`}
                      >
                        {LABEL[e.event]}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-[var(--ink-primary)]">
                      {e.user ? (
                        <>
                          <span className="font-semibold">{e.user.displayName}</span>
                          <span className="block text-[11px] text-[var(--ink-muted)]">
                            {e.user.email}
                          </span>
                        </>
                      ) : (
                        <span className="text-[var(--ink-secondary)]">
                          {e.actorEmail ?? 'Unknown'}
                        </span>
                      )}
                    </td>
                    <td className="py-2 font-mono text-[11px] text-[var(--ink-secondary)]">
                      {describe(e)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tile>
    </div>
  );
}
