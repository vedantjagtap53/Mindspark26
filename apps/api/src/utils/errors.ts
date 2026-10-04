import type { ApiErrorCode, ValidationIssue } from '@mindspark/shared';

export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  NOT_IMPLEMENTED: 501,
  DATABASE_NOT_CONFIGURED: 503,
  DATABASE_ERROR: 500,
  AI_UNAVAILABLE: 503,
  AI_INVALID_RESPONSE: 502,
  MARKET_DATA_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

/** An error that is safe to show to the client: its code, message and details are returned as-is. */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: ValidationIssue[],
  ) {
    super(message);
    this.name = 'AppError';
    this.status = ERROR_STATUS[code];
  }
}
