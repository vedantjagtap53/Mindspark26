// Backend side of the Mode A forecast contract (docs/forecasting.md).
// Calls the external AI forecast service and returns only validated output.
// The forecasting model itself is owned by the AI/ML developer and is not implemented here.

import {
  forecastRequestSchema,
  validateForecastResponse,
  type ForecastRequestInput,
  type ForecastResponse,
  type ValidationIssue,
} from '@mindspark/shared';

export const DEFAULT_FORECAST_TIMEOUT_MS = 15_000;

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
}

export interface ForecastClient {
  forecast(input: ForecastRequestInput): Promise<ForecastResponse>;
}

export function createForecastClient(config: ForecastClientConfig): ForecastClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_FORECAST_TIMEOUT_MS;
  const now = config.now ?? (() => new Date());
  const url = `${config.baseUrl.replace(/\/+$/, '')}/forecast`;

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

      let body: unknown;
      try {
        const res = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(req.data),
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

      const result = validateForecastResponse(body, req.data, now());
      if (!result.ok) {
        throw new ForecastError(
          'AI_INVALID_RESPONSE',
          'Forecast response does not match the contract',
          result.issues,
        );
      }
      return result.value;
    },
  };
}
