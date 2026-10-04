import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorCode, ApiErrorResponse, ValidationIssue } from '@mindspark/shared';
import { AppError, ERROR_STATUS } from '../utils/errors.js';
import type { Logger } from '../utils/logger.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError('NOT_FOUND', `Route not found: ${req.method} ${req.path}`));
};

interface NormalizedError {
  status: number;
  body: ApiErrorResponse;
}

function build(code: ApiErrorCode, message: string, details?: ValidationIssue[]): NormalizedError {
  return {
    status: ERROR_STATUS[code],
    body: { error: { code, message, ...(details ? { details } : {}) } },
  };
}

function normalize(err: unknown): NormalizedError {
  if (err instanceof AppError) return build(err.code, err.message, err.details);
  if (err instanceof ZodError) {
    return build(
      'VALIDATION_ERROR',
      'Request validation failed',
      err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  // Body-parser errors carry a `type`; they are client mistakes, not server faults.
  const type = (err as { type?: unknown } | null)?.type;
  if (type === 'entity.parse.failed')
    return build('VALIDATION_ERROR', 'Request body is not valid JSON');
  if (type === 'entity.too.large') return build('PAYLOAD_TOO_LARGE', 'Request body is too large');
  if (type === 'charset.unsupported' || type === 'encoding.unsupported') {
    return build('VALIDATION_ERROR', 'Unsupported request encoding');
  }
  return build('INTERNAL_ERROR', 'Internal server error');
}

/** Centralized error handler. Unknown errors are logged and returned as a generic 500. */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const { status, body } = normalize(err);
    if (status >= 500) {
      logger.error('Request failed', {
        method: req.method,
        path: req.path,
        error: err instanceof Error ? (err.stack ?? err.message) : String(err),
      });
    }
    res.status(status).json(body);
  };
}
