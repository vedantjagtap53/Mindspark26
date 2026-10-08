// Light-weight motion helpers, safe to import from anywhere in the app. The scroll engine
// (motion/scroll/*) pulls in GSAP and Lenis and is deliberately NOT exported here: only the landing
// page imports it, so the simulator never downloads those libraries.
export * from './tokens';
export {
  useMediaQuery,
  REDUCED_MOTION_QUERY,
  HOVER_CAPABLE_QUERY,
  DESKTOP_QUERY,
  PHONE_QUERY,
} from './useMediaQuery';
export { useReducedMotion } from './useReducedMotion';
export { useHoverCapable } from './useHoverCapable';
export { useInView } from './useInView';
export { useScrollProgress, trackProgress } from './useScrollProgress';
export { MotionProvider } from './MotionProvider';
