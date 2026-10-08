import type { ApiErrorResponse, HealthResponse } from '@mindspark/shared';

export const errorBody = (res: { body: unknown }): ApiErrorResponse['error'] =>
  (res.body as ApiErrorResponse).error;

export const healthBody = (res: { body: unknown }): HealthResponse => res.body as HealthResponse;

/** A typed view of a response body (supertest types it as any). */
export const bodyOf = <T>(res: { body: unknown }): T => res.body as T;
