import { StrictMode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REDUCED_MOTION_QUERY } from '../../src/motion/useMediaQuery';
import { mockMatchMedia } from './helpers';

// Lenis needs a real layout engine; the double records how it is created and destroyed.
const lenis = vi.hoisted(() => ({ created: 0, destroyed: 0 }));
vi.mock('lenis', () => ({
  default: class FakeLenis {
    constructor() {
      lenis.created += 1;
    }
    on() {
      return () => {};
    }
    raf() {}
    destroy() {
      lenis.destroyed += 1;
    }
  },
}));

import { LenisProvider } from '../../src/motion/scroll/LenisProvider';

const withResizeObserver = () =>
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );

beforeEach(() => {
  lenis.created = 0;
  lenis.destroyed = 0;
  withResizeObserver();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('LenisProvider', () => {
  it('creates one smooth-scroll instance and destroys it on unmount', () => {
    mockMatchMedia({ [REDUCED_MOTION_QUERY]: false });
    const { unmount } = render(
      <LenisProvider>
        <p>landing</p>
      </LenisProvider>,
    );
    expect(screen.getByText('landing')).toBeTruthy();
    expect(lenis.created).toBe(1);
    expect(lenis.destroyed).toBe(0);
    unmount();
    expect(lenis.destroyed).toBe(1);
  });

  it('leaves exactly one live instance after a React strict-mode remount', () => {
    mockMatchMedia({ [REDUCED_MOTION_QUERY]: false });
    render(
      <StrictMode>
        <LenisProvider>
          <p>landing</p>
        </LenisProvider>
      </StrictMode>,
    );
    expect(lenis.created - lenis.destroyed).toBe(1);
  });

  it('leaves scrolling native where ResizeObserver is missing', () => {
    mockMatchMedia({ [REDUCED_MOTION_QUERY]: false });
    vi.stubGlobal('ResizeObserver', undefined);
    render(
      <LenisProvider>
        <p>landing</p>
      </LenisProvider>,
    );
    expect(screen.getByText('landing')).toBeTruthy();
    expect(lenis.created).toBe(0);
  });

  it('does not create Lenis at all when the user prefers reduced motion', () => {
    mockMatchMedia({ [REDUCED_MOTION_QUERY]: true });
    render(
      <LenisProvider>
        <p>landing</p>
      </LenisProvider>,
    );
    expect(screen.getByText('landing')).toBeTruthy();
    expect(lenis.created).toBe(0);
  });
});
