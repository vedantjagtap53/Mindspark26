---
product: DCD
doc_type: product_note
title: Dual Currency Deposit
---
# DCD (Dual Currency Deposit)

## What it is
A short-term deposit (typically 1 week to 3 months) that pays a much higher interest rate than a normal deposit. In exchange, the bank gets the right to repay the client in a second, alternate currency at a pre-agreed conversion rate (the strike) if that currency weakens. In effect, the client sells a currency option to the bank, and the extra interest is the option premium.

## Notation
N is the deposit in base currency (for example USD). c is the enhanced annual rate. T is the tenor in years. K is the strike rate. X_T is the spot rate at maturity. Both rates are quoted as alternate currency per 1 unit of base (for example INR per USD).

## Payoff
If X_T <= K (the alternate currency did not weaken past the strike): the client gets N(1 + cT) in base currency.
If X_T > K (the alternate currency weakened): the client gets N(1 + cT) * K in the alternate currency.

Measured in base currency, the combined formula is:

Payoff (base) = N(1 + cT) * min(1, K / X_T)

## Worked example
Deposit USD 10,000, USD/INR spot 84, strike 85, coupon 8% p.a., tenor 1 month. Amount due = 10,000 * (1 + 0.08/12) = USD 10,066.67.
- If USD/INR ends at 84.5, the client gets USD 10,066.67.
- If USD/INR ends at 88, the client gets Rs 8,55,667, which is worth only about USD 9,724, a loss of roughly 2.8% despite the high coupon.

## Key risks
The gain is capped at the coupon. The loss is open-ended if the currency moves sharply. The client may end up holding a currency they did not want.
