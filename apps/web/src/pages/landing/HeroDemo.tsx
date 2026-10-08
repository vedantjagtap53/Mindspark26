// A looping, clearly labelled SAMPLE of what a run looks like: three example clients are checked
// against the same high-risk ELN, a payoff line draws, and the verdict changes. Everything here is a
// fixed constant in this file. It is never fetched, never computed and never taken from a real run,
// and it says so on screen. The animation only fades things in and draws a line; it does not tween
// any figure. Reduced motion (and print) get one still frame with everything visible.
import { useEffect, useRef, useState } from 'react';
import { duration, gsapEase, stagger } from '../../motion/tokens';
import { useInView } from '../../motion/useInView';
import { useReducedMotion } from '../../motion/useReducedMotion';
import { setupGsap } from '../../motion/scroll/gsapSetup';

type Verdict = 'Suitable' | 'Caution' | 'Not suitable';

export interface SampleCase {
  appetite: string;
  horizon: string;
  tolerance: string;
  verdict: Verdict;
  reason: string;
}

/** Example clients only. The verdicts follow the kinds of rule the real engine applies, but no rule is run here. */
export const SAMPLE_CASES: readonly SampleCase[] = [
  {
    appetite: 'Low',
    horizon: '12 months',
    tolerance: '5%',
    verdict: 'Not suitable',
    reason: 'The note is rated High risk; this client’s risk appetite is Low.',
  },
  {
    appetite: 'Medium',
    horizon: '12 months',
    tolerance: '10%',
    verdict: 'Caution',
    reason: 'The note is rated High risk; this client’s risk appetite is Medium.',
  },
  {
    appetite: 'High',
    horizon: '12 months',
    tolerance: '20%',
    verdict: 'Suitable',
    reason: 'No rule raised a concern for this client.',
  },
];

/** The frame shown when nothing is animating. */
export const STILL_CASE = 1;

const BADGE: Record<Verdict, string> = {
  Suitable: 'clay-badge-suitable',
  Caution: 'clay-badge-caution',
  'Not suitable': 'clay-badge-unsafe',
};

type Timeline = ReturnType<ReturnType<typeof setupGsap>['gsap']['timeline']>;

export function HeroDemo() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(STILL_CASE);
  const [figureRef, inView] = useInView<HTMLElement>({ threshold: 0.25 });
  const scope = useRef<HTMLElement | null>(null);
  const timeline = useRef<Timeline | null>(null);

  // Build the timeline once (not under reduced motion). `context` scopes the selectors to this
  // figure and `revert` removes every tween it made, including under React strict mode's remount.
  useEffect(() => {
    if (reduced || !scope.current) return;
    const { gsap } = setupGsap();
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ repeat: -1, paused: true });
      SAMPLE_CASES.forEach((_, i) => {
        tl.call(() => setIndex(i))
          .fromTo(
            '[data-demo-row]',
            { autoAlpha: 0, y: 6 },
            { autoAlpha: 1, y: 0, duration: duration.base, stagger, ease: gsapEase.out },
          )
          .fromTo(
            '[data-demo-line]',
            { strokeDashoffset: 1 },
            { strokeDashoffset: 0, duration: duration.scene, ease: 'none' },
          )
          .fromTo(
            '[data-demo-verdict]',
            { autoAlpha: 0, scale: 0.96 },
            { autoAlpha: 1, scale: 1, duration: duration.base, ease: gsapEase.out },
          )
          .to({}, { duration: 1.8 })
          .to('[data-demo-row], [data-demo-verdict]', { autoAlpha: 0, duration: duration.fast });
      });
      timeline.current = tl;
    }, scope.current);
    return () => {
      timeline.current = null;
      ctx.revert();
      setIndex(STILL_CASE);
    };
  }, [reduced]);

  // Play only while the demo is on screen and the tab is visible.
  useEffect(() => {
    const tl = timeline.current;
    if (!tl) return;
    const update = () => {
      // GSAP's play and pause return the timeline, which is thenable; the result is not needed.
      if (inView && !document.hidden) void tl.play();
      else void tl.pause();
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [inView, reduced]);

  const sample = SAMPLE_CASES[index] ?? SAMPLE_CASES[STILL_CASE]!;

  return (
    <figure
      ref={(el) => {
        scope.current = el;
        figureRef(el);
      }}
      className="mx-auto max-w-3xl text-left"
    >
      <div
        aria-hidden
        className="clay-tile p-5 sm:p-6 grid gap-5 sm:grid-cols-[1fr_1.3fr_1fr] items-center"
      >
        <dl className="space-y-2 text-xs">
          <dt className="text-[10px] font-mono uppercase text-[var(--ink-muted)]">Sample client</dt>
          {(
            [
              ['Risk appetite', sample.appetite],
              ['Horizon', sample.horizon],
              ['Loss tolerance', sample.tolerance],
            ] as const
          ).map(([label, value]) => (
            <dd key={label} data-demo-row className="flex justify-between gap-3">
              <span className="text-[var(--ink-muted)]">{label}</span>
              <span className="font-mono font-semibold text-[var(--ink-primary)]">{value}</span>
            </dd>
          ))}
        </dl>

        <svg viewBox="0 0 240 110" className="w-full h-auto" role="presentation">
          <line x1="10" y1="96" x2="232" y2="96" stroke="var(--chart-grid-stroke)" />
          <line x1="10" y1="8" x2="10" y2="96" stroke="var(--chart-grid-stroke)" />
          <line
            x1="130"
            y1="8"
            x2="130"
            y2="96"
            stroke="var(--chart-grid-stroke)"
            strokeDasharray="3 3"
          />
          <path
            data-demo-line
            d="M 10 26 H 130 V 66 L 232 88"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={0}
            fill="none"
            stroke="var(--chart-payoff-stroke)"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <text x="134" y="20" fontSize="8" fill="var(--ink-muted)" fontFamily="var(--font-mono)">
            barrier
          </text>
        </svg>

        <div data-demo-verdict className="space-y-2">
          <span
            className={`inline-block text-[11px] font-mono px-2.5 py-1 rounded-full font-bold uppercase ${BADGE[sample.verdict]}`}
          >
            {sample.verdict}
          </span>
          <p className="text-[11px] leading-snug text-[var(--ink-secondary)]">{sample.reason}</p>
        </div>
      </div>

      <figcaption className="mt-3 text-center text-xs text-[var(--ink-muted)]">
        <strong className="font-semibold text-[var(--ink-secondary)]">
          Sample, illustrative. Not a real result.
        </strong>{' '}
        A high-risk Equity Linked Note checked against three example clients: a Low appetite gives
        Not suitable, Medium gives Caution and High gives Suitable.
      </figcaption>
    </figure>
  );
}
