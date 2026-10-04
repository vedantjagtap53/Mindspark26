# Suitability rules

Transcribed from `PRD.md` §7.2. Suitability rules are deterministic and must not be delegated to an LLM.

Verdict: **Suitable**, **Caution**, or **Not suitable**, always with explicit reasons.

Inputs: product risk metrics from the payoff and risk engine, plus the client profile (risk appetite, investment horizon, loss tolerance, concentration).

## Example rules from the PRD

1. Low-case loss above the client's loss tolerance.
2. ELN only: barrier knocked in in the low case (or base case).
3. Tenor longer than investment horizon.
4. Product exposure above the concentration limit.
5. Product risk level above the client's risk appetite. Each product type has a fixed risk rating, for example CPN lower, ELN and DCD higher.

## Decisions (Karan, 2026-10-03)

- **Verdict mapping:** any hard flag gives **Not suitable**. Otherwise, any other flag gives **Caution**. No flags gives **Suitable**. Every raised flag is listed as a reason, whatever the verdict.
- **Product risk ratings (fixed):** CPN **Low**, DCD **High**, ELN **High**.
- **Saved client profiles:** client profiles are persisted and served by `/api/client-profiles` (see `API_SPEC.md`).

## Decisions (Karan, 2026-10-04) — implemented in `apps/api/src/engines/suitability/`

| Rule | Flag | Severity |
| --- | --- | --- |
| Low-case loss above loss tolerance | `low_case_loss` | **Hard** (Not suitable) |
| ELN barrier knocked in in the low or base case | `barrier_knock_in` | Caution |
| Tenor longer than the horizon (`horizonMonths × 365/12` days) | `tenor_vs_horizon` | Caution |
| Concentration above the limit (fixed, default 25%, `SUITABILITY_CONCENTRATION_LIMIT_PCT`) | `concentration` | Caution |
| High-risk product (ELN, DCD) for a **low** risk appetite | `risk_vs_appetite` | **Hard** |
| High-risk product for a **medium** risk appetite | `risk_vs_appetite` | Caution |

- Risk-appetite scale: `low`, `medium`, `high`. CPN (Low risk) never raises the risk flag.
- Units: loss tolerance and concentration are percent; loss tolerance is relative to the amount invested; horizon is in months.
- Low case: Mode A, the P5 case path; **Mode B, the worst outcome among the scenario shocks (−25%, −10%, 0%, +15%) and the RM's own shock**. Base case: Mode A P50 path; Mode B the RM's shock.
- Mode A probabilities of loss and knock-in are shown, not used by a rule.

## Open questions (not specified by the PRD)

- Which of the rules above are **hard** flags. The mapping is decided, but this classification is still open.
- Whether this list is complete (the PRD calls them "example rules").
- Allowed risk-appetite values (scale), and how they compare with the Low / High product ratings.
- The concentration limit value (fixed, or per client?).
- What counts as the "low case" in Mode B. (Mode A is resolved: the P5 case path, PRD §7.2.)
- Whether Mode A probability of loss / knock-in should drive a rule, or only be displayed. The PRD currently displays them only.
- Units for loss tolerance (% of notional?) and investment horizon.
