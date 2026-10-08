// Admin console: list users, create a user with any role, change roles, deactivate and reactivate.
// The API enforces every rule (no self-demotion, never zero active admins); this page shows its
// answers.
import { useEffect, useState, type FormEvent } from 'react';
import { RefreshCw, UserPlus } from 'lucide-react';
import {
  USER_ROLES,
  createUserRequestSchema,
  type AdminUser,
  type UserRole,
} from '@mindspark/shared';
import { ApiRequestError, api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ErrorBlock } from '../components/ErrorBlock';
import { ROLE_LABEL } from '../components/UserMenu';
import { Field, SectionHeader, Segmented, TextInput, Tile } from '../components/ui';

const toApiError = (err: unknown) =>
  err instanceof ApiRequestError
    ? err
    : new ApiRequestError(0, 'UNEXPECTED_ERROR', err instanceof Error ? err.message : String(err));

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'Never');

export function AdminPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('RM');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  // Bumping `reload` fetches the list again (Refresh button).
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.admin.users().then(
      ({ users: list }) => {
        if (cancelled) return;
        setUsers(list);
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

  const replace = (updated: AdminUser) =>
    setUsers((list) => list?.map((u) => (u.id === updated.id ? updated : u)) ?? null);

  const update = async (target: AdminUser, changes: { role?: UserRole; active?: boolean }) => {
    setBusyId(target.id);
    setError(null);
    try {
      replace((await api.admin.updateUser(target.id, changes)).user);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusyId(null);
    }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreated(null);
    const parsed = createUserRequestSchema.safeParse({ email, password, displayName, role });
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      setError(
        new ApiRequestError(400, 'VALIDATION_ERROR', 'Check the details you entered', [
          { path: issue.path.join('.'), message: issue.message },
        ]),
      );
      return;
    }
    setCreating(true);
    try {
      const { user } = await api.admin.createUser(parsed.data);
      setUsers((list) => [...(list ?? []), user]);
      setCreated(`${user.email} was created as ${ROLE_LABEL[user.role]}.`);
      setDisplayName('');
      setEmail('');
      setPassword('');
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-5">
      {error && <ErrorBlock error={error} onDismiss={() => setError(null)} />}

      <Tile>
        <SectionHeader
          kicker="Administration"
          title="Create a user"
          aside={
            <span className="text-xs text-[var(--ink-muted)]">
              Public sign-up only creates users.
            </span>
          }
        />
        <form
          onSubmit={(e) => void create(e)}
          noValidate
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <Field label="Full name" htmlFor="new-name">
            <TextInput id="new-name" value={displayName} onChange={setDisplayName} maxLength={80} />
          </Field>
          <Field label="Email" htmlFor="new-email">
            <TextInput
              id="new-email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="off"
            />
          </Field>
          <Field
            label="Temporary password"
            htmlFor="new-password"
            hint="At least 10 characters with a lowercase letter, an uppercase letter and a digit."
          >
            <TextInput
              id="new-password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
            />
          </Field>
          <div>
            <span className="text-xs font-mono text-[var(--ink-muted)] font-semibold block mb-1 uppercase">
              Role
            </span>
            <Segmented
              label="Role"
              value={role}
              options={USER_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
              onChange={setRole}
            />
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={creating}
              className="clay-btn-primary px-4 py-2 text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
            >
              <UserPlus className="w-4 h-4" aria-hidden />
              {creating ? 'Creating…' : 'Create user'}
            </button>
            {created && (
              <p role="status" className="text-xs text-[var(--status-suitable-text)]">
                {created}
              </p>
            )}
          </div>
        </form>
      </Tile>

      <Tile>
        <SectionHeader
          kicker="Administration"
          title="Users"
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
        {users === null ? (
          <p className="text-xs text-[var(--ink-muted)]">Loading users…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="sr-only">Users and their roles</caption>
              <thead>
                <tr className="text-left text-[11px] font-mono uppercase text-[var(--ink-muted)]">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Last sign-in</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const self = u.id === me?.id;
                  return (
                    <tr key={u.id} className="border-t border-[var(--border-subtle)]">
                      <td className="py-2 pr-3">
                        <span className="font-semibold text-[var(--ink-primary)]">
                          {u.displayName}
                          {self && ' (you)'}
                        </span>
                        <span className="block font-mono text-[11px] text-[var(--ink-muted)]">
                          {u.email}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <select
                          aria-label={`Role for ${u.email}`}
                          value={u.role}
                          disabled={self || busyId === u.id}
                          onChange={(e) => void update(u, { role: e.target.value as UserRole })}
                          className="clay-inset px-2 py-1 text-xs font-semibold text-[var(--ink-primary)]"
                        >
                          {USER_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            u.active ? 'clay-badge-suitable' : 'clay-badge-unsafe'
                          }`}
                        >
                          {u.active ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-[11px] text-[var(--ink-muted)]">
                        {formatDate(u.lastLoginAt)}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          disabled={self || busyId === u.id}
                          onClick={() => void update(u, { active: !u.active })}
                          aria-label={`${u.active ? 'Deactivate' : 'Reactivate'} ${u.email}`}
                          className="clay-btn-secondary px-2.5 py-1 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {u.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tile>
    </div>
  );
}
