import { HOVER_CAPABLE_QUERY, useMediaQuery } from './useMediaQuery';

export function useHoverCapable(): boolean {
  return useMediaQuery(HOVER_CAPABLE_QUERY);
}
