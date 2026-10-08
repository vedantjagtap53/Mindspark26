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
- **Client details:** the RM enters the client's suitability inputs for each run (decided 2026-10-04: no saved profiles). Since 2026-10-08 no client name or age is asked; the API still accepts them as optional, **display-only** fields: no rule reads them, so the verdict is identical whatever they are; if sent they are stored with the audit record and never sent to the AI service.

## Decisions (Karan, 2026-10-04) — implemented in `apps/api/src/engines/suitability/`

| Rule                                                                                      | Flag               | Severity                |
| ----------------------------------------------------------------------------------------- | ------------------ | ----------------------- |
| Low-case loss above loss tolerance                                                        | `low_case_loss`    | **Hard** (Not suitable) |
| ELN barrier knocked in in the low or base case                                            | `barrier_knock_in` | Caution                 |
| Tenor longer than the horizon (`horizonMonths × 365/12` days)                             | `tenor_vs_horizon` | Caution                 |
| Concentration above the limit (fixed, default 25%, `SUITABILITY_CONCENTRATION_LIMIT_PCT`) | `concentration`    | Caution                 |
| High-risk product (ELN, DCD) for a **low** risk appetite                                  | `risk_vs_appetite` | **Hard**                |
| High-risk product for a **medium** risk appetite                                          | `risk_vs_appetite` | Caution                 |

- Risk-appetite scale: `low`, `medium`, `high`. CPN (Low risk) never raises the risk flag.
- Units: loss tolerance and concentration are percent; loss tolerance is relative to the amount invested; horizon is in months.
- Low case: Mode A, the P5 case path; **Mode B, the worst outcome among the scenario shocks (−25%, −10%, 0%, +15%) and the RM's own shock**. Base case: Mode A P50 path; Mode B the RM's shock.
- Mode A probabilities of loss and knock-in are shown, not used by a rule.

## Open questions (reviewed 2026-10-04)

Resolved by the 2026-10-04 decisions above: hard-flag classification, risk-appetite scale and comparison, concentration limit (fixed 25%, configurable), Mode B low case, units, and Mode A probabilities (displayed only, PRD §7.1).

Still open:

- Whether this rule list is complete (the PRD calls them "example rules").
- The RAG policy text (`services/rag/rag/knowledge/policy/suitability_policy.md`) is a DRAFT written from the PRD and must be replaced by the institution's policy before production. Gaps against the engine: it does not say which flags are hard (low-case loss; high-risk product for a low appetite), that a medium appetite gives Caution for ELN/DCD, the 25% concentration limit, or how the Mode B low case is chosen. See `docs/decisions/2026-10-04-open-decisions.md`.
