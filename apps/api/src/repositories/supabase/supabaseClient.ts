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
  error: { code?: string; message: string; details?: string | null } | null;
  status: number;
}

/**
 * Failures that happen while connecting, before a request leaves this machine. Only these are
 * retried, so a write can never be applied twice.
 */
const CONNECT_PHASE_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
]);
const CONNECT_RETRY_DELAYS_MS = [300, 900];

/** The Node error code behind a failed fetch (`TypeError: fetch failed` hides it in `cause`). */
function causeCode(err: unknown): string | undefined {
  const cause = (err as { cause?: { code?: unknown; errors?: unknown[] } } | null)?.cause;
  const nested = Array.isArray(cause?.errors) ? (cause.errors[0] as { code?: unknown }) : undefined;
  const code = cause?.code ?? nested?.code;
  return typeof code === 'string' ? code : undefined;
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
  if (
    code === 'PGRST205' ||
    code === '42P01' ||
    code === 'PGRST202' ||
    code === '42883' ||
    code === '42703'
  ) {
    // Missing table, column or function: the project answered, but supabase/migrations is not applied.
    return new RepositoryError(
      'unavailable',
      `Database schema is missing; apply supabase/migrations (${message})`,
    );
  }
  if (status === 0) {
    // fetch failures and timeouts carry no HTTP status. Say why: it is the only clue.
    const details = (err as { details?: unknown } | null)?.details;
    const why = [message, typeof details === 'string' ? details : ''].filter(Boolean).join(': ');
    if (/AbortError|TimeoutError|aborted due to timeout/i.test(why)) {
      return new RepositoryError(
        'unavailable',
        `Supabase did not answer within ${DB_TIMEOUT_MS / 1000} s (${why})`,
      );
    }
    return new RepositoryError('unavailable', `Supabase is unreachable (${why || 'no detail'})`);
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
  const timedFetch: typeof fetch = async (input, init) => {
    for (let attempt = 0; ; attempt++) {
      // A fresh timeout per attempt: each try gets the full time to connect and answer.
      const timeout = AbortSignal.timeout(DB_TIMEOUT_MS);
      const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      try {
        return await fetchImpl(input, { ...init, signal });
      } catch (err) {
        const code = causeCode(err);
        const delay = CONNECT_RETRY_DELAYS_MS[attempt];
        if (delay === undefined || !code || !CONNECT_PHASE_CODES.has(code)) throw err;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  };
  return createClient(db.url, db.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: timedFetch },
  });
}
