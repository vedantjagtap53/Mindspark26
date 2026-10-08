import { useCallback, useSyncExternalStore } from 'react';

function match(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(query) ?? null;
}

/** Live value of a media query. Without matchMedia (tests, very old browsers) it is `false`. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = match(query);
      if (!mql || typeof mql.addEventListener !== 'function') return () => {};
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => match(query)?.matches ?? false,
    () => false,
  );
}

/** The user asks the system for less motion. Every effect must have a still version. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** A real pointer that can hover (not a touch screen). Hover-only effects need this. */
export const HOVER_CAPABLE_QUERY = '(hover: hover) and (pointer: fine)';

/** A phone-sized screen: carousels replace side-by-side layouts below this width. */
export const PHONE_QUERY = '(max-width: 767px)';

/** Wide enough for the pinned, side-by-side layouts. Matches the breakpoint used on the landing page. */
export const DESKTOP_QUERY = '(min-width: 1025px)';
