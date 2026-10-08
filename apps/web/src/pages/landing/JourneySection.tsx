import { DESKTOP_QUERY, PHONE_QUERY, useMediaQuery } from '../../motion/useMediaQuery';
import { useReducedMotion } from '../../motion/useReducedMotion';
import { JourneyCarousel } from './JourneyCarousel';
import { JourneyPinned } from './JourneyPinned';
import { JourneySteps } from './JourneySteps';

/**
 * The five-stage journey, in the form that suits the device: a swipe carousel on a phone, a pinned
 * scroll-linked section on a desktop, and the plain ordered list everywhere else, including whenever
 * the user prefers reduced motion. All three carry the same text and the same #journey anchor.
 */
export function JourneySection() {
  const phone = useMediaQuery(PHONE_QUERY);
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const reduced = useReducedMotion();
  if (phone) return <JourneyCarousel />;
  if (desktop && !reduced) return <JourneyPinned />;
  return <JourneySteps />;
}
