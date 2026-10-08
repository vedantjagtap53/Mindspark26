import { useEffect, type RefObject } from 'react';

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

/**
 * How far a tall "track" element has scrolled past the top of the viewport, from 0 to 1, where
 * the track is `trackHeight` tall and a pinned stage of `stageHeight` stays on screen inside it.
 * Pure, so it can be tested without a browser.
 */
export function trackProgress(top: number, trackHeight: number, stageHeight: number): number {
  const travel = trackHeight - stageHeight;
  if (travel <= 0) return 0;
  return clamp01(-top / travel);
}

/**
 * Calls `onProgress` with the progress of `trackRef` as the page scrolls. Scroll events only schedule
 * one animation frame each, so a burst of events costs one measurement. `stageRef` is the pinned
 * element inside the track; without it the viewport height is used.
 */
export function useScrollProgress(
  trackRef: RefObject<HTMLElement | null>,
  onProgress: (progress: number) => void,
  stageRef?: RefObject<HTMLElement | null>,
  enabled = true,
): void {
  useEffect(() => {
    const track = trackRef.current;
    if (!enabled || !track) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = track.getBoundingClientRect();
      const stage = stageRef?.current?.offsetHeight ?? window.innerHeight;
      onProgress(trackProgress(rect.top, rect.height, stage));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [trackRef, stageRef, onProgress, enabled]);
}
