import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createErrorHandler, notFoundHandler } from '../../../src/middleware/errorHandler.js';
import { AppError } from '../../../src/utils/errors.js';
import { errorBody } from '../../helpers/http.js';

function setup(thrower: express.RequestHandler) {
  const error = vi.fn();
  const logger = { error, info: vi.fn() };
  const app = express();
  app.get('/boom', thrower);
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return { app, error };
}

describe('error handler', () => {
  it('maps AppError to its code, status and details', async () => {
    const { app, error } = setup(() => {
      throw new AppError('AI_INVALID_RESPONSE', 'bad contract', [
        { path: 'cases.low', message: 'missing' },
      ]);
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: {
        code: 'AI_INVALID_RESPONSE',
        message: 'bad contract',
        details: [{ path: 'cases.low', message: 'missing' }],
      },
    });
    expect(error).toHaveBeenCalledOnce();
  });

  it('does not log client errors', async () => {
    const { app, error } = setup(() => {
      throw new AppError('VALIDATION_ERROR', 'nope');
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(400);
    expect(errorBody(res)).toEqual({ code: 'VALIDATION_ERROR', message: 'nope' });
    expect(error).not.toHaveBeenCalled();
  });

  it('maps ZodError to VALIDATION_ERROR with issue paths', async () => {
    const { app } = setup(() => {
      z.object({ tenorDays: z.number() }).parse({ tenorDays: 'x' });
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(400);
    expect(errorBody(res).code).toBe('VALIDATION_ERROR');
    expect(errorBody(res).details?.[0]?.path).toBe('tenorDays');
  });

  it('hides the internals of unexpected errors and logs them', async () => {
    const { app, error } = setup(() => {
      throw new Error('db password is hunter2');
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(error).toHaveBeenCalledOnce();
  });

  it('handles rejected promises from async handlers (Express 5)', async () => {
    const { app } = setup(async () => {
      await Promise.resolve();
      throw new AppError('DATABASE_ERROR', 'db down');
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(errorBody(res).code).toBe('DATABASE_ERROR');
  });

  it('handles non-Error throws', async () => {
    const { app } = setup(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'a string';
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(errorBody(res).code).toBe('INTERNAL_ERROR');
  });

  it('returns NOT_FOUND through the same envelope', async () => {
    const { app } = setup(() => undefined);
    const res = await request(app).get('/missing');
    expect(res.status).toBe(404);
    expect(errorBody(res).code).toBe('NOT_FOUND');
  });
});
