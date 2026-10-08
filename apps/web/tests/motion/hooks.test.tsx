import { StrictMode, createRef } from 'react';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionProvider } from '../../src/motion/MotionProvider';
import { useHoverCapable } from '../../src/motion/useHoverCapable';
import { useInView } from '../../src/motion/useInView';
import { HOVER_CAPABLE_QUERY, REDUCED_MOTION_QUERY } from '../../src/motion/useMediaQuery';
import { useReducedMotion } from '../../src/motion/useReducedMotion';
import { trackProgress, useScrollProgress } from '../../src/motion/useScrollProgress';
import { mockIntersectionObserver, mockMatchMedia } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useReducedMotion and useHoverCapable', () => {
  it('read their media queries and follow changes', () => {
    const media = mockMatchMedia({ [REDUCED_MOTION_QUERY]: false, [HOVER_CAPABLE_QUERY]: true });
    const reduced = renderHook(() => useReducedMotion());
    const hover = renderHook(() => useHoverCapable());
    expect(reduced.result.current).toBe(false);
    expect(hover.result.current).toBe(true);

    act(() => media.set(REDUCED_MOTION_QUERY, true));
    act(() => media.set(HOVER_CAPABLE_QUERY, false));
    expect(reduced.result.current).toBe(true);
    expect(hover.result.current).toBe(false);
  });

  it('stop listening when unmounted', () => {
    const media = mockMatchMedia({ [REDUCED_MOTION_QUERY]: false });
    const { unmount } = renderHook(() => useReducedMotion());
    expect(media.listenerCount(REDUCED_MOTION_QUERY)).toBe(1);
    unmount();
    expect(media.listenerCount(REDUCED_MOTION_QUERY)).toBe(0);
  });

  it('are false where matchMedia does not exist, so effects stay on their safe path', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false);
  });
});

describe('useInView', () => {
  const Probe = ({ once = false }: { once?: boolean }) => {
    const [ref, inView] = useInView<HTMLDivElement>({ once });
    return (
      <div ref={ref} data-testid="probe">
        {inView ? 'visible' : 'hidden'}
      </div>
    );
  };

  it('treats the element as visible when IntersectionObserver is missing', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('visible');
  });

  it('follows the observer and disconnects on unmount', () => {
    const Fake = mockIntersectionObserver();
    const { unmount } = render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('hidden');
    const observer = Fake.instances[0]!;
    act(() => observer.trigger(true));
    expect(screen.getByTestId('probe').textContent).toBe('visible');
    act(() => observer.trigger(false));
    expect(screen.getByTestId('probe').textContent).toBe('hidden');
    unmount();
    expect(observer.disconnected).toBe(true);
  });

  it('with once, stays visible after the first sighting and stops observing', () => {
    const Fake = mockIntersectionObserver();
    render(<Probe once />);
    const observer = Fake.instances[0]!;
    act(() => observer.trigger(true));
    expect(observer.disconnected).toBe(true);
    act(() => observer.trigger(false));
    expect(screen.getByTestId('probe').textContent).toBe('visible');
  });
});

describe('trackProgress', () => {
  it('is 0 before the track reaches the top and 1 once it has scrolled through', () => {
    expect(trackProgress(300, 2000, 800)).toBe(0);
    expect(trackProgress(0, 2000, 800)).toBe(0);
    expect(trackProgress(-600, 2000, 800)).toBeCloseTo(0.5);
    expect(trackProgress(-1200, 2000, 800)).toBe(1);
    expect(trackProgress(-5000, 2000, 800)).toBe(1);
  });

  it('is 0 when the track is not taller than the stage (nothing to scroll through)', () => {
    expect(trackProgress(-100, 800, 800)).toBe(0);
    expect(trackProgress(-100, 500, 800)).toBe(0);
  });
});

describe('useScrollProgress', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  it('reports progress on scroll and removes its listeners on unmount', () => {
    const track = document.createElement('div');
    let top = 0;
    track.getBoundingClientRect = () => ({ top, height: 2000 }) as DOMRect;
    const stage = document.createElement('div');
    Object.defineProperty(stage, 'offsetHeight', { value: 800 });
    const trackRef = createRef<HTMLElement>();
    const stageRef = createRef<HTMLElement>();
    (trackRef as { current: HTMLElement | null }).current = track;
    (stageRef as { current: HTMLElement | null }).current = stage;

    const seen: number[] = [];
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() =>
      useScrollProgress(trackRef, (p) => seen.push(p), stageRef),
    );
    expect(seen).toEqual([0]);

    top = -600;
    window.dispatchEvent(new Event('scroll'));
    expect(seen.at(-1)).toBeCloseTo(0.5);

    unmount();
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
    const count = seen.length;
    window.dispatchEvent(new Event('scroll'));
    expect(seen.length).toBe(count);
  });
});

describe('MotionProvider', () => {
  it('renders its children (the animation features load later, off the critical path)', () => {
    render(
      <StrictMode>
        <MotionProvider>
          <p>content</p>
        </MotionProvider>
      </StrictMode>,
    );
    expect(screen.getByText('content')).toBeTruthy();
  });
});
