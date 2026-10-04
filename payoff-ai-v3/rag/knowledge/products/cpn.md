---
product: CPN
doc_type: product_note
title: Capital-Protected Note
---
# CPN (Capital-Protected Note)

## What it is
A note that returns at least a fixed percentage of the client's principal (often 100%) at maturity, plus a share of any rise in the underlying. The bank builds it from a zero-coupon bond (which grows back to the protected amount) and uses the leftover money to buy a call option on the underlying. Because the option budget is limited, the client only participates in part of the upside.

## Notation
N is the notional. p is the protection level (for example 100%). alpha is the participation rate (for example 60%). S0 and S_T are the underlying at start and maturity. C is an optional cap on the return.

## Payoff
Uncapped: Payoff = N * [ p + alpha * max(S_T / S0 - 1, 0) ]

With cap: Payoff = N * [ p + min( alpha * max(S_T / S0 - 1, 0), C ) ]

## Worked example
Rs 10,00,000 on Nifty, p = 100%, alpha = 60%, no cap, 3 years.
- If Nifty rises 20%, the client gets Rs 10,00,000 * (1 + 0.6 * 0.20) = Rs 11,20,000.
- If Nifty falls 30%, the client still gets Rs 10,00,000 back.

## Contrast with the ELN
The ELN has capped upside and large downside. The CPN has protected downside and uncapped (but diluted) upside when no cap is set.

## Key risks
Protection holds only at maturity, so exiting early can mean a loss. Protection depends on the issuer staying solvent (credit risk). Upside is diluted by the participation rate. In a flat market the client earns nothing, losing out to inflation and to what a plain fixed deposit would have paid.
