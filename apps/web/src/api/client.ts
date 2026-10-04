// The browser's only route to data: the backend API. Every number shown comes from here.
import type {
  ApiErrorResponse,
  ChatResponse,
  ConfigureResponse,
  ExplainResponse,
  SuitabilityResponse,
  SimulateModeAResponse,
  SimulateModeBResponse,
  SavedProfile,
  SavedProfileList,
  ValidationIssue,
} from '@mindspark/shared';

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

export async function requestJson<T>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(path, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
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

export type SimulateResponse = SimulateModeAResponse | SimulateModeBResponse;

export const api = {
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
  listProfiles: (fetchImpl?: typeof fetch) =>
    requestJson<SavedProfileList>('GET', '/api/client-profiles', undefined, fetchImpl),
  createProfile: (body: unknown, fetchImpl?: typeof fetch) =>
    requestJson<SavedProfile>('POST', '/api/client-profiles', body, fetchImpl),
  updateProfile: (id: string, body: unknown, fetchImpl?: typeof fetch) =>
    requestJson<SavedProfile>('PUT', `/api/client-profiles/${id}`, body, fetchImpl),
};
