// GSAP and ScrollTrigger setup, shared by the landing-page effects. Only the landing page imports this
// folder (never motion/index.ts), so the simulator does not download GSAP.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type Lenis from 'lenis';

let registered = false;

/** Scroll-linked effects need a real browser (matchMedia); in jsdom tests they are skipped. */
export const scrollEffectsSupported = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/** Registers ScrollTrigger once (safe to call again, including after a React strict-mode remount). */
export function setupGsap(): { gsap: typeof gsap; ScrollTrigger: typeof ScrollTrigger } {
  // ScrollTrigger measures with matchMedia at registration; without it (jsdom in tests) it is left out
  // and the scroll effects that need it do not run either.
  if (!registered && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    gsap.registerPlugin(ScrollTrigger);
    registered = true;
  }
  return { gsap, ScrollTrigger };
}

/**
 * Makes Lenis and GSAP share one animation loop: Lenis is advanced from GSAP's ticker, and every
 * Lenis scroll tells ScrollTrigger to update. Returns a function that undoes the connection.
 */
export function connectLenis(lenis: Lenis): () => void {
  const { ScrollTrigger: trigger } = setupGsap();
  const offScroll = lenis.on('scroll', () => trigger.update());
  const tick = (time: number) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  return () => {
    offScroll();
    gsap.ticker.remove(tick);
    gsap.ticker.lagSmoothing(500, 33); // GSAP's defaults
  };
}
