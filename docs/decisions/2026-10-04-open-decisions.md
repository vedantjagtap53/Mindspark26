# Open decisions and credentials (2026-10-04)

Review done while completing the MVP. `PRD.md` is the source of truth. Nothing below changes a formula, rule or policy; each item needs the owner's approval.

## Credentials and deployment needed

| Item                     | What is needed                                                                                                                                                                                                                                                                                   | Where it goes                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Firebase SQL Connect     | A Firebase project with SQL Connect and a Cloud SQL (PostgreSQL) instance; the real `serviceId`, `location`, instance id and database name (the current values in `dataconnect/dataconnect.yaml` are placeholders); then `firebase deploy --only dataconnect` to apply the schema and connector. | `dataconnect/dataconnect.yaml`; `.env`: `FIREBASE_PROJECT_ID`, `FIREBASE_SQL_CONNECT_SERVICE_ID`, `FIREBASE_SQL_CONNECT_LOCATION` |
| API database credentials | A service account allowed to execute SQL Connect operations (or Application Default Credentials on the host).                                                                                                                                                                                    | `.env`: `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`                                                                           |
| Explanation and chat     | `GOOGLE_API_KEY` for the RAG service (not yet tested with a real key).                                                                                                                                                                                                                           | `services/rag/.env`                                                                                                               |
| Live level (optional)    | `FINNHUB_API_KEY` (US stocks/crypto only) or `UPSTOX_ACCESS_TOKEN` (Nifty 50). The RM can always type the level.                                                                                                                                                                                 | `.env`                                                                                                                            |

The persistence code is verified against the SQL Connect emulator (contract suite, app-level flow and browser test); only the cloud deployment is missing.

## Decisions needed

1. **Market data provider (Yahoo Finance).** Chosen for the forecast refresh job and the fan-chart history because it is free and needs no key (`docs/market-data.md`). It is unofficial: no SLA, and Yahoo's terms restrict redistribution. Approve its use for this tool, or name a licensed provider. The history provider is off by default (`MARKET_HISTORY_PROVIDER=none`). Neither source could be called from the build sandbox (outbound access to market-data hosts is blocked), so run `python -m forecast_service.refresh --dry-run` once before scheduling the job. The CSV ends on 2026-10-01, so Mode A returns `DATA_STALE` from 2026-10-07 until the job runs.

2. **DCD Mode A FX symbol (AI/ML developer).** The backend and frontend are done. The backend asks the forecast service for `{ symbol: "USDINR", assetClass: "fx" }`: deposit then alternate currency, quoted as alternate units per deposit unit, the same quote as the DCD strike. The forecast service supports only `^NSEI` today, so it answers `UNSUPPORTED_UNDERLYING` and the RM sees `AI_UNAVAILABLE`. Needed from the forecast owner: agree the symbol convention, add FX training data and support. Frankfurter (ECB reference rates, free, already used for the Mode B DCD level) has daily history and is one candidate source. `docs/forecasting.md` was not changed.

3. **CPN cap.** The PRD formula `N[p + min(α · max(S_T/S_0 − 1, 0), C)]` is explicit: `C` caps the participation return (α × upside) as a fraction of notional, so the maximum payoff is `N(p + C)`, and there is no cap when it is absent. The engine implements exactly this. Recommendation: close the question as "PRD formula stands". Raise it again only if the desk means a cap on the underlying's performance before participation, a different product.

4. **ELN product notes vs formula.** In the notes' plain-ELN table, the −10% row (S_T = 22,500) shows ₹11,00,000. The PRD formula gives ₹10,00,000 (₹9,00,000 principal + ₹1,00,000 coupon), and the engine follows the formula. PRD §9 also asks payoffs to match the notes' worked examples, and both cannot hold for this row. Confirm the notes' row is a typo (the barrier table's identical row, ₹11,00,000 with no knock-in, is correct).

5. **Input limits.** The PRD fixes only tenor (30–1,095 days), positive notional and barrier below strike. Today's API enforces those plus sanity checks: strike > 0, coupon ≥ 0, participation > 0, cap > 0, protection 0–100, shock > −100, horizon 1–600 months, percentages 0–100. There are no upper limits on notional, strike, coupon, participation or cap. The profile form's horizon slider stops at 60 months, while the API allows 600. Decide whether to add upper limits, and their values; none were invented.

6. **Suspicious Nifty rows.** 2016-10-27, 2017-03-31 and 2024-05-08 each close exactly at the previous close. Each row has its own open, high, low, volume and turnover, with the close inside the day's range. No row has O=H=L=C, no row duplicates another, and there are no gaps over 5 days. They look like genuine equal closes, not stale fills, and the effect on the model is negligible (3 zero returns in about 2,480). Recommendation: keep them, after a check against NSE's official historical data (not reachable from the sandbox).

7. **Backtest refresh.** `services/forecast/data/backtest_results.json` predates model 1.0.1 (the variance fix). It was re-run with the same settings and the current model; the results were not written over the published file, which is the AI/ML developer's artefact. Approve replacing it. Results (90% band coverage; PRD §9 target 80–95% at 3, 6 and 12 months):

   | Horizon (days) | Coverage, published | Coverage, re-run | Base MAPE | Naive MAPE |
   | -------------- | ------------------- | ---------------- | --------- | ---------- |
   | 7              | 0.855               | 0.855            | 1.86%     | 1.87%      |
   | 14             | 0.904               | 0.916            | 2.51%     | 2.54%      |
   | 30             | 0.927               | 0.927            | 3.6%      | 3.67%      |
   | 45             | 0.878               | 0.878            | 4.76%     | 4.9%       |
   | 60             | 0.840               | 0.840            | 5.37%     | 5.6%       |
   | 90             | 0.875               | 0.875            | 6.88%     | 7.08%      |
   | 120            | 0.848               | 0.848            | 7.9%      | 8.5%       |
   | 180            | 0.870               | 0.870            | 9.38%     | 10.09%     |
   | 270            | 0.865               | 0.878            | 9.77%     | 11.21%     |
   | 365            | 0.873               | 0.873            | 10.15%    | 12.92%     |
   | 545            | 0.892               | 0.892            | 12.21%    | 18.12%     |
   | 730            | 0.932               | 0.932            | 14.02%    | 22.87%     |
   | 1095           | 0.936               | 0.957            | 15.63%    | 32.41%     |

   The fix barely changes the results (coverage moves at 14, 270 and 1,095 days only). The PRD §9 horizons pass: 90 days 0.875, 180 days 0.870, 365 days 0.873. At 1,095 days coverage is 0.957, above 95%, but that horizon is outside the §9 criterion and rests on very few independent windows. The caveat that the drift was chosen after earlier results were seen still applies. Full re-run: `docs/decisions/backtest-rerun-2026-10-04.json` (same settings as the published file: expanding window, origins every 21 trading days, 3,000 paths, drift 0.03%/day).

8. **Suitability policy text.** `services/rag/rag/knowledge/policy/suitability_policy.md` is a DRAFT (RAG knowledge, AI/ML developer). It agrees with the engine but omits the following: which flags are hard (low-case loss; a high-risk product for a low appetite), that a medium appetite gives Caution for ELN/DCD, the 25% concentration limit, and the Mode B low case (worst of the −25/−10/0/+15% scenarios and the RM's shock). The institution's actual policy text is needed before production, and whether the rule list is complete is still open.

9. **Smaller items.**
   - `/api/suitability` now accepts an optional `profileId`, and its response has `persisted`. `CONFLICT` (409) was added for duplicate client references. All three are additive.
   - The ad hoc (unsaved) profile snapshot is stored with `clientRef: "unsaved"`.
   - A database outage returns `DATABASE_ERROR` with HTTP 500 (the existing mapping); 503 may suit an outage better.
   - Root `Frontend/` and `ML/` look like pre-workspace copies of `apps/web` and `services/forecast`. They are now excluded from lint; delete them if no longer needed.
   - `npm audit`: 2 moderate issues via firebase-admin (unchanged).
