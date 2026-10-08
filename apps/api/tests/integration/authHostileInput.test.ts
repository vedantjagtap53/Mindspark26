// A name, an email or a password is only data. None of them may grant a role, reach the database as
// SQL, or let a public visitor look like an official account.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  createUserRequestSchema,
  registerRequestSchema,
  type AuthUserResponse,
} from '@mindspark/shared';
import { TEST_PASSWORD } from '../support/authKit.js';
import { createAuthApp } from '../support/authApp.js';
import { bodyOf } from '../helpers/http.js';

const base = { email: 'visitor@bank.test', password: TEST_PASSWORD };
const nameOf = (displayName: string) => registerRequestSchema.safeParse({ ...base, displayName });

describe('display name rules (public sign-up)', () => {
  it.each([
    'Asha Rao',
    "Aoife O'Brien",
    'Anne-Marie Smith',
    'Dr. K. R. Narayanan',
    'José Álvarez',
    'पद्मिनी शर्मा',
    'Padmini Sharma',
  ])('accepts a real name: %s', (name) => {
    expect(nameOf(name).success).toBe(true);
  });

  it.each([
    "Robert'); DROP TABLE app_users;--",
    "x' OR '1'='1",
    '<script>alert(1)</script>',
    'a`b',
    'name"; --',
    'Asha  --  Rao',
    '1234',
    'Asha Rao 2',
    '',
    ' ',
    'A',
    'x'.repeat(61),
  ])('rejects SQL-looking, markup, numeric or out-of-range names: %j', (name) => {
    expect(nameOf(name).success).toBe(false);
  });

  it.each([
    'root',
    'root admin',
    'Root Admin',
    'ADMIN',
    'Administrator',
    'rootadmin',
    'System Admin',
    'Compliance Officer',
    'Support',
    'FinStrukt',
    'null',
    // Look-alike letters (Cyrillic a, o) that would read as "admin" / "root".
    'аdmin',
    'rооt',
  ])('rejects a name that poses as an official account: %s', (name) => {
    expect(nameOf(name).success).toBe(false);
  });

  it('normalises spacing and width variants before checking', () => {
    const ok = nameOf('  Asha    Rao  ');
    expect(ok.success && ok.data.displayName).toBe('Asha Rao');
    expect(nameOf('ＲＯＯＴ').success).toBe(false); // full-width letters fold to "ROOT"
  });

  it('lets an administrator create an official-sounding label, with the same character rules', () => {
    const create = (displayName: string) =>
      createUserRequestSchema.safeParse({ ...base, displayName, role: 'ADMIN' });
    expect(create('Support Desk').success).toBe(true);
    expect(create("x'); DROP TABLE app_users;--").success).toBe(false);
  });
});

describe('POST /api/auth/register with hostile input', () => {
  it('never creates an account for an impersonating or SQL-looking name', async () => {
    const { app } = createAuthApp();
    for (const displayName of ['root admin', "Robert'); DROP TABLE app_users;--"]) {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...base, displayName });
      expect(res.status).toBe(400);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
    // Still free to register with that email afterwards: nothing was stored.
    const ok = await request(app)
      .post('/api/auth/register')
      .send({ ...base, displayName: 'Asha Rao' });
    expect(ok.status).toBe(201);
  });

  it('gives every public sign-up the RM role, whatever else the body says', async () => {
    const { app } = createAuthApp();
    const forged = await request(app)
      .post('/api/auth/register')
      .send({ ...base, displayName: 'Asha Rao', role: 'ADMIN' });
    expect(forged.status).toBe(400);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...base, displayName: 'Asha Rao' });
    expect(bodyOf<AuthUserResponse>(res).user.role).toBe('RM');

    // And an RM cannot reach the administrator endpoints.
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const users = await request(app).get('/api/admin/users').set('Cookie', cookies);
    expect(users.status).toBe(403);
  });

  it('treats SQL in the email or password as plain, harmless data', async () => {
    const { app } = createAuthApp();
    const bad = await request(app).post('/api/auth/register').send({
      email: "a'; DROP TABLE app_users;--@bank.test",
      password: TEST_PASSWORD,
      displayName: 'Asha Rao',
    });
    expect(bad.status).toBe(400);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'visitor@bank.test', password: "' OR '1'='1" });
    expect(login.status).toBe(401);
  });
});
