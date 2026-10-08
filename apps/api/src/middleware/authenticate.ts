// Reads the access-token cookie into `req.auth`, and enforces permissions (RBAC) per route.
import type { IncomingMessage } from 'node:http';
import type { RequestHandler } from 'express';
import { AUTH_COOKIES, hasPermission, type Permission, type UserRole } from '@mindspark/shared';
import type { AccessTokenSigner } from '../services/auth/accessToken.js';
import { AppError } from '../utils/errors.js';

export interface AuthContext {
  userId: string;
  role: UserRole;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
    /** The exact request body bytes, kept for payload-hash verification. */
    rawBody?: Buffer;
  }
}

/** Minimal Cookie header parser (name=value pairs; values are URI-decoded). */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    if (name in out) continue; // the first occurrence wins, as browsers send the most specific first
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export const cookiesOf = (req: { headers: { cookie?: string } }) =>
  parseCookies(req.headers.cookie);

/**
 * For the WebSocket upgrade, which bypasses Express: true when authentication is not enforced, or
 * when the access cookie holds a valid token whose role may use the simulator.
 */
export function createUpgradeAuthorizer(
  signer: AccessTokenSigner,
  enforced: boolean,
): (req: IncomingMessage) => boolean {
  return (req) => {
    if (!enforced) return true;
    const token = cookiesOf(req)[AUTH_COOKIES.access];
    const claims = token ? signer.verify(token) : null;
    return claims !== null && hasPermission(claims.role, 'simulate:run');
  };
}

/** Sets `req.auth` when the request carries a valid access token. Never rejects by itself. */
export function authenticate(signer: AccessTokenSigner): RequestHandler {
  return (req, _res, next) => {
    const token = cookiesOf(req)[AUTH_COOKIES.access];
    const claims = token ? signer.verify(token) : null;
    if (claims) req.auth = { userId: claims.sub, role: claims.role };
    next();
  };
}

/**
 * Requires a signed-in user whose role grants `permission`.
 * When the server does not enforce authentication, an anonymous request passes (development and
 * tests without a database); a signed-in user is still held to their role.
 */
export function authorize(permission: Permission, enforced: boolean): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(enforced ? new AppError('UNAUTHENTICATED', 'Sign in to continue') : undefined);
      return;
    }
    if (!hasPermission(req.auth.role, permission)) {
      next(new AppError('FORBIDDEN', 'Your role does not allow this action'));
      return;
    }
    next();
  };
}

/** Always requires a signed-in user (settings, user admin), regardless of enforcement. */
export const requireUser: RequestHandler = (req, _res, next) => {
  next(req.auth ? undefined : new AppError('UNAUTHENTICATED', 'Sign in to continue'));
};

/** Always requires the permission, even when authentication is not globally enforced. */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(new AppError('UNAUTHENTICATED', 'Sign in to continue'));
    } else if (!hasPermission(req.auth.role, permission)) {
      next(new AppError('FORBIDDEN', 'Your role does not allow this action'));
    } else {
      next();
    }
  };
}
