// Admin analytics and activity log: counts and charts over the saved runs, the accounts and the
// activity events. Read-only, admin only. The numbers come from the same saved records as the audit
// view; nothing here is a separate calculation of any payoff or verdict.
import type {
  ActivityEvent,
  AdminAnalytics,
  DailyActivity,
  ProductType,
  SimulationMode,
  SuitabilityVerdict,
  UserActivitySummary,
} from '@mindspark/shared';
import type { Repositories } from '../../repositories/interfaces/index.js';
import { AppError } from '../../utils/errors.js';
import { toAppError } from '../persistence/persistenceService.js';

export const ANALYTICS_WINDOW_DAYS = 30;
/** The most runs one report reads; beyond it the report says it is truncated. */
export const ANALYTICS_MAX_RUNS = 5000;
const ANALYTICS_MAX_EVENTS = 20_000;
const TOP_USERS = 10;

export const ACTIVITY_DEFAULT_LIMIT = 100;
export const ACTIVITY_MAX_LIMIT = 500;

export interface AnalyticsService {
  overview(): Promise<AdminAnalytics>;
  recentActivity(limit?: number): Promise<ActivityEvent[]>;
}

const DAY_MS = 24 * 3600 * 1000;
const dayOf = (iso: string) => iso.slice(0, 10);

export function createAnalyticsService(
  repositories?: Repositories,
  now: () => Date = () => new Date(),
): AnalyticsService {
  const repos = (): Repositories => {
    if (!repositories) {
      throw new AppError(
        'DATABASE_NOT_CONFIGURED',
        'Analytics need the database: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
      );
    }
    return repositories;
  };

  return {
    async overview() {
      const r = repos();
      try {
        const at = now();
        // The window is whole UTC days, ending today, so every chart bar is a full calendar day.
        const today = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
        const windowStart = new Date(today - (ANALYTICS_WINDOW_DAYS - 1) * DAY_MS).toISOString();
        const sevenDaysAgo = new Date(at.getTime() - 7 * DAY_MS).toISOString();

        const [users, runsRead, events, runsAllTime] = await Promise.all([
          r.users.list(),
          r.simulations.listSince(windowStart, ANALYTICS_MAX_RUNS + 1),
          r.activity.listSince(windowStart, ANALYTICS_MAX_EVENTS),
          r.simulations.count(),
        ]);
        const truncated = runsRead.length > ANALYTICS_MAX_RUNS;
        const runs = truncated ? runsRead.slice(0, ANALYTICS_MAX_RUNS) : runsRead;

        const daily = new Map<string, DailyActivity>();
        for (let i = 0; i < ANALYTICS_WINDOW_DAYS; i++) {
          const date = dayOf(
            new Date(today - (ANALYTICS_WINDOW_DAYS - 1 - i) * DAY_MS).toISOString(),
          );
          daily.set(date, { date, runs: 0, logins: 0 });
        }
        for (const run of runs) {
          const day = daily.get(dayOf(run.createdAt));
          if (day) day.runs += 1;
        }
        let loginsLast7Days = 0;
        let failedLoginsLast7Days = 0;
        for (const e of events) {
          if (e.event === 'LOGIN') {
            const day = daily.get(dayOf(e.createdAt));
            if (day) day.logins += 1;
            if (e.createdAt >= sevenDaysAgo) loginsLast7Days += 1;
          } else if (e.event === 'LOGIN_FAILED' && e.createdAt >= sevenDaysAgo) {
            failedLoginsLast7Days += 1;
          }
        }

        const byProduct = new Map<ProductType, number>();
        const byMode = new Map<SimulationMode, number>();
        const verdicts = new Map<SuitabilityVerdict | null, number>();
        const perUser = new Map<string, UserActivitySummary>();
        const lastLogin = new Map(users.map((u) => [u.id, u.lastLoginAt]));
        for (const run of runs) {
          const product = run.configuration.productType;
          byProduct.set(product, (byProduct.get(product) ?? 0) + 1);
          byMode.set(run.mode, (byMode.get(run.mode) ?? 0) + 1);
          const verdict = run.suitability?.verdict ?? null;
          verdicts.set(verdict, (verdicts.get(verdict) ?? 0) + 1);
          if (run.owner) {
            const row = perUser.get(run.owner.id) ?? {
              user: run.owner,
              runs: 0,
              lastRunAt: null,
              lastLoginAt: lastLogin.get(run.owner.id) ?? null,
            };
            row.runs += 1;
            if (!row.lastRunAt || run.createdAt > row.lastRunAt) row.lastRunAt = run.createdAt;
            perUser.set(run.owner.id, row);
          }
        }

        return {
          generatedAt: at.toISOString(),
          windowDays: ANALYTICS_WINDOW_DAYS,
          totals: {
            users: users.length,
            activeUsers: users.filter((u) => u.active).length,
            admins: users.filter((u) => u.active && u.role === 'ADMIN').length,
            runsAllTime,
            runsInWindow: runs.length,
            runsLast7Days: runs.filter((x) => x.createdAt >= sevenDaysAgo).length,
            loginsLast7Days,
            failedLoginsLast7Days,
          },
          daily: [...daily.values()],
          byProduct: [...byProduct].map(([product, n]) => ({ product, runs: n })),
          byMode: [...byMode].map(([mode, n]) => ({ mode, runs: n })),
          verdicts: [...verdicts].map(([verdict, count]) => ({ verdict, count })),
          topUsers: [...perUser.values()].sort((a, b) => b.runs - a.runs).slice(0, TOP_USERS),
          truncated,
        };
      } catch (err) {
        return toAppError(err);
      }
    },

    async recentActivity(limit = ACTIVITY_DEFAULT_LIMIT) {
      const r = repos();
      try {
        return await r.activity.listRecent(
          Math.min(Math.max(1, Math.trunc(limit)), ACTIVITY_MAX_LIMIT),
        );
      } catch (err) {
        return toAppError(err);
      }
    },
  };
}
