// Activity log and admin analytics (added 2026-10-08). Everything here is read by the admin only:
// the API records an event when something happens to an account (sign-up, sign-in, role change)
// or when a run is saved, and the admin console charts and lists them.

import type { ProductType, SimulationMode, SuitabilityVerdict } from '../enums/domain.js';
import type { RunOwner } from '../types/audit.js';

export const ACTIVITY_EVENTS = [
  'REGISTER',
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'USER_CREATED',
  'ROLE_CHANGED',
  'USER_ACTIVATED',
  'USER_DEACTIVATED',
  'RUN_SAVED',
] as const;
export type ActivityEventType = (typeof ACTIVITY_EVENTS)[number];

/** One row of the activity log. Never holds a password, token or request body. */
export interface ActivityEvent {
  id: string;
  createdAt: string;
  event: ActivityEventType;
  /** The account the event is about; null when the email did not match any account. */
  user: RunOwner | null;
  /** The email typed at sign-in, kept for failed attempts. */
  actorEmail: string | null;
  /** Small, non-sensitive facts: the new role, the product and verdict of a saved run, etc. */
  detail: Record<string, unknown>;
}

/** `GET /api/admin/activity`. Newest first. */
export interface ActivityResponse {
  events: ActivityEvent[];
}

export interface DailyActivity {
  /** UTC calendar day, YYYY-MM-DD. */
  date: string;
  runs: number;
  logins: number;
}

export interface UserActivitySummary {
  user: RunOwner;
  runs: number;
  lastRunAt: string | null;
  lastLoginAt: string | null;
}

/** `GET /api/admin/analytics`: the numbers behind the admin overview charts. */
export interface AdminAnalytics {
  generatedAt: string;
  /** Days covered by `daily`, `byProduct`, `byMode`, `verdicts` and `topUsers`. */
  windowDays: number;
  totals: {
    users: number;
    activeUsers: number;
    admins: number;
    runsAllTime: number;
    runsInWindow: number;
    runsLast7Days: number;
    loginsLast7Days: number;
    failedLoginsLast7Days: number;
  };
  /** One entry per day in the window, oldest first, zero-filled. */
  daily: DailyActivity[];
  byProduct: Array<{ product: ProductType; runs: number }>;
  byMode: Array<{ mode: SimulationMode; runs: number }>;
  /** `null` is a run that has no verdict yet. */
  verdicts: Array<{ verdict: SuitabilityVerdict | null; count: number }>;
  /** The most active accounts in the window, busiest first. */
  topUsers: UserActivitySummary[];
  /** True when the window held more runs than the report reads; the charts then undercount. */
  truncated: boolean;
}
