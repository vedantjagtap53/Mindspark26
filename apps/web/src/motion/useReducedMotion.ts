import { REDUCED_MOTION_QUERY, useMediaQuery } from './useMediaQuery';

export function useReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY);
}
