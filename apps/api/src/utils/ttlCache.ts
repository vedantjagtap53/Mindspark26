// A small in-memory cache for answers from external services (forecast, FX reference rate).
// Per process, no shared store: a restart empties it. Failures are never cached, and identical
// requests that arrive while the first is still loading share its answer instead of calling again.

export interface TtlCacheOptions {
  /** How long an answer is reused. 0 or less turns the cache off. */
  ttlMs: number;
  /** Oldest-used entries are dropped beyond this many. */
  maxEntries: number;
  now?: () => number;
}

export interface TtlCache<V> {
  /** The cached answer for `key`, or the result of `load` (stored only if it succeeds). */
  get(key: string, load: () => Promise<V>): Promise<V>;
  readonly size: number;
  clear(): void;
}

export function createTtlCache<V>(opts: TtlCacheOptions): TtlCache<V> {
  const now = opts.now ?? Date.now;
  const entries = new Map<string, { value: V; expiresAt: number }>();
  const loading = new Map<string, Promise<V>>();

  if (opts.ttlMs <= 0) {
    return { get: (_key, load) => load(), size: 0, clear: () => {} };
  }

  return {
    get(key, load) {
      const hit = entries.get(key);
      if (hit && hit.expiresAt > now()) {
        // Re-insert so the Map's order stays least recently used first.
        entries.delete(key);
        entries.set(key, hit);
        return Promise.resolve(hit.value);
      }
      if (hit) entries.delete(key);

      const pending = loading.get(key);
      if (pending) return pending;

      const promise = load().then(
        (value) => {
          loading.delete(key);
          entries.set(key, { value, expiresAt: now() + opts.ttlMs });
          while (entries.size > opts.maxEntries) {
            entries.delete(entries.keys().next().value!);
          }
          return value;
        },
        (err: unknown) => {
          loading.delete(key);
          throw err;
        },
      );
      loading.set(key, promise);
      return promise;
    },
    get size() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
  };
}

/** Freezes a value and everything inside it, so a shared cached answer cannot be changed in place. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
