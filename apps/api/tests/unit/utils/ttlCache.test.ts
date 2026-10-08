import { describe, expect, it } from 'vitest';
import { createTtlCache, deepFreeze } from '../../../src/utils/ttlCache.js';

/** A loader that counts its calls and answers `value` (or fails when told to). */
function loader<V>(value: V) {
  const state = { calls: 0, fail: false };
  const load = () => {
    state.calls += 1;
    return state.fail ? Promise.reject(new Error('down')) : Promise.resolve(value);
  };
  return { state, load };
}

describe('ttl cache', () => {
  it('reuses an answer until it expires, then loads again', async () => {
    let t = 0;
    const cache = createTtlCache<string>({ ttlMs: 1000, maxEntries: 10, now: () => t });
    const { state, load } = loader('a');
    expect(await cache.get('k', load)).toBe('a');
    t = 999;
    expect(await cache.get('k', load)).toBe('a');
    expect(state.calls).toBe(1);
    t = 1000;
    await cache.get('k', load);
    expect(state.calls).toBe(2);
  });

  it('keeps answers per key', async () => {
    const cache = createTtlCache<string>({ ttlMs: 1000, maxEntries: 10 });
    expect(await cache.get('a', () => Promise.resolve('A'))).toBe('A');
    expect(await cache.get('b', () => Promise.resolve('B'))).toBe('B');
    expect(cache.size).toBe(2);
  });

  it('never caches a failure', async () => {
    const cache = createTtlCache<string>({ ttlMs: 1000, maxEntries: 10 });
    const { state, load } = loader('ok');
    state.fail = true;
    await expect(cache.get('k', load)).rejects.toThrow('down');
    state.fail = false;
    expect(await cache.get('k', load)).toBe('ok');
    expect(state.calls).toBe(2);
  });

  it('shares one load between identical requests made at the same time', async () => {
    const cache = createTtlCache<string>({ ttlMs: 1000, maxEntries: 10 });
    let release!: (v: string) => void;
    let calls = 0;
    const load = () => {
      calls += 1;
      return new Promise<string>((resolve) => (release = resolve));
    };
    const first = cache.get('k', load);
    const second = cache.get('k', load);
    release('shared');
    expect(await Promise.all([first, second])).toEqual(['shared', 'shared']);
    expect(calls).toBe(1);
  });

  it('lets a failed shared load be retried by the next request', async () => {
    const cache = createTtlCache<string>({ ttlMs: 1000, maxEntries: 10 });
    const failing = Promise.reject(new Error('down'));
    failing.catch(() => {});
    await expect(cache.get('k', () => failing)).rejects.toThrow('down');
    expect(await cache.get('k', () => Promise.resolve('ok'))).toBe('ok');
  });

  it('drops the least recently used entry beyond the limit', async () => {
    const cache = createTtlCache<string>({ ttlMs: 1000, maxEntries: 2 });
    await cache.get('a', () => Promise.resolve('A'));
    await cache.get('b', () => Promise.resolve('B'));
    await cache.get('a', () => Promise.resolve('unused')); // touch a: b is now the oldest
    await cache.get('c', () => Promise.resolve('C'));
    expect(cache.size).toBe(2);
    const reloaded = loader('B2');
    expect(await cache.get('b', reloaded.load)).toBe('B2');
    expect(reloaded.state.calls).toBe(1);
    const kept = loader('unused');
    expect(await cache.get('c', kept.load)).toBe('C');
    expect(kept.state.calls).toBe(0);
  });

  it('is off when the time is 0: every request loads', async () => {
    const cache = createTtlCache<string>({ ttlMs: 0, maxEntries: 10 });
    const { state, load } = loader('a');
    await cache.get('k', load);
    await cache.get('k', load);
    expect(state.calls).toBe(2);
    expect(cache.size).toBe(0);
  });
});

describe('deepFreeze', () => {
  it('freezes nested objects and arrays, so a shared value cannot be changed', () => {
    const v = deepFreeze({ a: { b: [1, 2, { c: 3 }] } });
    expect(Object.isFrozen(v)).toBe(true);
    expect(Object.isFrozen(v.a.b)).toBe(true);
    expect(Object.isFrozen(v.a.b[2])).toBe(true);
    expect(() => {
      (v.a.b as number[]).push(4);
    }).toThrow(TypeError);
  });
});
