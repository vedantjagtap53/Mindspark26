import type { ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import * as m from 'framer-motion/m';
import { duration, easeOut } from '../motion/tokens';

/**
 * Cross-fades between the five journey stages: the old stage fades out quickly, the new one fades in
 * and slides up 10 px. Content is mounted and readable as soon as it enters; nothing waits on the
 * animation. Form state lives in App, so it is untouched by the stage being unmounted. With reduced
 * motion Framer Motion drops the slide and keeps only the fade, and without the animation features
 * (tests, first paint) the swap is immediate.
 */
export function StageTransition({ stageKey, children }: { stageKey: string; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={stageKey}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0, transition: { duration: duration.base, ease: easeOut } }}
        exit={{ opacity: 0, y: -6, transition: { duration: duration.fast, ease: easeOut } }}
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}
