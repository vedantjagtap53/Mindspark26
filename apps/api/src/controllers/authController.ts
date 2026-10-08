import type { CookieOptions, RequestHandler, Response } from 'express';
import {
  AUTH_COOKIES,
  loginRequestSchema,
  registerRequestSchema,
  updateSettingsRequestSchema,
  type AuthUser,
  type AuthUserResponse,
  type SessionResponse,
} from '@mindspark/shared';
import type { AppConfig } from '../config/index.js';
import { cookiesOf } from '../middleware/authenticate.js';
import type { AuthResult, AuthService } from '../services/auth/authService.js';
import { AppError } from '../utils/errors.js';

export interface AuthController {
  register: RequestHandler<unknown, AuthUserResponse>;
  login: RequestHandler<unknown, AuthUserResponse>;
  refresh: RequestHandler<unknown, AuthUserResponse>;
  logout: RequestHandler;
  me: RequestHandler<unknown, SessionResponse>;
  updateSettings: RequestHandler<unknown, AuthUserResponse>;
}

const ONE_YEAR_MS = 365 * 24 * 3600 * 1000;

export function createAuthController(service: AuthService, config: AppConfig): AuthController {
  const { cookieSecure, accessTtlSeconds, refreshTtlSeconds } = config.auth;
  // Tokens: httpOnly (not readable by script), SameSite=Strict (never sent cross-site).
  const base: CookieOptions = { httpOnly: true, secure: cookieSecure, sameSite: 'strict' };
  const accessOpts: CookieOptions = { ...base, path: '/api', maxAge: accessTtlSeconds * 1000 };
  // The refresh token is only ever sent to the auth endpoints.
  const refreshOpts: CookieOptions = {
    ...base,
    path: '/api/auth',
    maxAge: refreshTtlSeconds * 1000,
  };
  // The theme is a preference, readable by script so the page can apply it before it renders.
  const themeOpts: CookieOptions = {
    httpOnly: false,
    secure: cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_YEAR_MS,
  };

  const setTheme = (res: Response, user: AuthUser) =>
    res.cookie(AUTH_COOKIES.theme, user.settings.theme, themeOpts);

  const startSession = (res: Response, { user, tokens }: AuthResult) => {
    res.cookie(AUTH_COOKIES.access, tokens.accessToken, accessOpts);
    res.cookie(AUTH_COOKIES.refresh, tokens.refreshToken, refreshOpts);
    setTheme(res, user);
    // Responses that set credentials must never be cached.
    res.set('Cache-Control', 'no-store');
  };

  const endSession = (res: Response) => {
    const { maxAge: _access, ...access } = accessOpts;
    const { maxAge: _refresh, ...refresh } = refreshOpts;
    res.clearCookie(AUTH_COOKIES.access, access);
    res.clearCookie(AUTH_COOKIES.refresh, refresh);
  };

  return {
    register: async (req, res) => {
      const result = await service.register(registerRequestSchema.parse(req.body));
      startSession(res, result);
      res.status(201).json({ user: result.user });
    },

    login: async (req, res) => {
      const result = await service.login(loginRequestSchema.parse(req.body), req.ip ?? 'unknown');
      startSession(res, result);
      res.json({ user: result.user });
    },

    refresh: async (req, res) => {
      const token = cookiesOf(req)[AUTH_COOKIES.refresh];
      if (!token) throw new AppError('UNAUTHENTICATED', 'Your session has expired. Sign in again.');
      try {
        const result = await service.refresh(token);
        startSession(res, result);
        res.json({ user: result.user });
      } catch (err) {
        if (err instanceof AppError && err.code === 'UNAUTHENTICATED') endSession(res);
        throw err;
      }
    },

    logout: async (req, res) => {
      await service.logout(cookiesOf(req)[AUTH_COOKIES.refresh]);
      endSession(res);
      res.status(204).end();
    },

    me: async (req, res) => {
      res.set('Cache-Control', 'no-store');
      const user = req.auth ? await service.getUser(req.auth.userId) : null;
      if (user) setTheme(res, user);
      res.json({ authRequired: config.auth.enforced, user });
    },

    updateSettings: async (req, res) => {
      const changes = updateSettingsRequestSchema.parse(req.body);
      const user = await service.updateSettings(req.auth!.userId, changes);
      setTheme(res, user);
      res.json({ user });
    },
  };
}
