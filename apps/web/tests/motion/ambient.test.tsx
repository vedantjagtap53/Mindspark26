// Phase 10: the optional ambient background. The maths is tested on its own; the component is tested
// for when it draws (desktop, real pointer, no reduced motion), when it stops, and what it shows instead.
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DESKTOP_QUERY,
  HOVER_CAPABLE_QUERY,
  REDUCED_MOTION_QUERY,
} from '../../src/motion/useMediaQuery';
import {
  CELL,
  GLOW_RADIUS,
  MAX_ALPHA,
  breath,
  drift,
  edgeMask,
  glowAt,
  glyphAlpha,
  gridSize,
  phaseFor,
  smoothstep,
} from '../../src/pages/landing/ambient';
import { AmbientGrid } from '../../src/pages/landing/AmbientGrid';
import { mockIntersectionObserver, mockMatchMedia } from './helpers';

describe('ambient maths', () => {
  it('smoothstep clamps and eases', () => {
    expect(smoothstep(0, 1, -5)).toBe(0);
    expect(smoothstep(0, 1, 5)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
  });

  it('keeps the middle quiet and the edges lit, so the headline stays readable', () => {
    const w = 1200;
    const h = 700;
    expect(edgeMask(w / 2, h / 2, w, h)).toBe(0);
    expect(edgeMask(w / 2 + 100, h / 2 - 60, w, h)).toBe(0);
    expect(edgeMask(0, 0, w, h)).toBe(1);
    expect(edgeMask(w, h / 2, w, h)).toBe(1);
    // Moving outward never makes it dimmer.
    let last = 0;
    for (let x = w / 2; x <= w; x += 50) {
      const m = edgeMask(x, h / 2, w, h);
      expect(m).toBeGreaterThanOrEqual(last);
      last = m;
    }
  });

  it('glows brightest at the pointer and not at all beyond the radius', () => {
    expect(glowAt(0, 0)).toBe(1);
    expect(glowAt(GLOW_RADIUS, 0)).toBe(0);
    expect(glowAt(GLOW_RADIUS * 2, 50)).toBe(0);
    expect(glowAt(GLOW_RADIUS / 2, 0)).toBeGreaterThan(0);
    expect(glowAt(GLOW_RADIUS / 2, 0)).toBeLessThan(1);
  });

  it('never exceeds its maximum opacity, and is invisible behind the text with no glow', () => {
    const base = { width: 1200, height: 700, time: 3, phase: 1 };
    expect(glyphAlpha({ ...base, x: 600, y: 350, glow: 0 })).toBe(0);
    for (const [x, y, glow] of [
      [0, 0, 1],
      [600, 350, 1],
      [1200, 700, 1],
      [30, 30, 0],
    ] as const) {
      const a = glyphAlpha({ ...base, x, y, glow });
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(MAX_ALPHA);
    }
    // Glow lights a glyph even where the base is quiet.
    expect(glyphAlpha({ ...base, x: 600, y: 350, glow: 1 })).toBeGreaterThan(0.3);
  });

  it('breathes within bounds and drifts only a few pixels', () => {
    for (let t = 0; t < 20; t += 0.7) {
      const b = breath(t, 2);
      expect(b).toBeGreaterThanOrEqual(0.2 - 1e-9);
      expect(b).toBeLessThanOrEqual(1 + 1e-9);
      const { dx, dy } = drift(5, 9, t);
      expect(Math.abs(dx)).toBeLessThanOrEqual(1.4);
      expect(Math.abs(dy)).toBeLessThanOrEqual(2.2);
    }
  });

  it('sizes the grid to cover the area and gives each glyph a stable phase', () => {
    expect(gridSize(280, 140)).toEqual({ cols: 280 / CELL + 1, rows: 140 / CELL + 1 });
    expect(gridSize(281, 141)).toEqual({
      cols: Math.ceil(281 / CELL) + 1,
      rows: Math.ceil(141 / CELL) + 1,
    });
    expect(phaseFor(7)).toBe(phaseFor(7));
    expect(phaseFor(7)).not.toBe(phaseFor(8));
    for (let i = 0; i < 50; i++) {
      expect(phaseFor(i)).toBeGreaterThanOrEqual(0);
      expect(phaseFor(i)).toBeLessThan(Math.PI * 2);
    }
  });
});

// A canvas context that records what the component draws, and a frame loop the test steps by hand.
const frames = vi.hoisted(() => ({ queue: [] as FrameRequestCallback[], cancelled: 0 }));
const drawn = vi.hoisted(() => ({ strokes: 0, alphas: [] as number[], cleared: 0 }));

const fakeContext = () => {
  let alpha = 1;
  return {
    setTransform: () => {},
    clearRect: () => {
      drawn.cleared += 1;
    },
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {
      drawn.strokes += 1;
      drawn.alphas.push(alpha);
    },
    set globalAlpha(v: number) {
      alpha = v;
    },
    get globalAlpha() {
      return alpha;
    },
    strokeStyle: '',
    lineWidth: 1,
  };
};

const runFrame = (time = 1000) => {
  const cb = frames.queue.shift();
  act(() => cb?.(time));
};

beforeEach(() => {
  frames.queue = [];
  frames.cancelled = 0;
  drawn.strokes = 0;
  drawn.alphas = [];
  drawn.cleared = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.queue.push(cb);
    return frames.queue.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames.cancelled += 1;
    frames.queue = [];
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => fakeContext() as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 1200,
    height: 700,
    right: 1200,
    bottom: 700,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const device = (opts: { hover?: boolean; desktop?: boolean; reduced?: boolean }) =>
  mockMatchMedia({
    [HOVER_CAPABLE_QUERY]: opts.hover ?? true,
    [DESKTOP_QUERY]: opts.desktop ?? true,
    [REDUCED_MOTION_QUERY]: opts.reduced ?? false,
  });

describe('AmbientGrid', () => {
  it('draws on a desktop with a real pointer, and hides the still pattern', () => {
    device({});
    const { container } = render(<AmbientGrid />);
    const root = container.firstElementChild!;
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.getAttribute('data-active')).toBe('true');
    expect(container.querySelector('canvas')).not.toBeNull();

    runFrame();
    expect(drawn.strokes).toBeGreaterThan(0);
  });

  it.each([
    ['a touch screen', { hover: false }],
    ['a phone or tablet width', { desktop: false }],
    ['reduced motion', { reduced: true }],
  ])('draws nothing and shows the still dotted pattern on %s', (_name, opts) => {
    device(opts);
    const { container } = render(<AmbientGrid />);
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.firstElementChild!.getAttribute('data-active')).toBe('false');
    expect(container.querySelector('.ambient-dots')).not.toBeNull();
    expect(frames.queue).toHaveLength(0);
  });

  it('draws nothing where canvas is unavailable, without throwing', () => {
    device({});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    expect(() => render(<AmbientGrid />)).not.toThrow();
    expect(frames.queue).toHaveLength(0);
  });

  it('stops its loop and clears the canvas when the hero scrolls out of view, and resumes on return', () => {
    device({});
    const Fake = mockIntersectionObserver();
    render(<AmbientGrid />);
    const observer = Fake.instances[0]!;
    expect(frames.queue.length).toBe(1);

    act(() => observer.trigger(false));
    expect(frames.cancelled).toBeGreaterThan(0);
    expect(frames.queue).toHaveLength(0);
    expect(drawn.cleared).toBeGreaterThan(0);

    act(() => Fake.instances.at(-1)!.trigger(true));
    expect(frames.queue.length).toBe(1);
  });

  it('stops its loop when it unmounts', () => {
    device({});
    const { unmount } = render(<AmbientGrid />);
    expect(frames.queue.length).toBe(1);
    unmount();
    expect(frames.cancelled).toBeGreaterThan(0);
    expect(frames.queue).toHaveLength(0);
  });

  it('lights glyphs near the pointer more than the rest', () => {
    device({});
    const { container } = render(<AmbientGrid />);
    const host = container.firstElementChild!.parentElement ?? document.body;

    runFrame(1000);
    const without = Math.max(...drawn.alphas, 0);

    drawn.alphas = [];
    // Pointer over the quiet middle of the hero, where the base alpha is 0.
    act(() => {
      host.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 600, clientY: 350, bubbles: true }),
      );
    });
    runFrame(2000); // skipped frame (every other frame draws)
    runFrame(3000);
    const withPointer = Math.max(...drawn.alphas, 0);

    expect(withPointer).toBeGreaterThan(without);
    expect(withPointer).toBeLessThanOrEqual(MAX_ALPHA);
  });
});
