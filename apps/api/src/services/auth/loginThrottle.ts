// Brute-force guard for login: after MAX_FAILURES wrong attempts for one email from one address,
// further attempts are refused until the window passes. In-memory and per process (no Redis, per
// CLAUDE.md); a restart clears it, and it complements rather than replaces strong passwords.

export interface LoginThrottle {
  /** Seconds the caller must wait, or 0 when an attempt is allowed. */
  retryAfterSeconds(key: string): number;
  recordFailure(key: string): void;
  recordSuccess(key: string): void;
}

export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60_000;
const MAX_TRACKED_KEYS = 10_000;

export function createLoginThrottle(now: () => number = Date.now): LoginThrottle {
  const failures = new Map<string, { count: number; firstAt: number }>();

  const live = (key: string) => {
    const entry = failures.get(key);
    if (entry && now() - entry.firstAt >= WINDOW_MS) {
      failures.delete(key);
      return undefined;
    }
    return entry;
  };

  return {
    retryAfterSeconds(key) {
      const entry = live(key);
      if (!entry || entry.count < MAX_FAILURES) return 0;
      return Math.max(1, Math.ceil((entry.firstAt + WINDOW_MS - now()) / 1000));
    },
    recordFailure(key) {
      const entry = live(key);
      if (entry) {
        entry.count += 1;
        return;
      }
      if (failures.size >= MAX_TRACKED_KEYS) {
        // Drop the oldest entry (Map keeps insertion order) rather than growing without bound.
        const oldest = failures.keys().next().value;
        if (oldest !== undefined) failures.delete(oldest);
      }
      failures.set(key, { count: 1, firstAt: now() });
    },
    recordSuccess(key) {
      failures.delete(key);
    },
  };
}
