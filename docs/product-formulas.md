# Product formulas

Transcribed from `PRD.md` §7.2. Do not infer or alter formulas here; `PRD.md` wins on any conflict.

| Product | Payoff at maturity                           | Notes                                                                                            |
| ------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| ELN     | `N(1 + cT) - 1_KI · N · max(K - S_T, 0) / K` | Knock-in checked at maturity (European) or on daily closes (American). Plain or barrier version. |
| DCD     | `N(1 + cT) · min(1, K / X_T)`                | Expressed in base currency.                                                                      |
| CPN     | `N[p + min(α · max(S_T/S_0 - 1, 0), C)]`     | Cap `C` is optional.                                                                             |

Symbols as used in the PRD: `N` notional / deposit amount, `c` coupon or enhanced rate p.a., `T` tenor, `K` strike, `S_0` initial underlying level, `S_T` / `X_T` terminal underlying / FX level, `1_KI` knock-in indicator, `p` protection %, `α` participation %, `C` cap.

## Inputs

- **Mode A:** run the formula on the low, base and high **case paths** returned by the forecast service (P5 / P50 / P95 of final values; see `docs/forecasting.md`). `S_T` = last value of the path; American knock-in is checked on every daily close of the path, European on the last value only. Output payoff, return and knock-in status for each case.
- **Mode A distribution metrics:** also run the formula on every sample path to get probability of loss, probability of knock-in (ELN) and payoff P5 / P50 / P95. Implemented generically in `apps/api/src/services/simulation/modeAScenarios.ts`; product formulas plug in as functions.
- **Mode B:** single shocked terminal value from the live underlying level (presets such as -10%, 0%, +x%, or a custom %).

## Conventions (decided by Karan, 2026-10-03)

1. **Coupon year fraction:** `T = tenorDays / 365` (calendar days, ACT/365). The forecast's trading-day count (`round(tenorDays × 252 / 365)`) is used only for path length, never for the coupon.
2. **Strike and barrier:** entered as % of `S_0`. `K = strike% × S_0`, `B = barrier% × S_0`.
3. **Barrier inclusivity:** touching counts. Knock-in when the observed level is `≤ B` (European: `S_T ≤ B`; American: any daily close `≤ B`).
4. **DCD base currency:** the deposit currency. `N` and the payoff are in the deposit currency. As the formula `min(1, K / X_T)` implies, `K` and `X_T` are quoted as units of the alternate currency per 1 unit of the deposit currency; conversion happens when `X_T > K`.
5. **American barrier in Mode B:** Mode B has only the shocked terminal value, so knock-in is `S_shocked ≤ B`. This is the same test as European. Mode A still checks every daily close of the path.

ELN plain version (no barrier): `1_KI = 1` whenever `S_T < K`. The loss term is zero at `S_T = K`, so the inclusivity choice does not change the payoff.

## Open questions (not specified by the PRD)

- CPN: confirm `C` caps the participation return (as written), and no cap when absent.

## Engines and worked examples (2026-10-03)

Engines live in `apps/api/src/engines/payoff/{eln,dcd,cpn}`. They are pure functions with no I/O. Percent fields are converted to fractions exactly once. Boundary tests (S_T = K, S_T = B, X_T = K) count values within a relative 1e-9 as equal, so a level computed as `pct × S_0 / 100` is not missed by floating-point rounding. Intermediate values are not rounded.

The worked examples from the product notes (`ELN_DCD_CPN_Notes.pdf`) are tests in `apps/api/tests/unit/payoff/`. Conflicts between the notes and this document:

- **European barrier:** the notes use `S_T < B`. The settled convention is `S_T ≤ B` (touching counts), and the engine follows the convention.
- **Plain ELN at −10% (S_T = 22,500):** the notes' plain-ELN table lists ₹11,00,000, which contradicts their own plain formula and PRD §7.2. The formula gives ₹9,00,000 principal + ₹1,00,000 coupon = ₹10,00,000, and the engine follows the formula. The same row in the barrier table (₹11,00,000, no knock-in) is correct.
- **DCD example tenor:** the notes use T = 1/12 for one month. With T = tenorDays / 365, no whole number of days gives exactly 1/12, so the notes' figures are tested on the formula with T = 1/12 passed in directly.
