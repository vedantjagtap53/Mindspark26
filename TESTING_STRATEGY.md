# TESTING_STRATEGY.md

Financial calculations are tested independently from frontend and AI integrations.

- Unit: ELN, DCD, CPN, risk, suitability, and validation.
- Integration: configure, simulate, suitability, AI boundary, and persistence.
- E2E: Dashboard → product → configuration → client profile → mode → results → suitability → explanation → chat.

AI boundary tests verify AI cannot alter deterministic payoff, risk, or suitability results.

Mode A forecast contract:

- Unit: request schema limits, tenor → trading-days conversion, response validation (lengths, spot anchor, positivity, ordering, staleness, version).
- Unit: forecast client error mapping (`VALIDATION_ERROR`, `AI_UNAVAILABLE`, `AI_INVALID_RESPONSE`) with an injected `fetch`.
- Unit: Mode A case building, American vs European knock-in on paths, distribution metrics.
- Fixtures: `apps/api/tests/fixtures/forecast.ts` builds deterministic forecasts for tests only.
- Contract test (shared with the AI/ML developer): a recorded real response from the forecast service must pass `validateForecastResponse`.
