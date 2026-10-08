import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { useReducedMotion } from '../useReducedMotion';
import { connectLenis } from './gsapSetup';

// The running instance lives in a tiny external store so components can read it (useLenis) without
// the provider setting React state from inside an effect.
let current: Lenis | null = null;
const listeners = new Set<() => void>();

function publish(instance: Lenis | null) {
  current = instance;
  listeners.forEach((notify) => notify());
}

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
};

/** The running Lenis instance, or null (reduced motion, or the landing page is not mounted). */
export function useLenis(): Lenis | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}

/**
 * Smooth scrolling for the landing page only. One Lenis instance drives GSAP's ticker and
 * ScrollTrigger (see connectLenis); it is destroyed when the page unmounts, so the simulator and
 * the admin screens always scroll natively. With reduced motion it is not created at all.
 */
export function LenisProvider({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();

  useEffect(() => {
    // Lenis measures the page with ResizeObserver; where that is missing the page scrolls natively.
    if (reduced || typeof ResizeObserver === 'undefined') return;
    // autoRaf is off: GSAP's ticker advances Lenis, so there is only one loop.
    const instance = new Lenis({ autoRaf: false, anchors: true });
    const disconnect = connectLenis(instance);
    publish(instance);
    return () => {
      disconnect();
      instance.destroy();
      publish(null);
    };
  }, [reduced]);

  return <>{children}</>;
}
