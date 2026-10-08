// The desk no longer asks for a client name or age (the RM signs in instead). The contract still
// accepts them, so older callers and stored audit records keep working, and still checks them.
import { describe, expect, it } from 'vitest';
import { suitabilityRequestSchema } from '@mindspark/shared';

const rules = {
  riskAppetite: 'medium',
  horizonMonths: 12,
  lossTolerancePct: 10,
  concentrationPct: 15,
};
const request = (profile: Record<string, unknown>) =>
  suitabilityRequestSchema.safeParse({ simulationId: 'sim-1', profile });

describe('client profile on POST /api/suitability', () => {
  it('accepts the four rule fields alone', () => {
    expect(request(rules).success).toBe(true);
  });

  it('still accepts a name and an age, and checks them when present', () => {
    expect(request({ ...rules, name: 'Asha Rao', age: 52 }).success).toBe(true);
    expect(request({ ...rules, name: 'Asha Rao', age: 17 }).success).toBe(false);
    expect(request({ ...rules, name: '', age: 52 }).success).toBe(false);
    expect(request({ ...rules, age: 52.5 }).success).toBe(false);
  });

  it('still requires every rule field', () => {
    const { horizonMonths: _omitted, ...missing } = rules;
    expect(request(missing).success).toBe(false);
  });
});
