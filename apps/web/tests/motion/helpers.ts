// Test doubles for the browser APIs the motion code depends on. jsdom has neither a real matchMedia
// nor IntersectionObserver, and animation timing must never decide whether a test passes.
import { vi } from 'vitest';

type Listener = () => void;

/** A controllable matchMedia: `set(query, true)` flips the query and notifies subscribers. */
export function mockMatchMedia(initial: Record<string, boolean> = {}) {
  const state = new Map(Object.entries(initial));
  const listeners = new Map<string, Set<Listener>>();
  const listenersFor = (query: string): Set<Listener> => {
    let set = listeners.get(query);
    if (!set) {
      set = new Set();
      listeners.set(query, set);
    }
    return set;
  };
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    get matches() {
      return state.get(query) ?? false;
    },
    addEventListener: (_type: string, cb: Listener) => listenersFor(query).add(cb),
    removeEventListener: (_type: string, cb: Listener) => listenersFor(query).delete(cb),
  }));
  return {
    set(query: string, value: boolean) {
      state.set(query, value);
      listenersFor(query).forEach((cb) => cb());
    },
    listenerCount(query: string) {
      return listenersFor(query).size;
    },
  };
}

type Callback = (entries: Array<{ isIntersecting: boolean }>) => void;

/** An IntersectionObserver that never fires by itself; tests call `trigger`. */
export class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  observed: Element[] = [];
  disconnected = false;

  constructor(private readonly callback: Callback) {
    FakeIntersectionObserver.instances.push(this);
  }

  observe(el: Element) {
    this.observed.push(el);
  }

  unobserve() {}

  disconnect() {
    this.disconnected = true;
  }

  trigger(isIntersecting: boolean) {
    this.callback([{ isIntersecting }]);
  }
}

export function mockIntersectionObserver() {
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  return FakeIntersectionObserver;
}
