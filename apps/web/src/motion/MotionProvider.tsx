import type { ReactNode } from 'react';
import { LazyMotion, MotionConfig } from 'framer-motion';

// The animation features load in a separate chunk after the first paint, so the simulator does not
// pay for them up front. Components use the small `m` element (not `motion`), which LazyMotion
// strict mode enforces.
const loadFeatures = () => import('./motionFeatures').then((mod) => mod.default);

/**
 * Wraps the app so Framer Motion respects the user's reduced-motion setting (`reducedMotion="user"`
 * turns transform and layout animations off, keeping opacity and colour changes).
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadFeatures} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
