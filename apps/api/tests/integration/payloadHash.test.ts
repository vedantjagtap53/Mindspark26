import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { PAYLOAD_HASH_HEADER } from '@mindspark/shared';
import { TEST_PASSWORD } from '../support/authKit.js';
import { createAuthApp, sha256 } from '../support/authApp.js';
import { errorBody } from '../helpers/http.js';

const body = JSON.stringify({
  email: 'asha@bank.test',
  password: TEST_PASSWORD,
  displayName: 'Asha Rao',
});

const post = (app: Parameters<typeof request>[0], payload: string, hash?: string) => {
  const req = request(app).post('/api/auth/register').set('content-type', 'application/json');
  if (hash !== undefined) req.set(PAYLOAD_HASH_HEADER, hash);
  return req.send(payload);
};

describe('X-Payload-Hash verification', () => {
  it('accepts a body whose SHA-256 matches the header', async () => {
    const { app } = createAuthApp();
    const res = await post(app, body, sha256(body));
    expect(res.status).toBe(201);
  });

  it('accepts an upper-case hex hash and surrounding whitespace', async () => {
    const { app } = createAuthApp();
    const res = await post(app, body, ` ${sha256(body).toUpperCase()} `);
    expect(res.status).toBe(201);
  });

  it('rejects a body that was changed after hashing', async () => {
    const { app } = createAuthApp();
    const tampered = body.replace('Asha Rao', 'Evil Eve');
    const res = await post(app, tampered, sha256(body));
    expect(res.status).toBe(400);
    expect(errorBody(res).code).toBe('PAYLOAD_HASH_MISMATCH');
  });

  it('hashes the exact bytes: equivalent JSON with different whitespace does not match', async () => {
    const { app } = createAuthApp();
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    expect((await post(app, pretty, sha256(body))).status).toBe(400);
    expect((await post(app, pretty, sha256(pretty))).status).toBe(201);
  });

  it.each(['abc', 'z'.repeat(64), 'a'.repeat(63), 'sha256=' + 'a'.repeat(64)])(
    'rejects the malformed hash %j',
    async (bad) => {
      const { app } = createAuthApp();
      const res = await post(app, body, bad);
      expect(res.status).toBe(400);
      expect(errorBody(res).code).toBe('PAYLOAD_HASH_MISMATCH');
    },
  );

  it('does not check requests without a body, such as logout or GET', async () => {
    const { app } = createAuthApp({ PAYLOAD_HASH_REQUIRED: 'true' });
    expect((await request(app).post('/api/auth/logout')).status).toBe(204);
    expect((await request(app).get('/api/auth/me')).status).toBe(200);
  });
});

describe('PAYLOAD_HASH_REQUIRED', () => {
  it('rejects a body without the header when required', async () => {
    const { app } = createAuthApp({ PAYLOAD_HASH_REQUIRED: 'true' });
    const res = await post(app, body);
    expect(res.status).toBe(400);
    expect(errorBody(res).message).toMatch(/required/);
  });

  it('lets a body without the header through when not required', async () => {
    const { app } = createAuthApp({ PAYLOAD_HASH_REQUIRED: 'false' });
    expect((await post(app, body)).status).toBe(201);
  });

  it('still verifies a header that is present when not required', async () => {
    const { app } = createAuthApp({ PAYLOAD_HASH_REQUIRED: 'false' });
    expect((await post(app, body, sha256('other'))).status).toBe(400);
  });
});
