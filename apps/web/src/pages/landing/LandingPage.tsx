// The home page for someone who is not signed in. Loaded on demand (see ../LandingPage.tsx), so the
// simulator does not download any of it. Props are unchanged from the original single-file page.
import type { ReactNode } from 'react';
import { useInView } from '../../motion/useInView';
import { LenisProvider } from '../../motion/scroll/LenisProvider';
import { CapabilityGrid } from './CapabilityGrid';
import { DataStrip } from './DataStrip';
import { Hero } from './Hero';
import { JourneySection } from './JourneySection';
import { LandingFooter } from './LandingFooter';
import { LandingHeader, type LandingActions } from './LandingHeader';
import { ProductStrip } from './ProductStrip';

export interface LandingProps extends LandingActions {
  /** Account controls (user menu) shown next to the buttons. */
  userSlot?: ReactNode;
}

export function LandingPage({ userSlot, ...actions }: LandingProps) {
  // A 1px sentinel at the very top: once it scrolls out of view the header tightens ("docks").
  const [sentinel, atTop] = useInView<HTMLDivElement>({ initialInView: true });
  return (
    <LenisProvider>
      <div className="relative min-h-screen bg-[var(--canvas-bg)] text-[var(--canvas-text)] font-sans flex flex-col selection:bg-[var(--accent-primary)] selection:text-white">
        <div ref={sentinel} aria-hidden className="absolute top-0 left-0 h-px w-px" />
        <LandingHeader {...actions} userSlot={userSlot} docked={!atTop} />
        <main className="flex-1 flex flex-col">
          <Hero {...actions} />
          <CapabilityGrid />
          <ProductStrip />
          <DataStrip />
          <JourneySection />
        </main>
        <LandingFooter />
      </div>
    </LenisProvider>
  );
}

export default LandingPage;
