import { useEffect, useRef } from 'react';
import { BRAND_NAME } from '../../constants/brand';
import { duration, gsapEase } from '../../motion/tokens';
import { useReducedMotion } from '../../motion/useReducedMotion';
import { scrollEffectsSupported, setupGsap } from '../../motion/scroll/gsapSetup';
import { FOOTER_NOTE } from './content';

export function LandingFooter() {
  const root = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  // The wordmark fades up and sharpens once, the first time the footer scrolls into view. It is
  // plain text in the page the whole time (hidden only after this effect runs), and with reduced
  // motion, or where scroll effects are unsupported, it is simply shown.
  useEffect(() => {
    const word = root.current?.querySelector('[data-footer-wordmark]');
    if (reduced || !word || !scrollEffectsSupported()) return;
    const { gsap, ScrollTrigger } = setupGsap();
    const ctx = gsap.context(() => {
      gsap.set(word, { autoAlpha: 0, y: 40, filter: 'blur(18px)' });
      ScrollTrigger.create({
        trigger: word,
        start: 'top 92%',
        once: true,
        onEnter: () =>
          void gsap.to(word, {
            autoAlpha: 1,
            y: 0,
            filter: 'blur(0px)',
            duration: duration.scene * 1.4,
            ease: gsapEase.out,
            clearProps: 'filter',
          }),
      });
    }, root.current ?? undefined);
    return () => ctx.revert();
  }, [reduced]);

  return (
    <footer
      ref={root}
      className="py-10 text-center text-sm text-[var(--ink-muted)] border-t border-[var(--border-subtle)] bg-[var(--canvas-bg)] relative z-20 space-y-3"
    >
      <p
        data-footer-wordmark
        className="font-serif text-5xl md:text-7xl font-extrabold tracking-tight text-[var(--ink-primary)]/90"
      >
        {BRAND_NAME}
      </p>
      <p>
        &copy; {new Date().getFullYear()} {BRAND_NAME}
      </p>
      <p className="text-xs">{FOOTER_NOTE}</p>
    </footer>
  );
}
