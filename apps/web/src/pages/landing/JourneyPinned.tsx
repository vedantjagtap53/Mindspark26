// Desktop version of the five-stage journey: the section pins to the screen while the page scrolls,
// and the stages light up in turn. ScrollTrigger reports the progress through the tall track; the
// browser still does the scrolling (Lenis only smooths it). Every stage's text is in the list the
// whole time, so nothing depends on the effect to be readable, and each stage is a button that
// scrolls to its point in the track.
import { useEffect, useRef, useState } from 'react';
import { useLenis } from '../../motion/scroll/LenisProvider';
import { setupGsap } from '../../motion/scroll/gsapSetup';
import { STAGES_HEADING, STAGE_STEPS } from './content';

const STEPS = STAGE_STEPS.length;

/** Which stage a progress value (0 to 1) belongs to. */
export const stepAt = (progress: number): number =>
  Math.min(STEPS - 1, Math.max(0, Math.floor(progress * STEPS)));

export function JourneyPinned() {
  const track = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const lenis = useLenis();

  useEffect(() => {
    const trackEl = track.current;
    const stageEl = stage.current;
    if (!trackEl || !stageEl) return;
    const { ScrollTrigger } = setupGsap();
    const trigger = ScrollTrigger.create({
      trigger: trackEl,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        // The bar and the background tint read this variable, so scrolling never re-renders React.
        stageEl.style.setProperty('--journey-progress', self.progress.toFixed(4));
        setActive(stepAt(self.progress));
      },
    });
    // Fonts change the page height; measure again once they are in.
    void document.fonts?.ready.then(() => ScrollTrigger.refresh());
    return () => trigger.kill();
  }, []);

  const goTo = (index: number) => {
    const trackEl = track.current;
    const stageEl = stage.current;
    if (!trackEl || !stageEl) return;
    const travel = trackEl.offsetHeight - stageEl.offsetHeight;
    const top =
      trackEl.getBoundingClientRect().top + window.scrollY + ((index + 0.04) / STEPS) * travel;
    if (lenis) lenis.scrollTo(top);
    else window.scrollTo({ top });
  };

  const current = STAGE_STEPS[active] ?? STAGE_STEPS[0]!;

  return (
    <section
      id="journey"
      aria-labelledby="journey-title"
      className="border-t border-[var(--border-subtle)]"
    >
      <div ref={track} style={{ height: `${STEPS * 55 + 45}vh` }} className="relative">
        <div
          ref={stage}
          style={{
            background:
              'color-mix(in srgb, var(--accent-primary) calc(var(--journey-progress, 0) * 12%), var(--card-bg))',
          }}
          className="sticky top-0 h-screen overflow-hidden flex flex-col justify-center px-6"
        >
          <div className="max-w-6xl mx-auto w-full grid gap-12 lg:grid-cols-[1.1fr_1fr] items-center">
            <div>
              <h2
                id="journey-title"
                className="text-3xl font-serif font-bold text-[var(--ink-primary)] mb-8"
              >
                {STAGES_HEADING}
              </h2>
              <ol className="space-y-2">
                {STAGE_STEPS.map(({ title, text }, index) => (
                  <li key={title}>
                    <button
                      type="button"
                      onClick={() => goTo(index)}
                      aria-current={index === active ? 'step' : undefined}
                      className={`w-full text-left flex items-start gap-4 p-3 rounded-2xl transition-[opacity,background-color] duration-[var(--motion-base)] ease-[var(--ease-out)] ${
                        index === active
                          ? 'bg-[var(--card-bg)]/70 opacity-100'
                          : 'opacity-55 hover:opacity-90'
                      }`}
                    >
                      <span className="w-9 h-9 shrink-0 rounded-full bg-[var(--accent-primary)] text-[var(--accent-text)] flex items-center justify-center font-bold text-sm">
                        {index + 1}
                      </span>
                      <span>
                        <span className="block font-semibold text-[var(--ink-primary)]">
                          {title}
                        </span>
                        <span className="block text-sm text-[var(--ink-secondary)] mt-0.5 leading-relaxed">
                          {text}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>

            {/* A large view of the current stage. It repeats the list, so it is hidden from assistive tech. */}
            <div aria-hidden className="clay-tile p-10 text-center space-y-4">
              <div className="font-serif text-8xl font-extrabold text-[var(--accent-primary)] leading-none">
                {active + 1}
              </div>
              <div className="font-serif text-2xl font-bold text-[var(--ink-primary)]">
                {current.title}
              </div>
              <p className="text-[var(--ink-secondary)] leading-relaxed">{current.text}</p>
              <div className="h-1 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                <div
                  className="h-full origin-left bg-[var(--accent-primary)]"
                  style={{ transform: 'scaleX(var(--journey-progress, 0))' }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
