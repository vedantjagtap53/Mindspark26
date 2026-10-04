---
product: ELN
doc_type: product_note
title: Equity-Linked Note (reverse convertible)
---
# ELN (reverse convertible)

## What it is
An ELN of the kind relationship managers sell is usually a reverse convertible. The client earns an above-market coupon in exchange for effectively selling a put on the underlying. There are two versions: plain (no barrier) and barrier (knock-in).

## Notation
N is the notional (amount invested). S0 is the underlying level at start. S_T is the level at maturity. K is the strike (usually 100% of S0, sometimes 90-95%). B is the knock-in barrier (for example 70-80% of S0). c is the annualized coupon. T is the tenor in years.

## Plain reverse convertible (no barrier)
The coupon is paid regardless. Principal is returned in full only if the underlying finishes at or above the strike. Otherwise the client gets back the equivalent of N/K units of the underlying (physically or cash-settled).

Payoff = N(1 + cT) - N * max(K - S_T, 0) / K

Equivalently: if S_T >= K, payoff = N(1 + cT). If S_T < K, payoff = N * (S_T / K) + N * c * T.

## Barrier (knock-in) ELN
The downside only switches on if the barrier is breached.

Payoff = N(1 + cT) - 1_KI * N * max(K - S_T, 0) / K

1_KI = 1 if knocked in. For a European barrier, knock-in means S_T < B (checked only at maturity). For an American (continuous) barrier, knock-in means the underlying closed below B on any day during the life (usually daily closes). An American barrier is therefore easier to breach than a European one.

## Worked example (Nifty 50)
N = Rs 10,00,000, S0 = 25,000, K = 100%, B = 80% (20,000), c = 10% p.a., T = 1 year, European barrier.

| Scenario | S_T | Knocked in? | Payoff | Return |
|---|---|---|---|---|
| +15% | 28,750 | No | Rs 11,00,000 | +10% (capped) |
| Sideways 0% | 25,000 | No | Rs 11,00,000 | +10% |
| -10% | 22,500 | No | Rs 11,00,000 | +10% |
| -25% | 18,750 | Yes | Rs 7,50,000 + Rs 1,00,000 = Rs 8,50,000 | -15% |
| -50% | 12,500 | Yes | Rs 5,00,000 + Rs 1,00,000 = Rs 6,00,000 | -40% |

## The barrier cliff
There is a sharp jump at the barrier. In the example above, a fall of 19% still gives +10%, but a fall of 21% gives about -11%. This discontinuity should always be highlighted when explaining a barrier ELN.

## Key risks
The ELN has capped upside (the gain is limited to the coupon) and a large downside if the underlying falls. With a barrier, crossing it turns a small fall into a loss of principal, and the client may receive the underlying instead of cash.
