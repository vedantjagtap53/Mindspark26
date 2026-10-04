import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildConfig } from '../../src/config/index.js';
import { parseEnv } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';
import { silentLogger } from '../../src/utils/logger.js';
import { errorBody, healthBody } from '../helpers/http.js';

const app = (env: NodeJS.ProcessEnv = {}) => createApp(buildConfig(parseEnv(env)), silentLogger);

describe('GET /api/health', () => {
  it('reports that the server is running with environment and database status', async () => {
    const res = await request(app({ NODE_ENV: 'test' })).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toMatchObject({
      status: 'ok',
      environment: 'test',
      database: { provider: 'firebase-sql-connect', configured: false },
    });
    expect(new Date(healthBody(res).timestamp).toString()).not.toBe('Invalid Date');
    expect(healthBody(res).uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('reflects database configuration', async () => {
    const res = await request(
      app({
        NODE_ENV: 'production',
        FIREBASE_PROJECT_ID: 'proj',
        FIREBASE_SQL_CONNECT_SERVICE_ID: 'svc',
        FIREBASE_SQL_CONNECT_LOCATION: 'asia-south1',
      }),
    ).get('/api/health');
    expect(healthBody(res).environment).toBe('production');
    expect(healthBody(res).database).toEqual({
      provider: 'firebase-sql-connect',
      configured: true,
    });
  });

  it('reports Firebase as not configured when the SQL Connect service is missing', async () => {
    const res = await request(app({ FIREBASE_PROJECT_ID: 'proj' })).get('/api/health');
    expect(healthBody(res).database.configured).toBe(false);
  });

  it('does not expose secrets or credential values', async () => {
    const res = await request(
      app({
        FIREBASE_PROJECT_ID: 'proj-id-visible-only-as-flag',
        FIREBASE_CLIENT_EMAIL: 'svc@proj.iam.gserviceaccount.com',
        FIREBASE_PRIVATE_KEY: 'PRIVATE-KEY-VALUE',
        FIREBASE_SQL_CONNECT_SERVICE_ID: 'secret-service',
        DATA_CONNECT_EMULATOR_HOST: 'secret-host:9399',
        AI_API_KEY: 'AI-KEY-VALUE',
        MARKET_DATA_API_KEY: 'MD-KEY-VALUE',
      }),
    ).get('/api/health');
    const text = JSON.stringify(res.body);
    for (const secret of [
      'proj-id-visible-only-as-flag',
      'svc@proj',
      'PRIVATE-KEY-VALUE',
      'secret-host',
      'secret-service',
      'AI-KEY-VALUE',
      'MD-KEY-VALUE',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('does not set X-Powered-By', async () => {
    const res = await request(app()).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('routing and error envelope', () => {
  it('returns a NOT_FOUND error for unknown routes', async () => {
    const res = await request(app()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(errorBody(res).code).toBe('NOT_FOUND');
  });

  it('returns VALIDATION_ERROR for malformed JSON bodies', async () => {
    const res = await request(app())
      .post('/api/health')
      .set('content-type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(errorBody(res).code).toBe('VALIDATION_ERROR');
  });

  it('returns PAYLOAD_TOO_LARGE for oversized bodies', async () => {
    const res = await request(app())
      .post('/api/health')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(2 * 1024 * 1024) }));
    expect(res.status).toBe(413);
    expect(errorBody(res).code).toBe('PAYLOAD_TOO_LARGE');
  });
});
