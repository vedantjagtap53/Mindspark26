import { useCallback, useEffect, useState } from 'react';

interface Options {
  /** Fraction of the element that must be visible (0 to 1). */
  threshold?: number;
  /** Grow or shrink the viewport, e.g. '-20% 0px'. */
  rootMargin?: string;
  /** Stop observing after the first time the element is seen (entrance effects). */
  once?: boolean;
  /** What to report before the observer's first answer. Defaults to "not visible" where the observer
   *  exists. Pass `true` for something known to start on screen, to avoid a flash of the wrong state. */
  initialInView?: boolean;
}

/**
 * Whether an element is on screen. Returns a callback ref and the flag. Without
 * IntersectionObserver the element counts as visible, so content is never left hidden.
 */
export function useInView<T extends Element = HTMLElement>({
  threshold = 0,
  rootMargin = '0px',
  once = false,
  initialInView,
}: Options = {}): [(node: T | null) => void, boolean] {
  const [node, setNode] = useState<T | null>(null);
  const supported = typeof IntersectionObserver !== 'undefined';
  const [inView, setInView] = useState(initialInView ?? !supported);

  useEffect(() => {
    if (!node || !supported) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, supported, threshold, rootMargin, once]);

  const ref = useCallback((el: T | null) => setNode(el), []);
  return [ref, inView];
}
