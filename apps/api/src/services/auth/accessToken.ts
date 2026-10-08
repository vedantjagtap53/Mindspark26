// Access tokens: compact HS256 JWTs (node:crypto; no extra dependency). Short-lived and stateless:
// they carry the user id and role, so a role change takes effect when the token expires
// (at most AUTH_ACCESS_TTL_SECONDS) or at the next refresh.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { USER_ROLES, type UserRole } from '@mindspark/shared';

export interface AccessClaims {
  /** User id. */
  sub: string;
  role: UserRole;
  iat: number;
  exp: number;
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');
const HEADER = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

const sign = (data: string, secret: string) => createHmac('sha256', secret).update(data).digest();

export interface AccessTokenSigner {
  sign(user: { id: string; role: UserRole }): string;
  /** The claims of a valid, unexpired token; null for anything else. Never throws. */
  verify(token: string): AccessClaims | null;
}

export function createAccessTokenSigner(opts: {
  secret: string;
  ttlSeconds: number;
  now?: () => number;
}): AccessTokenSigner {
  const now = opts.now ?? (() => Date.now());
  return {
    sign({ id, role }) {
      const iat = Math.floor(now() / 1000);
      const claims: AccessClaims = { sub: id, role, iat, exp: iat + opts.ttlSeconds };
      const body = `${HEADER}.${b64url(JSON.stringify(claims))}`;
      return `${body}.${b64url(sign(body, opts.secret))}`;
    },

    verify(token) {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [header, payload, signature] = parts as [string, string, string];
      // Only the exact header we issue is accepted: no `alg: none`, no algorithm switching.
      if (header !== HEADER) return null;
      const expected = sign(`${header}.${payload}`, opts.secret);
      const given = Buffer.from(signature, 'base64url');
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
      try {
        const c = JSON.parse(
          Buffer.from(payload, 'base64url').toString('utf8'),
        ) as Partial<AccessClaims>;
        if (
          typeof c.sub !== 'string' ||
          typeof c.exp !== 'number' ||
          typeof c.iat !== 'number' ||
          !USER_ROLES.includes(c.role as UserRole)
        ) {
          return null;
        }
        if (c.exp <= Math.floor(now() / 1000)) return null;
        return { sub: c.sub, role: c.role as UserRole, iat: c.iat, exp: c.exp };
      } catch {
        return null;
      }
    },
  };
}

/** Refresh tokens are random opaque values; only their SHA-256 is stored. */
export const newRefreshToken = (): string => randomBytes(32).toString('base64url');
export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
