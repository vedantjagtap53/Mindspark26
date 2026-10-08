import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createAccessTokenSigner,
  hashRefreshToken,
  newRefreshToken,
} from '../../../src/services/auth/accessToken.js';

const SECRET = 'a'.repeat(32);
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');

function setup(now = 1_800_000_000_000) {
  const clock = { now };
  const signer = createAccessTokenSigner({ secret: SECRET, ttlSeconds: 900, now: () => clock.now });
  return { signer, clock };
}

describe('access token', () => {
  it('round-trips the user id and role', () => {
    const { signer } = setup();
    const claims = signer.verify(signer.sign({ id: 'u-1', role: 'ADMIN' }));
    expect(claims).toMatchObject({ sub: 'u-1', role: 'ADMIN' });
    expect(claims!.exp - claims!.iat).toBe(900);
  });

  it('expires after the TTL', () => {
    const { signer, clock } = setup();
    const token = signer.sign({ id: 'u-1', role: 'RM' });
    clock.now += 899_000;
    expect(signer.verify(token)).not.toBeNull();
    clock.now += 1_000;
    expect(signer.verify(token)).toBeNull();
  });

  it('rejects a token signed with another secret or with a tampered payload', () => {
    const { signer } = setup();
    const other = createAccessTokenSigner({ secret: 'b'.repeat(32), ttlSeconds: 900 });
    expect(signer.verify(other.sign({ id: 'u-1', role: 'RM' }))).toBeNull();

    const [h, , s] = signer.sign({ id: 'u-1', role: 'RM' }).split('.');
    const forged = b64({ sub: 'u-1', role: 'ADMIN', iat: 1, exp: 9_999_999_999 });
    expect(signer.verify(h + '.' + forged + '.' + s)).toBeNull();
  });

  it('rejects alg none and algorithm switching', () => {
    const { signer } = setup();
    const payload = b64({ sub: 'u-1', role: 'ADMIN', iat: 1, exp: 9_999_999_999 });
    expect(signer.verify(b64({ alg: 'none', typ: 'JWT' }) + '.' + payload + '.')).toBeNull();
    const header = b64({ alg: 'HS512', typ: 'JWT' });
    const sig = createHmac('sha512', SECRET)
      .update(header + '.' + payload)
      .digest('base64url');
    expect(signer.verify(header + '.' + payload + '.' + sig)).toBeNull();
  });

  it('rejects a validly signed token with an unknown role or missing claims', () => {
    const { signer } = setup();
    const header = b64({ alg: 'HS256', typ: 'JWT' });
    const sign = (claims: unknown) => {
      const body = header + '.' + b64(claims);
      return body + '.' + createHmac('sha256', SECRET).update(body).digest('base64url');
    };
    const exp = 1_800_000_900;
    expect(signer.verify(sign({ sub: 'u', role: 'ROOT', iat: 1, exp }))).toBeNull();
    expect(signer.verify(sign({ role: 'RM', iat: 1, exp }))).toBeNull();
    expect(signer.verify(sign({ sub: 'u', role: 'RM', iat: 1 }))).toBeNull();
  });

  it.each(['', 'abc', 'a.b', 'a.b.c.d', '...'])('returns null for garbage %j', (token) => {
    expect(setup().signer.verify(token)).toBeNull();
  });
});

describe('refresh token helpers', () => {
  it('generates unique 256-bit tokens and hashes them deterministically', () => {
    const a = newRefreshToken();
    expect(a).not.toBe(newRefreshToken());
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(hashRefreshToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(a)).toBe(hashRefreshToken(a));
    expect(hashRefreshToken(a)).not.toContain(a);
  });
});
