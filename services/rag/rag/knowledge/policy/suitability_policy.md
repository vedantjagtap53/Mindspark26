---
product: all
doc_type: policy
title: Suitability policy (DRAFT)
---
# Suitability policy (DRAFT)

DRAFT drafted from the PRD v2 rules. Replace with the institution's actual policy text before production use. Thresholds and severity per rule are set by the suitability engine, not by this text; this text explains the intent of each check in plain language.

## Verdicts
Suitable: no check raised a concern for this client profile. Caution: one or more checks raised a concern the relationship manager should discuss with the client before proceeding. Not suitable: the product conflicts with the client's stated limits. The verdict is computed by the suitability engine and must be explained, never changed.

## Low-case loss versus loss tolerance
The product is run on a low case (the 5th percentile outcome in Mode A). If the loss in that case is larger than the loss the client said they can tolerate, this check is flagged.

## Barrier knock-in (ELN only)
For an ELN with a barrier, the check looks at whether the barrier is knocked in in the low case, or in the base case. A knock-in means the client takes the loss on the underlying instead of receiving only the coupon.

## Tenor versus investment horizon
If the product's tenor is longer than the client's investment horizon, this check is flagged, because the client may need the money before the product matures.

## Concentration
If the share of the client's portfolio in this product or underlying is above the concentration limit, this check is flagged.

## Product risk level versus risk appetite
Each product type carries a fixed risk rating. CPN is rated lower. ELN and DCD are rated higher. If the product's risk level is above the client's stated risk appetite, this check is flagged.

## Scope of the check
The check uses only the client profile (risk appetite, investment horizon, loss tolerance, concentration) and the simulated results. It is a documented suitability check on a simulation, not a guarantee of outcomes and not personal financial advice beyond the verdict.
