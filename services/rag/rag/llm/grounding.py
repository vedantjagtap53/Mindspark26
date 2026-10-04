"""Deterministic output checks (stdlib only): number grounding, banned wording, verdict, range wording."""
from __future__ import annotations

import re

_NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")
# Percentile labels (5th / 50th / 95th) are definitions, not engine numbers.
NUMBER_WHITELIST = {5.0, 50.0, 95.0}

BANNED_PATTERNS = [
    r"\brisk[- ]free\b",
    r"\bno risk\b",
    r"\bguarantee[sd]? (?:a )?(?:return|profit|gain|income)s?\b",
    r"\b(?:will|are certain to|is certain to) (?:earn|make|return|profit)\b",
    r"\bsafe bet\b",
    r"\bsure (?:thing|profit)\b",
    r"\byou should (?:buy|invest|sell|purchase)\b",
    r"\bi (?:strongly )?recommend\b",
]


def extract_numbers(text: str) -> list[tuple[str, float]]:
    """(original token, value). Signs are ignored on purpose (dates like 2016-10-03)."""
    out = []
    for m in _NUM.finditer(text):
        tok = m.group().rstrip(",")
        out.append((tok, float(tok.replace(",", ""))))
    return out


def allowed_numbers(facts: str) -> set[float]:
    return {v for _, v in extract_numbers(facts)} | NUMBER_WHITELIST


def ungrounded_numbers(text: str, allowed: set[float]) -> list[str]:
    seen: list[str] = []
    for tok, val in extract_numbers(text):
        if not any(abs(val - a) < 1e-6 for a in allowed) and tok not in seen:
            seen.append(tok)
    return seen


def find_banned(text: str) -> list[str]:
    return [p for p in BANNED_PATTERNS if re.search(p, text, re.I)]


def verdict_consistent(text: str, verdict: str) -> bool:
    t = text.lower()
    negative = "not suitable" in t or "unsuitable" in t
    if verdict == "Not suitable":
        return negative
    if verdict == "Suitable":
        return "suitable" in t and not negative
    if verdict == "Caution":
        return "caution" in t and not negative
    return True


def check_texts(
    sections: dict[str, str], verdict: str, is_mode_a: bool, allowed: set[float]
) -> tuple[list[str], list[str]]:
    """Returns (ungrounded numbers, guardrail violations)."""
    full = "\n".join(sections.values())
    violations: list[str] = []
    if find_banned(full):
        violations.append("contains promised-return or advice wording; remove it")
    if not verdict_consistent(sections.get("suitability_reasoning", ""), verdict):
        violations.append(f"suitability_reasoning must state the verdict '{verdict}' and not contradict it")
    if is_mode_a and not re.search(r"\b(range|scenarios?)\b", full, re.I):
        violations.append("forecast results must be described as a range of scenarios")
    return ungrounded_numbers(full, allowed), violations


def number_values(text: str) -> set[float]:
    return {v for _, v in extract_numbers(text)}


def verdict_contradiction(text: str, verdict: str) -> bool:
    """True if the text takes a suitability stance that conflicts with the verdict.
    Text that says nothing about suitability is not a contradiction."""
    t = text.lower()
    negative = "not suitable" in t or "unsuitable" in t
    positive = re.search(r"(?<!not )(?<!un)suitable", t) is not None
    if verdict == "Not suitable":
        return positive and not negative
    return negative  # Suitable or Caution, but the text says not suitable
