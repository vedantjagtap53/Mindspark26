// Supabase implementation of the activity log (table activity_events,
// supabase/migrations/20261008100000_accounts_runs_activity.sql).
// Must pass tests/contract/activityRepositoryContract.ts.

import type { ActivityEvent, ActivityEventType } from '@mindspark/shared';
import type { ActivityEventRepository } from '../interfaces/index.js';
import { toIso } from './mapping.js';
import { unwrap, type Db } from './supabaseClient.js';

interface ActivityRow {
  id: string;
  actor_email: string | null;
  event: ActivityEventType;
  detail: Record<string, unknown> | null;
  created_at: string;
  /** PostgREST embeds a many-to-one relation as an object; older versions return a list. */
  user:
    | { id: string; email: string; display_name: string }
    | Array<{ id: string; email: string; display_name: string }>
    | null;
}

const ACTIVITY_SELECT =
  'id, actor_email, event, detail, created_at, user:app_users(id, email, display_name)';

const toEvent = (r: ActivityRow): ActivityEvent => {
  const user = Array.isArray(r.user) ? (r.user[0] ?? null) : r.user;
  return {
    id: r.id,
    createdAt: toIso(r.created_at),
    event: r.event,
    user: user ? { id: user.id, email: user.email, displayName: user.display_name } : null,
    actorEmail: r.actor_email,
    detail: r.detail ?? {},
  };
};

export function createSupabaseActivityRepository(db: Db): ActivityEventRepository {
  return {
    async record({ userId, actorEmail, event, detail }) {
      unwrap(
        await db
          .from('activity_events')
          .insert({ user_id: userId, actor_email: actorEmail, event, detail }),
      );
    },
    async listRecent(limit) {
      const rows = unwrap<ActivityRow[]>(
        await db
          .from('activity_events')
          .select(ACTIVITY_SELECT)
          .order('created_at', { ascending: false })
          .limit(limit),
      );
      return rows.map(toEvent);
    },
    async listSince(sinceIso, limit) {
      const rows = unwrap<ActivityRow[]>(
        await db
          .from('activity_events')
          .select(ACTIVITY_SELECT)
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(limit),
      );
      return rows.map(toEvent);
    },
  };
}
