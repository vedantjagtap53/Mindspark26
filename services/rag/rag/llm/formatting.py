"""Number formatting for the facts block (stdlib only)."""
from __future__ import annotations


def _indian_group(n: int) -> str:
    s = str(abs(n))
    if len(s) <= 3:
        out = s
    else:
        head, tail = s[:-3], s[-3:]
        parts: list[str] = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        out = ",".join(parts + [tail])
    return ("-" if n < 0 else "") + out


def fmt_money(x: float, currency: str) -> str:
    n = int(round(x))
    if currency.upper() == "INR":
        return f"Rs {_indian_group(n)}"
    return f"{currency.upper()} {n:,}"


def fmt_pct(x: float, decimals: int = 1) -> str:
    return f"{x:.{decimals}f}%"


def fmt_prob(p: float, decimals: int = 1) -> str:
    """Probability in [0, 1] shown as a percentage."""
    return fmt_pct(p * 100, decimals)
