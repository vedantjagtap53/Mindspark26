import type { CSSProperties } from 'react';
import { MAX_STAGGERED_ITEMS } from './tokens';

/**
 * Inline style that staggers a `.reveal-up` or `.reveal-fade` element: item `index` waits
 * `index x --stagger`, with the index capped so a long list does not make late rows wait.
 */
export function revealStyle(index: number): CSSProperties {
  const capped = Math.min(Math.max(Math.floor(index), 0), MAX_STAGGERED_ITEMS);
  return { '--i': capped } as CSSProperties;
}
