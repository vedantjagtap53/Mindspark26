// The home page for someone who is not signed in. The page itself lives in ./landing and is loaded on
// demand, so the simulator (which signed-in users go straight to) never downloads it. This wrapper
// keeps the original import path and props, so App.tsx and AppRoot.tsx are unchanged.
import { Suspense, lazy } from 'react';
import type { LandingPage as LandingPageImpl, LandingProps } from './landing/LandingPage';

type LandingComponent = typeof LandingPageImpl;

let loaded: LandingComponent | null = null;
const load = () =>
  import('./landing/LandingPage').then((mod) => {
    loaded = mod.LandingPage;
    return loaded;
  });
const Landing = lazy(() => load().then((component) => ({ default: component })));

/** Starts downloading the home page. Once it has arrived it is rendered straight away. */
export const preloadLanding = (): Promise<void> => load().then(() => undefined);

export function LandingPage(props: LandingProps) {
  const Ready = loaded;
  if (Ready) return <Ready {...props} />;
  return (
    <Suspense
      fallback={
        <div
          role="status"
          aria-busy="true"
          className="min-h-screen bg-[var(--canvas-bg)] text-[var(--ink-muted)] flex items-center justify-center text-sm"
        >
          Loading…
        </div>
      }
    >
      <Landing {...props} />
    </Suspense>
  );
}
