"""Render a SimulationContext as the FACTS block. Every number the LLM may quote comes from here."""
from __future__ import annotations

from enum import Enum

from rag.llm.formatting import fmt_money, fmt_pct, fmt_prob
from rag.schemas import CaseResult, SimMode, SimulationContext

_LABELS = {
    # terms
    "tenor_days": "Tenor (days)", "underlying": "Underlying", "notional": "Notional",
    "strike_pct": "Strike (% of starting level)", "barrier_pct": "Barrier (% of starting level)",
    "barrier_type": "Barrier type", "coupon_pct_pa": "Coupon (% per year)",
    "currency_pair": "Currency pair", "deposit_amount": "Deposit amount",
    "strike_rate": "Strike rate", "enhanced_rate_pct_pa": "Enhanced interest rate (% per year)",
    "protection_pct": "Protection level (%)", "participation_pct": "Participation rate (%)",
    "cap_pct": "Cap (%)",
    # profile
    "risk_appetite": "Risk appetite", "investment_horizon_days": "Investment horizon (days)",
    "loss_tolerance_pct": "Loss tolerance (%)",
    "concentration_pct": "Share of portfolio in this product or underlying (%)",
}
_MONEY_KEYS = {"notional", "deposit_amount"}
_CASE_LABELS = {
    "low": "Low case (5th percentile)",
    "base": "Base case (median)",
    "high": "High case (95th percentile)",
}


def _value(key: str, v, currency: str) -> str:
    if isinstance(v, Enum):
        return str(v.value)
    if key in _MONEY_KEYS:
        return fmt_money(v, currency)
    if key.endswith("_pct") or key.endswith("_pct_pa"):
        return f"{v:g}%"
    return str(v)


def _kv_lines(data: dict, currency: str, skip: set[str] = frozenset()) -> list[str]:
    return [
        f"- {_LABELS.get(k, k)}: {_value(k, v, currency)}"
        for k, v in data.items()
        if v is not None and k not in skip
    ]


def _case_line(c: CaseResult, currency: str) -> str:
    parts = []
    if c.terminal_level is not None:
        parts.append(f"level at maturity {c.terminal_level:,.2f}")
    parts.append(f"payoff {fmt_money(c.payoff, currency)}")
    parts.append(f"return {fmt_pct(c.return_pct)}")
    if c.knocked_in is not None:
        parts.append(f"barrier knocked in: {'yes' if c.knocked_in else 'no'}")
    label = _CASE_LABELS.get(c.label, f"Scenario {c.label}")
    return f"- {label}: " + "; ".join(parts)


def build_facts(ctx: SimulationContext) -> str:
    cur = ctx.currency
    lines: list[str] = [
        f"Simulation mode: {'A (statistical forecast)' if ctx.mode == SimMode.A else 'B (manual what-if shock)'}",
        f"Currency: {cur}",
        "",
        f"PRODUCT TERMS ({ctx.terms.product})",
        *_kv_lines(ctx.terms.model_dump(), cur, skip={"product"}),
    ]
    if ctx.terms.product == "ELN" and ctx.terms.barrier_pct is None:
        lines.append("- Barrier: none (plain reverse convertible)")

    lines += ["", "CLIENT PROFILE", *_kv_lines(ctx.profile.model_dump(), cur)]

    cases = ctx.cases
    if ctx.mode == SimMode.A:
        order = {"low": 0, "base": 1, "high": 2}
        cases = sorted(cases, key=lambda c: order[c.label])
    lines += ["", "SCENARIOS", *[_case_line(c, cur) for c in cases]]

    if ctx.distribution:
        d = ctx.distribution
        lines += ["", "DISTRIBUTION ACROSS SIMULATED PATHS",
                  f"- Probability of loss: {fmt_prob(d.prob_loss)}"]
        if d.prob_knock_in is not None:
            lines.append(f"- Probability of barrier knock-in: {fmt_prob(d.prob_knock_in)}")
        lines += [
            f"- Payoff, 5th percentile: {fmt_money(d.payoff_p5, cur)}",
            f"- Payoff, 50th percentile: {fmt_money(d.payoff_p50, cur)}",
            f"- Payoff, 95th percentile: {fmt_money(d.payoff_p95, cur)}",
        ]

    if ctx.forecast_meta:
        m = ctx.forecast_meta
        # Assumes the contract sends MAPE as a fraction (0.061 = 6.1%); adjust here if it sends percent.
        lines += ["", "FORECAST MODEL CARD",
                  f"- Model: {m.model_name}",
                  f"- Trained on: {m.training_start.isoformat()} to {m.training_end.isoformat()}",
                  f"- As-of date: {m.as_of.isoformat()}",
                  f"- Drift assumption: {m.drift_assumption}",
                  f"- Backtest coverage of the 90% band: {fmt_prob(m.backtest_band_coverage)}",
                  f"- Backtest base-case error: {fmt_prob(m.backtest_base_mape)}",
                  f"- Backtest error of a no-change forecast: {fmt_prob(m.backtest_naive_mape)}"]

    s = ctx.suitability
    lines += ["", "SUITABILITY", f"- Verdict: {s.verdict.value}"]
    lines += [f"- Flag ({f.severity}) {f.rule}: {f.message}" for f in s.flags] or ["- Flags: none"]
    return "\n".join(lines)
