from rag.llm.formatting import fmt_money, fmt_pct, fmt_prob
from rag.llm.grounding import allowed_numbers, check_texts, find_banned, ungrounded_numbers, verdict_consistent

FACTS = "payoff Rs 7,80,000; return -22.0%; tenor 180; Trained on 2016-10-03 to 2026-10-02"


def test_indian_money_format():
    assert fmt_money(780000, "INR") == "Rs 7,80,000"
    assert fmt_money(1060000, "INR") == "Rs 10,60,000"
    assert fmt_money(21000, "INR") == "Rs 21,000"
    assert fmt_money(9724, "USD") == "USD 9,724"


def test_pct_formats():
    assert fmt_pct(-22.0) == "-22.0%"
    assert fmt_prob(0.18) == "18.0%"


def test_grounded_numbers_pass():
    allowed = allowed_numbers(FACTS)
    assert ungrounded_numbers("You get Rs 7,80,000, a loss of 22%, over 180 days.", allowed) == []
    assert ungrounded_numbers("Trained from 2016 to 2026.", allowed) == []
    assert ungrounded_numbers("the 5th and 95th percentile", allowed) == []


def test_invented_number_caught():
    allowed = allowed_numbers(FACTS)
    assert ungrounded_numbers("You could get Rs 12,50,000 or 6 months.", allowed) == ["12,50,000", "6"]


def test_banned_wording():
    assert find_banned("This is a risk-free product")
    assert find_banned("a guaranteed return of")
    assert not find_banned("This is not a guarantee of any outcome.")


def test_verdict_consistency():
    assert verdict_consistent("The verdict is Not suitable.", "Not suitable")
    assert not verdict_consistent("It is suitable.", "Not suitable")
    assert verdict_consistent("This is suitable for you.", "Suitable")
    assert not verdict_consistent("This is not suitable.", "Suitable")
    assert verdict_consistent("Caution is advised.", "Caution")


def test_mode_a_needs_range_wording():
    sections = {"suitability_reasoning": "Verdict: Suitable.", "x": "You get 22.0%."}
    nums, viol = check_texts(sections, "Suitable", True, allowed_numbers(FACTS))
    assert any("range of scenarios" in v for v in viol)
