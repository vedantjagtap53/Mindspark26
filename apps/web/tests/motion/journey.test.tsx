// Phase 8: the five-stage journey picks the right form for the device, the pinned form follows the
// scroll through ScrollTrigger, and every form carries the same text.
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_QUERY, PHONE_QUERY, REDUCED_MOTION_QUERY } from '../../src/motion/useMediaQuery';
import { mockMatchMedia } from './helpers';

// ScrollTrigger stand-in: remembers the config so a test can report scroll progress.
const trigger = vi.hoisted(() => ({
  configs: [] as Array<{ onUpdate: (self: { progress: number }) => void }>,
  kills: 0,
}));
vi.mock('../../src/motion/scroll/gsapSetup', () => ({
  setupGsap: () => ({
    gsap: {},
    ScrollTrigger: {
      create: (config: { onUpdate: (self: { progress: number }) => void }) => {
        trigger.configs.push(config);
        return {
          kill: () => {
            trigger.kills += 1;
          },
        };
      },
      refresh: () => {},
    },
  }),
  connectLenis: () => () => {},
}));

import { JourneySection } from '../../src/pages/landing/JourneySection';
import { STAGE_STEPS } from '../../src/pages/landing/content';
import { stepAt } from '../../src/pages/landing/JourneyPinned';

beforeEach(() => {
  trigger.configs = [];
  trigger.kills = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const device = (opts: { phone?: boolean; desktop?: boolean; reduced?: boolean }) =>
  mockMatchMedia({
    [PHONE_QUERY]: opts.phone ?? false,
    [DESKTOP_QUERY]: opts.desktop ?? false,
    [REDUCED_MOTION_QUERY]: opts.reduced ?? false,
  });

describe('stepAt', () => {
  it('maps progress to one of the five stages and never leaves the range', () => {
    expect(stepAt(0)).toBe(0);
    expect(stepAt(0.19)).toBe(0);
    expect(stepAt(0.2)).toBe(1);
    expect(stepAt(0.59)).toBe(2);
    expect(stepAt(0.99)).toBe(4);
    expect(stepAt(1)).toBe(4);
    expect(stepAt(7)).toBe(4);
    expect(stepAt(-3)).toBe(0);
  });
});

describe('the journey picks its form', () => {
  it('is the plain ordered list by default (tablet, no matchMedia)', () => {
    device({});
    render(<JourneySection />);
    const section = screen.getByRole('region', { name: 'The five-stage journey' });
    expect(within(section).getAllByRole('listitem')).toHaveLength(STAGE_STEPS.length);
    expect(trigger.configs).toHaveLength(0);
  });

  it('is the plain list on a desktop when the user prefers reduced motion', () => {
    device({ desktop: true, reduced: true });
    render(<JourneySection />);
    expect(trigger.configs).toHaveLength(0);
    expect(screen.getByRole('region', { name: 'The five-stage journey' })).toBeTruthy();
  });

  it('is a swipe carousel on a phone, with every stage as its own card', async () => {
    device({ phone: true });
    const { container } = render(<JourneySection />);
    await waitFor(() => expect(container.querySelector('.swiper')).not.toBeNull());
    for (let i = 0; i < STAGE_STEPS.length; i++) {
      expect(
        screen.getByRole('article', {
          name: `Stage ${i + 1} of ${STAGE_STEPS.length}: ${STAGE_STEPS[i]!.title}`,
        }),
      ).toBeTruthy();
    }
    expect(trigger.configs).toHaveLength(0);
  });
});

describe('the pinned journey on a desktop', () => {
  beforeEach(() => device({ desktop: true }));

  it('keeps every stage readable and starts on the first', () => {
    render(<JourneySection />);
    const section = screen.getByRole('region', { name: 'The five-stage journey' });
    for (const { title, text } of STAGE_STEPS) {
      // The active stage's title is also shown large in the (assistive-tech-hidden) side panel.
      expect(within(section).getAllByText(title).length).toBeGreaterThan(0);
      expect(within(section).getAllByText(text).length).toBeGreaterThan(0);
    }
    const buttons = within(section).getAllByRole('button');
    expect(buttons).toHaveLength(STAGE_STEPS.length);
    expect(buttons[0]!.getAttribute('aria-current')).toBe('step');
    expect(buttons.filter((b) => b.getAttribute('aria-current') === 'step')).toHaveLength(1);
  });

  it('lights the stage that scroll progress points at, and fills the bar through a CSS variable', () => {
    const { container } = render(<JourneySection />);
    expect(trigger.configs).toHaveLength(1);
    const buttons = screen.getAllByRole('button');

    act(() => trigger.configs[0]!.onUpdate({ progress: 0.5 }));
    expect(buttons[2]!.getAttribute('aria-current')).toBe('step');
    expect(buttons[0]!.getAttribute('aria-current')).toBeNull();
    const stage = container.querySelector<HTMLElement>('.sticky')!;
    expect(stage.style.getPropertyValue('--journey-progress')).toBe('0.5000');

    act(() => trigger.configs[0]!.onUpdate({ progress: 1 }));
    expect(buttons[4]!.getAttribute('aria-current')).toBe('step');
  });

  it('scrolls to a stage when its button is pressed', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    render(<JourneySection />);
    fireEvent.click(screen.getAllByRole('button')[3]!);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('stops tracking the scroll when it leaves the page', () => {
    const { unmount } = render(<JourneySection />);
    expect(trigger.configs).toHaveLength(1);
    unmount();
    expect(trigger.kills).toBe(1);
  });

  it('leaves exactly one live tracker after a React strict-mode remount', () => {
    render(
      <StrictMode>
        <JourneySection />
      </StrictMode>,
    );
    expect(trigger.configs.length - trigger.kills).toBe(1);
  });
});
