// Authentication, roles and user settings (approved scope addition, 2026-10-07; see
// docs/decisions/2026-10-07-auth-rbac.md). Roles and the permissions they grant live here so the
// backend (authoritative) and the frontend (which only hides what the user cannot use) agree.
// Two roles since 2026-10-08 (the Compliance role was removed at Karan's request): a user (`RM`,
// shown as "User") and an `ADMIN`.

import { z } from 'zod';

export const USER_ROLES = ['RM', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PERMISSIONS = [
  'simulate:run',
  'suitability:run',
  'explain:run',
  'chat:use',
  'runs:read',
  'audit:read',
  'users:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const RM_PERMISSIONS: readonly Permission[] = [
  'simulate:run',
  'suitability:run',
  'explain:run',
  'chat:use',
  // Their own saved runs only: the API filters by the signed-in account.
  'runs:read',
];

/**
 * A user (RM) runs the desk and sees their own saved runs. An admin can do the same, and also sees
 * every account's activity and runs (audit view, analytics) and manages users.
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  RM: RM_PERMISSIONS,
  ADMIN: [...RM_PERMISSIONS, 'audit:read', 'users:manage'],
};

export const hasPermission = (role: UserRole, permission: Permission): boolean =>
  ROLE_PERMISSIONS[role].includes(permission);

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: 'Enter a valid email address' }));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH)
  .refine((p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p), {
    message: 'Password needs a lowercase letter, an uppercase letter and a digit',
  });

// A display name is only ever a label. Nothing derives a role or a query from it (the role is set
// by the server, and every database call is parameterised), but it is still restricted so it
// cannot carry markup or SQL-looking text, or pose as an official account.
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
const NAME_LOOKALIKE_SCRIPTS = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;
const NAME_RESERVED = [
  'admin',
  'administrator',
  'root',
  'superuser',
  'sysadmin',
  'system',
  'compliance',
  'support',
  'moderator',
  'owner',
  'staff',
  'finstrukt',
  'mindspark',
  'null',
  'undefined',
];
const RESERVED_ONLY = new RegExp(`^(?:${NAME_RESERVED.join('|')})+$`);

/** Letters, spaces and . ' ’ - only, 2–60 characters, no stacked punctuation. */
const baseDisplayNameSchema = z
  .string()
  .normalize('NFKC')
  .trim()
  .transform((s) => s.replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(60, 'Name must be at most 60 characters')
      .refine((s) => NAME_PATTERN.test(s) && !/[.'’-]{2}/.test(s), {
        message: 'Use letters, spaces, hyphens, apostrophes and full stops only',
      })
      .refine((s) => !NAME_LOOKALIKE_SCRIPTS.test(s), {
        message: 'Use Latin letters or your own language, without look-alike characters',
      }),
  );

/** Public sign-up also may not use a word that makes it look like an official account. */
const displayNameSchema = baseDisplayNameSchema.refine(
  (s) => {
    const words = s
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .filter(Boolean);
    return !words.some((w) => NAME_RESERVED.includes(w)) && !RESERVED_ONLY.test(words.join(''));
  },
  { message: 'That name is reserved. Use your own name.' },
);

/** Public registration always creates an RM; the role is never taken from the request. */
export const registerRequestSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
});
export type RegisterRequest = z.output<typeof registerRequestSchema>;

export const loginRequestSchema = z.strictObject({
  email: emailSchema,
  // Not re-validated for strength: an old password must still be accepted.
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.output<typeof loginRequestSchema>;

// ---- settings (stored on the server; the theme is also mirrored in a cookie) ----

export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

export const userSettingsSchema = z.strictObject({
  theme: z.enum(THEMES),
  customCursor: z.boolean(),
});
export type UserSettings = z.output<typeof userSettingsSchema>;

export const DEFAULT_USER_SETTINGS: UserSettings = { theme: 'light', customCursor: true };

export const updateSettingsRequestSchema = userSettingsSchema
  .partial()
  .refine((s) => Object.keys(s).length > 0, { message: 'Provide at least one setting' });
export type UpdateSettingsRequest = z.output<typeof updateSettingsRequestSchema>;

// ---- admin ----

// An administrator creating an account may use official-sounding labels (e.g. "Support Desk"),
// but the same character rules apply.
export const createUserRequestSchema = registerRequestSchema.extend({
  displayName: baseDisplayNameSchema,
  role: z.enum(USER_ROLES),
});
export type CreateUserRequest = z.output<typeof createUserRequestSchema>;

export const updateUserRequestSchema = z
  .strictObject({ role: z.enum(USER_ROLES), active: z.boolean() })
  .partial()
  .refine((u) => Object.keys(u).length > 0, { message: 'Provide a role or an active flag' });
export type UpdateUserRequest = z.output<typeof updateUserRequestSchema>;

// ---- responses ----

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  settings: UserSettings;
}

export interface AdminUser extends AuthUser {
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AuthUserResponse {
  user: AuthUser;
}

/** `GET /api/auth/me`. `authRequired` is false only when the server runs without enforcement. */
export interface SessionResponse {
  authRequired: boolean;
  user: AuthUser | null;
}

export interface AdminUsersResponse {
  users: AdminUser[];
}

export interface AdminUserResponse {
  user: AdminUser;
}

/** Names of the cookies the API sets. Tokens are httpOnly; the theme cookie is readable by script. */
export const AUTH_COOKIES = {
  access: 'ms_access',
  refresh: 'ms_refresh',
  theme: 'ms_theme',
} as const;

/** Header carrying the SHA-256 (hex) of the exact request body bytes. */
export const PAYLOAD_HASH_HEADER = 'x-payload-hash';
