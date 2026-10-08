import type { ReactNode } from 'react';
import { revealStyle } from '../motion/reveal';
import { useInView } from '../motion/useInView';

/**
 * Fades its content up the first time it scrolls into view. The content is always in the page (so it
 * can be read, searched and printed); only its opacity starts at 0. Without IntersectionObserver it
 * is shown at once, and reduced motion and print skip the animation (see index.css).
 */
export function Reveal({
  children,
  index = 0,
  className = '',
}: {
  children: ReactNode;
  /** Position in a group, to stagger siblings. */
  index?: number;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>({ once: true, rootMargin: '0px 0px -8% 0px' });
  return (
    <div
      ref={ref}
      className={`${inView ? 'reveal-up' : 'reveal-pending'} ${className}`.trim()}
      style={revealStyle(index)}
    >
      {children}
    </div>
  );
}
