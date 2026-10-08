// The browser's only route to data: the backend API. Every number shown comes from here.
import {
  PAYLOAD_HASH_HEADER,
  type ActivityResponse,
  type AdminAnalytics,
  type AdminUserResponse,
  type AdminUsersResponse,
  type ApiErrorResponse,
  type AuditSimulationsResponse,
  type AuthUserResponse,
  type ChatResponse,
  type ConfigureResponse,
  type ExplainResponse,
  type SavedRunResponse,
  type SavedRunsResponse,
  type SessionResponse,
  type SuitabilityResponse,
  type SimulateModeAContextResponse,
  type SimulateModeAResponse,
  type SimulateModeBResponse,
  type ValidationIssue,
} from '@mindspark/shared';
import { sha256Hex } from './payloadHash';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const isErrorResponse = (v: unknown): v is ApiErrorResponse =>
  typeof v === 'object' && v !== null && 'error' in v;

type Method = 'GET' | 'POST' | 'PUT';

let onSessionExpired: (() => void) | undefined;
/** Called when a request was refused as signed-out and a silent refresh did not recover it. */
export const setSessionExpiredHandler = (handler: (() => void) | undefined) => {
  onSessionExpired = handler;
};

let refreshing: Promise<boolean> | undefined;

/** Asks the API for a new access token using the refresh cookie. Concurrent callers share one call. */
function refreshSession(fetchImpl: typeof fetch): Promise<boolean> {
  refreshing ??= fetchImpl('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = undefined;
    });
  return refreshing;
}

const isAuthPath = (path: string) => path.startsWith('/api/auth/');

export async function requestJson<T>(
  method: Method,
  path: string,
  body?: unknown,
  fetchImpl: typeof fetch = fetch,
  retried = false,
): Promise<T> {
  // The body is serialized once and hashed as those exact bytes, so the server can verify them.
  const text = body === undefined ? undefined : JSON.stringify(body);
  const init: RequestInit = { method, credentials: 'same-origin' };
  if (text !== undefined) {
    init.body = text;
    init.headers = {
      'content-type': 'application/json',
      [PAYLOAD_HASH_HEADER]: await sha256Hex(text),
    };
  }
  let res: Response;
  try {
    res = await fetchImpl(path, init);
  } catch {
    throw new ApiRequestError(
      0,
      'NETWORK_ERROR',
      'The server could not be reached. Is the API running?',
    );
  }
  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (isErrorResponse(payload)) {
      const { code, message, details } = payload.error;
      // An expired access token is renewed silently once; only then is the user signed out.
      if (code === 'UNAUTHENTICATED' && !retried && !isAuthPath(path)) {
        if (await refreshSession(fetchImpl)) {
          return requestJson<T>(method, path, body, fetchImpl, true);
        }
        onSessionExpired?.();
      }
      throw new ApiRequestError(res.status, code, message, details ?? []);
    }
    throw new ApiRequestError(
      res.status,
      'UNEXPECTED_RESPONSE',
      `Server returned HTTP ${res.status}`,
    );
  }
  return payload as T;
}

export const postJson = <T>(path: string, body: unknown, fetchImpl?: typeof fetch) =>
  requestJson<T>('POST', path, body, fetchImpl);

/** A result that becomes a run: it has a payoff, a verdict and a session entry. */
export type SimulateRunResponse = SimulateModeAResponse | SimulateModeBResponse;

/** What /api/simulate can return: a run, or (DCD in Mode A) the Nifty 50 forecast as context. */
export type SimulateResponse = SimulateRunResponse | SimulateModeAContextResponse;

export const isForecastContext = (r: SimulateResponse): r is SimulateModeAContextResponse =>
  'kind' in r && r.kind === 'forecast_context';

export const getJson = <T>(path: string, fetchImpl?: typeof fetch) =>
  requestJson<T>('GET', path, undefined, fetchImpl);

export const api = {
  auth: {
    me: (fetchImpl?: typeof fetch) => getJson<SessionResponse>('/api/auth/me', fetchImpl),
    login: (body: unknown, fetchImpl?: typeof fetch) =>
      postJson<AuthUserResponse>('/api/auth/login', body, fetchImpl),
    register: (body: unknown, fetchImpl?: typeof fetch) =>
      postJson<AuthUserResponse>('/api/auth/register', body, fetchImpl),
    refresh: (fetchImpl?: typeof fetch) =>
      postJson<AuthUserResponse>('/api/auth/refresh', undefined, fetchImpl),
    logout: (fetchImpl?: typeof fetch) => postJson<null>('/api/auth/logout', undefined, fetchImpl),
    updateSettings: (body: unknown, fetchImpl?: typeof fetch) =>
      requestJson<AuthUserResponse>('PUT', '/api/auth/settings', body, fetchImpl),
  },
  admin: {
    users: (fetchImpl?: typeof fetch) => getJson<AdminUsersResponse>('/api/admin/users', fetchImpl),
    createUser: (body: unknown, fetchImpl?: typeof fetch) =>
      postJson<AdminUserResponse>('/api/admin/users', body, fetchImpl),
    updateUser: (id: string, body: unknown, fetchImpl?: typeof fetch) =>
      requestJson<AdminUserResponse>('PUT', `/api/admin/users/${id}`, body, fetchImpl),
    analytics: (fetchImpl?: typeof fetch) =>
      getJson<AdminAnalytics>('/api/admin/analytics', fetchImpl),
    activity: (limit = 200, fetchImpl?: typeof fetch) =>
      getJson<ActivityResponse>(`/api/admin/activity?limit=${limit}`, fetchImpl),
  },
  runs: {
    /** The signed-in account's own saved runs. */
    mine: (limit = 50, fetchImpl?: typeof fetch) =>
      getJson<SavedRunsResponse>(`/api/runs?limit=${limit}`, fetchImpl),
    /** One of the account's own saved runs, in full. */
    get: (id: string, fetchImpl?: typeof fetch) =>
      getJson<SavedRunResponse>(`/api/runs/${encodeURIComponent(id)}`, fetchImpl),
  },
  audit: {
    simulations: (fetchImpl?: typeof fetch) =>
      getJson<AuditSimulationsResponse>('/api/audit/simulations', fetchImpl),
    /** Admin: any account's saved run, in full. */
    simulation: (id: string, fetchImpl?: typeof fetch) =>
      getJson<SavedRunResponse>(`/api/audit/simulations/${encodeURIComponent(id)}`, fetchImpl),
  },
  configure: (body: unknown, fetchImpl?: typeof fetch) =>
    postJson<ConfigureResponse>('/api/configure', body, fetchImpl),
  simulate: (body: unknown, fetchImpl?: typeof fetch) =>
    postJson<SimulateResponse>('/api/simulate', body, fetchImpl),
  suitability: (body: unknown, fetchImpl?: typeof fetch) =>
    postJson<SuitabilityResponse>('/api/suitability', body, fetchImpl),
  explain: (body: unknown, fetchImpl?: typeof fetch) =>
    postJson<ExplainResponse>('/api/explain', body, fetchImpl),
  chat: (body: unknown, fetchImpl?: typeof fetch) =>
    postJson<ChatResponse>('/api/chat', body, fetchImpl),
};
