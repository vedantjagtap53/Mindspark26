// Precision cursor for mouse users. index.css hides the system cursor on fine pointers, so this
// must stay mounted. With reduced motion the ring follows the pointer without easing.
import { useEffect, useRef, useState } from 'react';

const isFinePointer = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: fine)').matches;

const CLICKABLE =
  'button, a, select, input, textarea, label, tr, [role="button"], [role="radio"], [role="tab"]';

export function CustomCursor() {
  const [enabled] = useState(isFinePointer);
  const [visible, setVisible] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lerp = reduced ? 1 : 0.25;
    const target = { x: -100, y: -100 };
    const current = { x: -100, y: -100 };

    const onMove = (e: MouseEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
      const el = e.target instanceof Element ? e.target : null;
      setHovered(el?.closest(CLICKABLE) != null);
    };
    const onDown = () => setPressed(true);
    const onUp = () => setPressed(false);
    const onLeave = () => setVisible(false);
    const onEnter = () => setVisible(true);

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseenter', onEnter);

    let frame = 0;
    const tick = () => {
      current.x += (target.x - current.x) * lerp;
      current.y += (target.y - current.y) * lerp;
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${current.x}px, ${current.y}px, 0) translate(-50%, -50%)`;
      }
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${target.x}px, ${target.y}px, 0) translate(-50%, -50%)`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
    };
  }, [enabled]);

  if (!enabled || !visible) return null;

  return (
    <>
      <div
        ref={ringRef}
        aria-hidden="true"
        className={`no-print fixed top-0 left-0 pointer-events-none z-[99999] rounded-full transition-[width,height,opacity,border-color,background-color] duration-150 ease-out will-change-transform ${
          hovered
            ? 'w-10 h-10 border-[1.5px] border-[var(--ink-primary)] bg-[var(--border-color)] opacity-100'
            : pressed
              ? 'w-6 h-6 border border-[var(--ink-primary)] bg-[var(--border-color)] opacity-90'
              : 'w-7 h-7 border border-[var(--border-strong)] bg-white/30 opacity-80'
        }`}
      />
      <div
        ref={dotRef}
        aria-hidden="true"
        className={`no-print fixed top-0 left-0 pointer-events-none z-[99999] rounded-full transition-[width,height,background-color] duration-75 ease-out will-change-transform ${
          hovered || pressed
            ? 'w-2 h-2 bg-[var(--ink-primary)]'
            : 'w-1.5 h-1.5 bg-[var(--ink-secondary)]'
        }`}
      />
    </>
  );
}
