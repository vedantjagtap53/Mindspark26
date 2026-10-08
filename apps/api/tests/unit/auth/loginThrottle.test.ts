import { describe, expect, it } from 'vitest';
import {
  MAX_FAILURES,
  WINDOW_MS,
  createLoginThrottle,
} from '../../../src/services/auth/loginThrottle.js';

function setup() {
  const clock = { now: 1_000_000 };
  return { throttle: createLoginThrottle(() => clock.now), clock };
}

describe('login throttle', () => {
  it('allows attempts until the limit, then reports a wait', () => {
    const { throttle } = setup();
    for (let i = 0; i < MAX_FAILURES; i++) {
      expect(throttle.retryAfterSeconds('k')).toBe(0);
      throttle.recordFailure('k');
    }
    expect(throttle.retryAfterSeconds('k')).toBe(WINDOW_MS / 1000);
  });

  it('counts per key', () => {
    const { throttle } = setup();
    for (let i = 0; i < MAX_FAILURES; i++) throttle.recordFailure('a');
    expect(throttle.retryAfterSeconds('a')).toBeGreaterThan(0);
    expect(throttle.retryAfterSeconds('b')).toBe(0);
  });

  it('forgets failures after the window and after a success', () => {
    const { throttle, clock } = setup();
    for (let i = 0; i < MAX_FAILURES; i++) throttle.recordFailure('k');
    clock.now += WINDOW_MS;
    expect(throttle.retryAfterSeconds('k')).toBe(0);

    for (let i = 0; i < MAX_FAILURES; i++) throttle.recordFailure('k');
    throttle.recordSuccess('k');
    expect(throttle.retryAfterSeconds('k')).toBe(0);
  });
});
