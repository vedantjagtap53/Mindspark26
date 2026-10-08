import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AUTH_COOKIES, type AuthUserResponse, type SessionResponse } from '@mindspark/shared';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';
import { silentLogger } from '../../src/utils/logger.js';
import { TEST_PASSWORD } from '../support/authKit.js';
import { createAuthApp } from '../support/authApp.js';
import { bodyOf, errorBody } from '../helpers/http.js';

const reg = { email: 'asha@bank.test', password: TEST_PASSWORD, displayName: 'Asha Rao' };
const setCookies = (res: { headers: Record<string, unknown> }) =>
  (res.headers['set-cookie'] ?? []) as string[];
const cookie = (res: { headers: Record<string, unknown> }, name: string) =>
  setCookies(res).find((c) => c.startsWith(`${name}=`));
const EXPIRED = /Expires=Thu, 01 Jan 1970/;

describe('POST /api/auth/register', () => {
  it('creates an RM and sets the session cookies with safe attributes', async () => {
    const { app } = createAuthApp();
    const res = await request(app).post('/api/auth/register').send(reg);
    expect(res.status).toBe(201);
    expect(bodyOf<AuthUserResponse>(res).user).toMatchObject({
      email: reg.email,
      role: 'RM',
      displayName: 'Asha Rao',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password|scrypt/i);
    expect(res.headers['cache-control']).toBe('no-store');

    const access = cookie(res, AUTH_COOKIES.access)!;
    expect(access).toMatch(/HttpOnly/i);
    expect(access).toMatch(/SameSite=Strict/i);
    expect(access).toMatch(/Path=\/api(;|$)/);
    expect(access).toMatch(/Max-Age=900/);

    const refresh = cookie(res, AUTH_COOKIES.refresh)!;
    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/SameSite=Strict/i);
    expect(refresh).toMatch(/Path=\/api\/auth/);
    expect(refresh).toMatch(/Max-Age=604800/);

    const theme = cookie(res, AUTH_COOKIES.theme)!;
    expect(theme).toContain('ms_theme=light');
    expect(theme).not.toMatch(/HttpOnly/i);
  });

  it('marks cookies Secure when configured', async () => {
    const { app } = createAuthApp({ AUTH_COOKIE_SECURE: 'true' });
    const res = await request(app).post('/api/auth/register').send(reg);
    expect(cookie(res, AUTH_COOKIES.access)).toMatch(/Secure/i);
    expect(cookie(res, AUTH_COOKIES.refresh)).toMatch(/Secure/i);
  });

  it('rejects a weak password, a bad email and an attempt to choose a role', async () => {
    const { app } = createAuthApp();
    const weak = await request(app)
      .post('/api/auth/register')
      .send({ ...reg, password: 'short' });
    expect(weak.status).toBe(400);
    expect(errorBody(weak).code).toBe('VALIDATION_ERROR');
    expect(errorBody(weak).details?.map((d) => d.path)).toContain('password');

    const email = await request(app)
      .post('/api/auth/register')
      .send({ ...reg, email: 'nope' });
    expect(email.status).toBe(400);

    const role = await request(app)
      .post('/api/auth/register')
      .send({ ...reg, role: 'ADMIN' });
    expect(role.status).toBe(400);
  });

  it('rejects a duplicate email with 409', async () => {
    const { app } = createAuthApp();
    await request(app).post('/api/auth/register').send(reg);
    const dup = await request(app)
      .post('/api/auth/register')
      .send({ ...reg, email: 'ASHA@Bank.test' });
    expect(dup.status).toBe(409);
    expect(errorBody(dup).code).toBe('CONFLICT');
  });

  it('answers 503 when the database is not configured', async () => {
    const noDb = createApp(loadConfig({}), silentLogger);
    const res = await request(noDb).post('/api/auth/register').send(reg);
    expect(res.status).toBe(503);
    expect(errorBody(res).code).toBe('DATABASE_NOT_CONFIGURED');
  });
});

describe('login, session and logout', () => {
  it('logs in, reports the session on /me and logs out', async () => {
    const { app } = createAuthApp();
    await request(app).post('/api/auth/register').send(reg);
    const agent = request.agent(app);
    const login = await agent
      .post('/api/auth/login')
      .send({ email: 'ASHA@bank.test', password: TEST_PASSWORD });
    expect(login.status).toBe(200);

    const me = await agent.get('/api/auth/me');
    expect(me.body).toMatchObject({ authRequired: true, user: { email: reg.email, role: 'RM' } });

    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(204);
    expect(cookie(out, AUTH_COOKIES.access)).toMatch(EXPIRED);
    expect(cookie(out, AUTH_COOKIES.refresh)).toMatch(EXPIRED);

    const after = await agent.get('/api/auth/me');
    expect(after.body).toEqual({ authRequired: true, user: null });
  });

  it('returns a generic 401 for a wrong password or unknown user', async () => {
    const { app } = createAuthApp();
    await request(app).post('/api/auth/register').send(reg);
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: reg.email, password: 'Wrong-Passw0rd' });
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'who@bank.test', password: TEST_PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(setCookies(wrong)).toEqual([]);
  });

  it('answers 429 after repeated failures', async () => {
    const { app } = createAuthApp();
    await request(app).post('/api/auth/register').send(reg);
    const attempt = () =>
      request(app).post('/api/auth/login').send({ email: reg.email, password: 'Wrong-Passw0rd' });
    for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401);
    const locked = await attempt();
    expect(locked.status).toBe(429);
    expect(errorBody(locked).code).toBe('TOO_MANY_REQUESTS');
  });

  it('reports no session without cookies, and ignores a forged access cookie', async () => {
    const { app } = createAuthApp();
    const anon = await request(app).get('/api/auth/me');
    expect(anon.body).toEqual({ authRequired: true, user: null });
    const forged = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${AUTH_COOKIES.access}=aaa.bbb.ccc`);
    expect(bodyOf<SessionResponse>(forged).user).toBeNull();
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates the refresh cookie and keeps the user signed in', async () => {
    const { app } = createAuthApp();
    const agent = request.agent(app);
    const first = await agent.post('/api/auth/register').send(reg);
    const res = await agent.post('/api/auth/refresh');
    expect(res.status).toBe(200);
    expect(bodyOf<AuthUserResponse>(res).user.email).toBe(reg.email);
    expect(cookie(res, AUTH_COOKIES.refresh)).toBeDefined();
    expect(cookie(res, AUTH_COOKIES.refresh)).not.toBe(cookie(first, AUTH_COOKIES.refresh));
    expect(bodyOf<SessionResponse>(await agent.get('/api/auth/me')).user).not.toBeNull();
  });

  it('answers 401 and clears cookies without a refresh cookie, or with a bad one', async () => {
    const { app } = createAuthApp();
    expect((await request(app).post('/api/auth/refresh')).status).toBe(401);
    const bad = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `${AUTH_COOKIES.refresh}=not-a-token`);
    expect(bad.status).toBe(401);
    expect(cookie(bad, AUTH_COOKIES.refresh)).toMatch(EXPIRED);
  });

  it('does not accept a refresh token after logout', async () => {
    const { app } = createAuthApp();
    const agent = request.agent(app);
    const registered = await agent.post('/api/auth/register').send(reg);
    const stolen = cookie(registered, AUTH_COOKIES.refresh)!.split(';')[0]!;
    await agent.post('/api/auth/logout');
    const res = await request(app).post('/api/auth/refresh').set('Cookie', stolen);
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/auth/settings', () => {
  it('needs a signed-in user', async () => {
    const { app } = createAuthApp();
    const res = await request(app).put('/api/auth/settings').send({ theme: 'dark' });
    expect(res.status).toBe(401);
  });

  it('saves the theme on the server and mirrors it in the theme cookie', async () => {
    const { app } = createAuthApp();
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(reg);
    const res = await agent.put('/api/auth/settings').send({ theme: 'dark', customCursor: false });
    expect(res.status).toBe(200);
    expect(bodyOf<AuthUserResponse>(res).user.settings).toEqual({
      theme: 'dark',
      customCursor: false,
    });
    expect(cookie(res, AUTH_COOKIES.theme)).toContain('ms_theme=dark');

    const other = request.agent(app);
    await other.post('/api/auth/login').send({ email: reg.email, password: TEST_PASSWORD });
    expect(bodyOf<SessionResponse>(await other.get('/api/auth/me')).user?.settings.theme).toBe(
      'dark',
    );
  });

  it('rejects unknown themes, unknown keys and empty updates', async () => {
    const { app } = createAuthApp();
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(reg);
    for (const body of [{ theme: 'neon' }, { role: 'ADMIN' }, {}]) {
      expect((await agent.put('/api/auth/settings').send(body)).status).toBe(400);
    }
  });
});
