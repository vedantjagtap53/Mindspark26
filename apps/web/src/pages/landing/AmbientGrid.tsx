// Optional ambient background for the hero: a canvas grid of small "+" marks that breathes and glows
// near the pointer (Phase 10 of docs/ANIMATION_PLAN.md). It is purely decorative and hidden from
// assistive tech. It only draws on a desktop-width screen with a real hover-capable pointer and
// without a reduced-motion preference; everywhere else, and in print, a still dotted pattern made
// of CSS is shown instead. The loop stops while the hero is off screen or the tab is hidden.
import { useEffect, useRef } from 'react';
import { DESKTOP_QUERY, HOVER_CAPABLE_QUERY, useMediaQuery } from '../../motion/useMediaQuery';
import { useInView } from '../../motion/useInView';
import { useReducedMotion } from '../../motion/useReducedMotion';
import { CELL, GLOW_RADIUS, drift, glowAt, glyphAlpha, gridSize, phaseFor } from './ambient';

const GLYPH_ARM = 3; // half the length of one "+" arm, in px
const FALLBACK_COLOUR = '#64748b';

export function AmbientGrid() {
  const reduced = useReducedMotion();
  const hover = useMediaQuery(HOVER_CAPABLE_QUERY);
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const enabled = hover && desktop && !reduced;

  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [observe, inView] = useInView<HTMLCanvasElement>({ initialInView: true });

  useEffect(() => {
    const el = canvas.current;
    if (!enabled || !inView || !el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const host = el.parentElement?.parentElement ?? el;

    let width = 0;
    let height = 0;
    let colour = FALLBACK_COLOUR;
    let pointer: { x: number; y: number } | null = null;
    let frame = 0;
    let raf = 0;
    const start = performance.now();

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      el.width = Math.max(1, Math.round(width * dpr));
      el.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // The theme can change while the page is open, so the colour is re-read now and then.
    const readColour = () => {
      colour =
        getComputedStyle(document.documentElement).getPropertyValue('--ink-muted').trim() || colour;
    };

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      // Every other frame is plenty for something this slow, and halves the work.
      if (frame++ % 2 === 1) return;
      if (frame % 60 === 2) readColour();

      const time = (now - start) / 1000;
      const { cols, rows } = gridSize(width, height);
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.2;
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const { dx, dy } = drift(col, row, time);
          const x = col * CELL + dx;
          const y = row * CELL + dy;
          const glow = pointer ? glowAt(x - pointer.x, y - pointer.y, GLOW_RADIUS) : 0;
          const alpha = glyphAlpha({
            x,
            y,
            width,
            height,
            time,
            phase: phaseFor(row * cols + col),
            glow,
          });
          if (alpha < 0.01) continue;
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.moveTo(x - GLYPH_ARM, y);
          ctx.lineTo(x + GLYPH_ARM, y);
          ctx.moveTo(x, y - GLYPH_ARM);
          ctx.lineTo(x, y + GLYPH_ARM);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    };

    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const onLeave = () => {
      pointer = null;
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      raf = document.hidden ? 0 : requestAnimationFrame(draw);
    };

    resize();
    readColour();
    raf = requestAnimationFrame(draw);

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(host);
    window.addEventListener('resize', resize);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      ctx.clearRect(0, 0, el.width, el.height);
    };
  }, [enabled, inView]);

  return (
    <div aria-hidden className="ambient absolute inset-0 pointer-events-none" data-active={enabled}>
      <div className="ambient-dots absolute inset-0" />
      {enabled && (
        <canvas
          ref={(node) => {
            canvas.current = node;
            observe(node);
          }}
          className="absolute inset-0 w-full h-full"
        />
      )}
    </div>
  );
}
