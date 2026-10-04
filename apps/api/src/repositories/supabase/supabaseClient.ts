// The only place that talks to the Supabase SDK. Uses the service-role key, which is server-only;
// the schema (supabase/migrations) keeps RLS on with no policies and rejects any update or delete
// of audit records at the database, so this key cannot rewrite the audit trail either.

import { createClient } from '@supabase/supabase-js';
import type { AppConfig } from '../../config/index.js';
import { RepositoryError } from '../interfaces/index.js';

/** A database call that has not answered within this time fails as `unavailable`. */
export const DB_TIMEOUT_MS = 10_000;

/** Shape of every supabase-js query result (PostgrestError fields kept loose on purpose). */
export interface DbResult {
  data: unknown;
  error: { code?: string; message: string } | null;
  status: number;
}

/** Maps any SDK, PostgREST, Postgres or network failure to a database-neutral RepositoryError. */
export function toRepositoryError(err: unknown, status = 0): RepositoryError {
  if (err instanceof RepositoryError) return err;
  const code = (err as { code?: unknown } | null)?.code;
  const raw = (err as { message?: unknown } | null)?.message;
  const message =
    err instanceof Error ? err.message : typeof raw === 'string' ? raw : 'unknown error';
  switch (code) {
    case '23505':
      return new RepositoryError('conflict', `Duplicate value: ${message}`);
    case '23503':
      return new RepositoryError('invalid_reference', `Referenced record not found: ${message}`);
    case '22P02':
      return new RepositoryError('invalid_input', `Malformed value: ${message}`);
  }
  if (status === 401 || status === 403 || (typeof code === 'string' && /^PGRST30\d$/.test(code))) {
    return new RepositoryError('unavailable', 'Supabase rejected the service credentials');
  }
  if (code === 'PGRST205' || code === '42P01' || code === 'PGRST202' || code === '42883') {
    // Missing table or function: the project answered, but supabase/migrations is not applied.
    return new RepositoryError(
      'unavailable',
      `Database schema is missing; apply supabase/migrations (${message})`,
    );
  }
  if (status === 0) {
    // fetch failures and timeouts carry no HTTP status.
    return new RepositoryError('unavailable', 'Supabase is unreachable');
  }
  if (!code) {
    // An HTTP answer without a PostgREST error code: usually a wrong SUPABASE_URL.
    return new RepositoryError(
      'unavailable',
      `Supabase answered HTTP ${status} without a database error; check SUPABASE_URL`,
    );
  }
  return new RepositoryError('unavailable', `Database operation failed: ${message}`);
}

/** Returns the result's data, or throws the mapped RepositoryError. */
export function unwrap<T>(res: DbResult): T {
  if (res.error) throw toRepositoryError(res.error, res.status);
  return res.data as T;
}

export type Db = ReturnType<typeof createSupabaseClient>;

export function createSupabaseClient(db: AppConfig['database'], fetchImpl: typeof fetch = fetch) {
  if (!db.configured || !db.url || !db.serviceRoleKey) {
    throw new RepositoryError(
      'not_configured',
      'Supabase is not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)',
    );
  }
  const timedFetch: typeof fetch = (input, init) => {
    const timeout = AbortSignal.timeout(DB_TIMEOUT_MS);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetchImpl(input, { ...init, signal });
  };
  return createClient(db.url, db.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: timedFetch },
  });
}
