// Phase 7: the hero demo is a labelled sample. It must say so, read from constants only, show one still
// frame without motion, and clean up every tween it creates.
import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REDUCED_MOTION_QUERY } from '../../src/motion/useMediaQuery';
import { mockIntersectionObserver, mockMatchMedia } from './helpers';

// A stand-in for GSAP that records how the demo uses it.
const gsapSpy = vi.hoisted(() => ({
  timelines: 0,
  reverts: 0,
  plays: 0,
  pauses: 0,
}));
vi.mock('../../src/motion/scroll/gsapSetup', () => {
  const timeline = () => {
    gsapSpy.timelines += 1;
    const tl: Record<string, unknown> = {};
    for (const method of ['call', 'fromTo', 'to', 'set']) tl[method] = () => tl;
    tl.play = () => {
      gsapSpy.plays += 1;
      return tl;
    };
    tl.pause = () => {
      gsapSpy.pauses += 1;
      return tl;
    };
    return tl;
  };
  const context = (fn: () => void) => {
    fn();
    return {
      revert: () => {
        gsapSpy.reverts += 1;
      },
    };
  };
  return { setupGsap: () => ({ gsap: { timeline, context }, ScrollTrigger: {} }) };
});

import { HeroDemo, SAMPLE_CASES, STILL_CASE } from '../../src/pages/landing/HeroDemo';

beforeEach(() => {
  gsapSpy.timelines = 0;
  gsapSpy.reverts = 0;
  gsapSpy.plays = 0;
  gsapSpy.pauses = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HeroDemo', () => {
  it('says on screen that it is a sample and not a real result', () => {
    mockMatchMedia({ [REDUCED_MOTION_QUERY]: false });
    render(<HeroDemo />);
    expect(screen.getByText('Sample, illustrative. Not a real result.')).toBeTruthy();
    // The same information is available as text, because the animated panel is hidden from assistive tech.
    const caption = screen.getByText(/three example clients/);
    expect(caption.textContent).toMatch(/Not suitable/);
    expect(caption.textContent).toMatch(/Caution/);
    expect(caption.textContent).toMatch(/Suitable/);
  });

  it('keeps its animated panel out of the accessibility tree', () => {
    mockMatchMedia({ [REDUCED_MOTION_QUERY]: false });
    const { container } = render(<HeroDemo />);
    expect(container.querySelector('[aria-hidden="true"]')?.querySelector('svg')).not.toBeNull();
  });

  it('with reduced motion shows one still frame and builds no animation', () => {
    mockMatchMedia({ [REDUCED_MOTION_QUERY]: true });
    const { container } = render(<HeroDemo />);
    expect(gsapSpy.timelines).toBe(0);
    const still = SAMPLE_CASES[STILL_CASE]!;
    expect(container.textContent).toContain(still.verdict);
    expect(container.textContent).toContain(still.reason);
    expect(container.querySelectorAll('[data-demo-row]')).toHaveLength(3);
  });

  it('builds one timeline, plays it only while on screen, and reverts it on unmount', () => {
    mockMatchMedia({ [REDUCED_MOTION_QUERY]: false });
    const Fake = mockIntersectionObserver();
    const { unmount } = render(<HeroDemo />);
    expect(gsapSpy.timelines).toBe(1);
    // Off screen until the observer says otherwise.
    expect(gsapSpy.plays).toBe(0);
    expect(gsapSpy.pauses).toBeGreaterThan(0);

    act(() => Fake.instances[0]!.trigger(true));
    expect(gsapSpy.plays).toBeGreaterThan(0);

    unmount();
    expect(gsapSpy.reverts).toBe(1);
  });

  it('cleans up fully under React strict mode (mounted, unmounted and mounted again)', () => {
    mockMatchMedia({ [REDUCED_MOTION_QUERY]: false });
    render(
      <StrictMode>
        <HeroDemo />
      </StrictMode>,
    );
    // Every timeline built was either reverted or is the one still live.
    expect(gsapSpy.timelines - gsapSpy.reverts).toBe(1);
  });

  it('uses only fixed example data, with all three verdicts represented', () => {
    expect(SAMPLE_CASES.map((c) => c.verdict)).toEqual(['Not suitable', 'Caution', 'Suitable']);
    expect(STILL_CASE).toBeLessThan(SAMPLE_CASES.length);
  });
});
