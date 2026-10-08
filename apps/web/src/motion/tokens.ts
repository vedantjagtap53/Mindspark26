// Motion tokens. The CSS variables in index.css (--motion-*, --ease-*, --stagger) are the source of
// truth; these values mirror them for GSAP and Framer Motion, and tests/motion/tokens.test.ts checks
// that the two stay in step. Durations here are in seconds, as both libraries expect.

export const duration = {
  fast: 0.12,
  base: 0.22,
  slow: 0.45,
  scene: 0.9,
} as const;

/** cubic-bezier control points, usable by Framer Motion directly. */
export const easeOut = [0.16, 1, 0.3, 1] as const;
export const easeInOut = [0.65, 0, 0.35, 1] as const;

/** GSAP has no built-in cubic-bezier without a plugin, so it uses the nearest named curves. */
export const gsapEase = {
  out: 'power3.out',
  inOut: 'power2.inOut',
} as const;

export const stagger = 0.06;

/** Longer lists enter together; staggering more than this many items feels slow. */
export const MAX_STAGGERED_ITEMS = 8;

/** Delay for item `index` in a staggered entrance, capped so late items do not wait. */
export function staggerDelay(index: number): number {
  return Math.min(Math.max(index, 0), MAX_STAGGERED_ITEMS) * stagger;
}
