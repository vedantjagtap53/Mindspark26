/**
 * @license
 * Payoff Desk — Structured Products Suitability Simulator
 * High-Precision Enterprise Custom Cursor with Dynamic Theme Coordination
 */

import React, { useEffect, useState, useRef } from 'react';

export const CustomCursor: React.FC = () => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const cursorRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  const targetPos = useRef({ x: -100, y: -100 });
  const currentPos = useRef({ x: -100, y: -100 });

  useEffect(() => {
    const isFinePointer = window.matchMedia('(pointer: fine)').matches;
    if (!isFinePointer) return;

    setIsVisible(true);

    const handleMouseMove = (e: MouseEvent) => {
      targetPos.current = { x: e.clientX, y: e.clientY };

      const target = e.target as HTMLElement | null;
      if (target) {
        const isClickable =
          target.tagName === 'BUTTON' ||
          target.tagName === 'A' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'LABEL' ||
          target.getAttribute('role') === 'button' ||
          target.getAttribute('role') === 'tab' ||
          target.closest('button') !== null ||
          target.closest('a') !== null ||
          target.closest('select') !== null ||
          target.closest('label') !== null ||
          target.closest('input') !== null ||
          target.closest('tr') !== null ||
          target.closest('.cursor-pointer') !== null;

        setIsHovered(Boolean(isClickable));
      }
    };

    const handleMouseDown = () => setIsPointerDown(true);
    const handleMouseUp = () => setIsPointerDown(false);
    const handleMouseLeave = () => setIsVisible(false);
    const handleMouseEnter = () => setIsVisible(true);

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseenter', handleMouseEnter);

    let animationFrameId: number;
    const updateCursor = () => {
      const lerp = 0.25;
      currentPos.current.x += (targetPos.current.x - currentPos.current.x) * lerp;
      currentPos.current.y += (targetPos.current.y - currentPos.current.y) * lerp;

      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${currentPos.current.x}px, ${currentPos.current.y}px, 0) translate(-50%, -50%)`;
      }
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate3d(${targetPos.current.x}px, ${targetPos.current.y}px, 0) translate(-50%, -50%)`;
      }

      animationFrameId = requestAnimationFrame(updateCursor);
    };

    animationFrameId = requestAnimationFrame(updateCursor);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <>
      {/* Outer Clay Dynamic Target Ring */}
      <div
        ref={ringRef}
        aria-hidden="true"
        className={`fixed top-0 left-0 pointer-events-none z-[99999] rounded-full transition-[width,height,opacity,border-color,background-color] duration-150 ease-out will-change-transform ${
          isHovered
            ? 'w-10 h-10 border-[1.5px] border-[var(--ink-primary)] bg-[var(--border-color)] opacity-100 shadow-[0_0_16px_rgba(0,0,0,0.2),inset_0_1px_2px_rgba(255,255,255,0.7)]'
            : isPointerDown
            ? 'w-6 h-6 border border-[var(--ink-primary)] bg-[var(--border-color)] opacity-90'
            : 'w-7 h-7 border border-[var(--border-strong)] bg-white/30 opacity-80 shadow-[0_2px_6px_rgba(0,0,0,0.1),inset_0_1px_1px_rgba(255,255,255,0.8)]'
        }`}
      />

      {/* Inner Precision Focal Dot */}
      <div
        ref={cursorRef}
        aria-hidden="true"
        className={`fixed top-0 left-0 pointer-events-none z-[99999] rounded-full transition-[width,height,background-color] duration-75 ease-out will-change-transform ${
          isHovered
            ? 'w-2 h-2 bg-[var(--ink-primary)] shadow-[0_0_8px_var(--ink-primary)]'
            : isPointerDown
            ? 'w-2.5 h-2.5 bg-[var(--ink-primary)]'
            : 'w-1.5 h-1.5 bg-[var(--ink-secondary)]'
        }`}
      />
    </>
  );
};
