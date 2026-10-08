// Backend side of the Mode A forecast contract (docs/forecasting.md).
// Calls the external AI forecast service and returns only validated output.
// The forecasting model itself is owned by the AI/ML developer and is not implemented here.

import {
  forecastRequestSchema,
  validateForecastResponse,
  type ForecastRequest,
  type ForecastRequestInput,
  type ForecastResponse,
  type ValidationIssue,
} from '@mindspark/shared';
import { createTtlCache, deepFreeze } from '../../utils/ttlCache.js';

export const DEFAULT_FORECAST_TIMEOUT_MS = 15_000;
export const DEFAULT_FORECAST_CACHE_MS = 15 * 60 * 1000;
export const DEFAULT_FORECAST_CACHE_ENTRIES = 16;

export type ForecastErrorCode = 'VALIDATION_ERROR' | 'AI_UNAVAILABLE' | 'AI_INVALID_RESPONSE';

export class ForecastError extends Error {
  constructor(
    readonly code: ForecastErrorCode,
    message: string,
    readonly details: ValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'ForecastError';
  }
}

export interface ForecastClientConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /**
   * How long a validated forecast is reused for an identical request. The service uses a fixed
   * random seed, so a repeat on the same data returns the same forecast; the cache only saves the
   * wait. 0 turns it off. Default 15 minutes.
   */
  cacheMs?: number;
  /** Forecasts kept at once (each holds its sample paths). Default 16. */
  cacheMaxEntries?: number;
}

export interface ForecastClient {
  forecast(input: ForecastRequestInput): Promise<ForecastResponse>;
}

export function createForecastClient(config: ForecastClientConfig): ForecastClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_FORECAST_TIMEOUT_MS;
  const now = config.now ?? (() => new Date());
  const url = `${config.baseUrl.replace(/\/+$/, '')}/forecast`;
  const cache = createTtlCache<ForecastResponse>({
    ttlMs: config.cacheMs ?? DEFAULT_FORECAST_CACHE_MS,
    maxEntries: config.cacheMaxEntries ?? DEFAULT_FORECAST_CACHE_ENTRIES,
    now: () => now().getTime(),
  });

  /** One call to the service; the answer is returned only if it passes the contract checks. */
  async function fetchForecast(request: ForecastRequest): Promise<ForecastResponse> {
    let body: unknown;
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        throw new ForecastError('AI_UNAVAILABLE', `Forecast service returned HTTP ${res.status}`);
      }
      body = await res.json();
    } catch (err) {
      if (err instanceof ForecastError) throw err;
      if (err instanceof SyntaxError) {
        throw new ForecastError('AI_INVALID_RESPONSE', 'Forecast service returned invalid JSON');
      }
      throw new ForecastError('AI_UNAVAILABLE', 'Forecast service is unreachable or timed out');
    }

    const result = validateForecastResponse(body, request, now());
    if (!result.ok) {
      throw new ForecastError(
        'AI_INVALID_RESPONSE',
        'Forecast response does not match the contract',
        result.issues,
      );
    }
    return result.value;
  }

  return {
    async forecast(input) {
      const req = forecastRequestSchema.safeParse(input);
      if (!req.success) {
        throw new ForecastError(
          'VALIDATION_ERROR',
          'Invalid forecast request',
          req.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        );
      }
      // The parsed request has its defaults filled in, so equivalent requests share one key.
      // A cached forecast is shared between requests, so it is frozen against changes in place.
      return cache.get(JSON.stringify(req.data), async () =>
        deepFreeze(await fetchForecast(req.data)),
      );
    },
  };
}
