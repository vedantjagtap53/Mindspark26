import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  AUTH_COOKIES,
  type AdminUserResponse,
  type AuditSimulationsResponse,
  type AuthUserResponse,
  type SessionResponse,
  type UserRole,
} from '@mindspark/shared';
import { createAccessTokenSigner } from '../../src/services/auth/accessToken.js';
import { TEST_PASSWORD, TEST_SECRET } from '../support/authKit.js';
import { createAuthApp } from '../support/authApp.js';
import { bodyOf, errorBody } from '../helpers/http.js';

// Every RM-desk route. An empty body is enough: reaching validation (400) proves the request
// passed authentication and authorization.
const DESK_ROUTES = ['configure', 'simulate', 'suitability', 'explain', 'chat'] as const;

const accessCookie = (token: string) => `${AUTH_COOKIES.access}=${token}`;

describe('enforced authentication', () => {
  it('keeps /api/health public and rejects anonymous callers everywhere else', async () => {
    const { app } = createAuthApp();
    expect((await request(app).get('/api/health')).status).toBe(200);
    for (const route of DESK_ROUTES) {
      const res = await request(app).post(`/api/${route}`).send({});
      expect(res.status, route).toBe(401);
      expect(errorBody(res).code).toBe('UNAUTHENTICATED');
    }
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
    expect((await request(app).get('/api/audit/simulations')).status).toBe(401);
  });

  it('rejects a forged token (wrong secret) and an expired token', async () => {
    const { app, kit } = createAuthApp();
    const admin = await kit.seedUser('ADMIN');
    const forged = createAccessTokenSigner({ secret: 'x'.repeat(40), ttlSeconds: 900 });
    const forgedRes = await request(app)
      .get('/api/admin/users')
      .set('Cookie', accessCookie(forged.sign({ id: admin.id, role: 'ADMIN' })));
    expect(forgedRes.status).toBe(401);

    const expired = createAccessTokenSigner({
      secret: TEST_SECRET,
      ttlSeconds: 900,
      now: () => Date.now() - 3_600_000,
    });
    const expiredRes = await request(app)
      .get('/api/admin/users')
      .set('Cookie', accessCookie(expired.sign({ id: admin.id, role: 'ADMIN' })));
    expect(expiredRes.status).toBe(401);
  });
});

describe('role permissions', () => {
  const desk: Array<[UserRole, boolean]> = [
    ['RM', true],
    ['ADMIN', true],
  ];

  it.each(desk)('%s may use the simulator routes: %s', async (role, allowed) => {
    const { signedIn } = createAuthApp();
    const agent = await signedIn(role);
    for (const route of DESK_ROUTES) {
      const res = await agent.post(`/api/${route}`).send({});
      if (allowed) {
        expect(res.status, `${role} ${route}`).toBe(400);
      } else {
        expect(res.status, `${role} ${route}`).toBe(403);
        expect(errorBody(res).code).toBe('FORBIDDEN');
      }
    }
  });

  it.each([
    ['RM', 403, 403],
    ['ADMIN', 200, 200],
  ] as const)('%s: admin users %i, audit %i', async (role, adminStatus, auditStatus) => {
    const { signedIn } = createAuthApp();
    const agent = await signedIn(role);
    expect((await agent.get('/api/admin/users')).status).toBe(adminStatus);
    expect((await agent.get('/api/audit/simulations')).status).toBe(auditStatus);
  });

  it('signs a user out when an admin changes their role, then applies the new role', async () => {
    const { app, kit } = createAuthApp();
    await kit.seedUser('RM', 'rm@bank.test');
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'rm@bank.test', password: TEST_PASSWORD });
    expect((await agent.get('/api/admin/users')).status).toBe(403);

    const admin = await kit.seedUser('ADMIN');
    const rm = (await kit.admin.list()).find((u) => u.email === 'rm@bank.test')!;
    await kit.admin.update(admin.id, rm.id, { role: 'ADMIN' });
    // The refresh token was revoked, so the user must sign in again to get the new role.
    expect((await agent.post('/api/auth/refresh')).status).toBe(401);
    await agent.post('/api/auth/login').send({ email: 'rm@bank.test', password: TEST_PASSWORD });
    expect((await agent.get('/api/admin/users')).status).toBe(200);
  });
});

describe('authentication not enforced (development, no database)', () => {
  it('lets anonymous callers use the simulator, but never the admin or audit routes', async () => {
    const { app } = createAuthApp({ AUTH_ENFORCED: 'false' });
    for (const route of DESK_ROUTES) {
      expect((await request(app).post(`/api/${route}`).send({})).status, route).toBe(400);
    }
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
    expect((await request(app).get('/api/audit/simulations')).status).toBe(401);
    expect((await request(app).get('/api/auth/me')).body).toEqual({
      authRequired: false,
      user: null,
    });
  });

  it('still holds a signed-in user to their role', async () => {
    const { signedIn } = createAuthApp({ AUTH_ENFORCED: 'false' });
    const rm = await signedIn('RM');
    expect((await rm.post('/api/simulate').send({})).status).toBe(400);
    expect((await rm.get('/api/admin/users')).status).toBe(403);
    expect((await rm.get('/api/audit/simulations')).status).toBe(403);
  });
});

describe('admin user management', () => {
  const newUser = {
    email: 'second.admin@bank.test',
    password: TEST_PASSWORD,
    displayName: 'Chandra Rao',
    role: 'ADMIN',
  };

  it('lets an admin create a user with a role, who can then sign in with it', async () => {
    const { app, signedIn } = createAuthApp();
    const admin = await signedIn('ADMIN');
    const created = await admin.post('/api/admin/users').send(newUser);
    expect(created.status).toBe(201);
    expect(bodyOf<AdminUserResponse>(created).user).toMatchObject({
      email: newUser.email,
      role: 'ADMIN',
    });
    expect(JSON.stringify(created.body)).not.toMatch(/password|scrypt/i);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: newUser.email, password: TEST_PASSWORD });
    expect(bodyOf<AuthUserResponse>(login).user.role).toBe('ADMIN');
  });

  it('refuses user creation to non-admins and validates the input', async () => {
    const { signedIn } = createAuthApp();
    const rm = await signedIn('RM');
    expect((await rm.post('/api/admin/users').send(newUser)).status).toBe(403);
    const admin = await signedIn('ADMIN');
    const badRole = await admin.post('/api/admin/users').send({ ...newUser, role: 'ROOT' });
    expect(badRole.status).toBe(400);
    const weak = await admin.post('/api/admin/users').send({ ...newUser, password: 'weak' });
    expect(weak.status).toBe(400);
  });

  it('changes a role, deactivates a user and stops an admin locking themselves out', async () => {
    const { signedIn, kit } = createAuthApp();
    const admin = await signedIn('ADMIN');
    const rm = await kit.seedUser('RM', 'target@bank.test');

    const promoted = await admin.put(`/api/admin/users/${rm.id}`).send({ role: 'ADMIN' });
    expect(bodyOf<AdminUserResponse>(promoted).user.role).toBe('ADMIN');
    const off = await admin.put(`/api/admin/users/${rm.id}`).send({ active: false });
    expect(bodyOf<AdminUserResponse>(off).user.active).toBe(false);

    const me = bodyOf<SessionResponse>(await admin.get('/api/auth/me')).user!;
    const self = await admin.put(`/api/admin/users/${me.id}`).send({ role: 'RM' });
    expect(self.status).toBe(403);

    const badId = await admin.put('/api/admin/users/not-a-uuid').send({ active: false });
    expect(badId.status).toBe(404);
    expect((await admin.put(`/api/admin/users/${rm.id}`).send({})).status).toBe(400);
  });
});

describe('GET /api/audit/simulations', () => {
  it('lists persisted simulations for the admin, newest first, with the client snapshot', async () => {
    const { signedIn, repositories } = createAuthApp();
    const configurationId = await repositories.productConfigurations.create({
      productType: 'ELN',
      underlyingSymbol: '^NSEI',
      depositCurrency: null,
      alternateCurrency: null,
      tenorDays: 365,
      notional: 1_000_000,
      terms: {},
    });
    const record = (name: string) =>
      repositories.simulations.record({
        mode: 'B',
        configurationId,
        userId: null,
        profileSnapshot: {
          name,
          age: 52,
          riskAppetite: 'medium',
          horizonMonths: 24,
          lossTolerancePct: 10,
          concentrationPct: 15,
        },
        levelValue: 25_000,
        levelSource: 'manual',
        levelAsOf: null,
        shockPct: -25,
        shockedLevel: 18_750,
        riskResults: [
          {
            scenario: 'shock',
            percentile: null,
            terminal: 18_750,
            pathMin: null,
            payoff: 850_000,
            returnPct: -15,
            lossAmount: 150_000,
            knockedIn: true,
            details: {},
          },
        ],
      });
    await record('First Client');
    const secondId = await record('Second Client');
    await repositories.suitabilityResults.create({
      simulationId: secondId,
      verdict: 'Caution',
      flags: [{ rule: 'risk_vs_appetite', hard: false, reason: 'High risk product' }],
      rulesVersion: 'test',
    });

    const agent = await signedIn('ADMIN');
    const res = await agent.get('/api/audit/simulations');
    expect(res.status).toBe(200);
    const { simulations } = bodyOf<AuditSimulationsResponse>(res);
    expect(simulations.map((s) => s.client?.name)).toEqual(['Second Client', 'First Client']);
    expect(simulations[0]).toMatchObject({
      id: secondId,
      mode: 'B',
      productType: 'ELN',
      notional: 1_000_000,
      verdict: 'Caution',
      flags: [{ rule: 'risk_vs_appetite', hard: false, reason: 'High risk product' }],
      results: [{ scenario: 'shock', payoff: 850_000, knockedIn: true }],
    });

    const limited = await agent.get('/api/audit/simulations?limit=1');
    expect(bodyOf<AuditSimulationsResponse>(limited).simulations).toHaveLength(1);
    expect((await agent.get('/api/audit/simulations?limit=0')).status).toBe(400);
  });
});
