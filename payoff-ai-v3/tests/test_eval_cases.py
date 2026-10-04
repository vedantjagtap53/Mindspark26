from rag.eval.cases import CHAT_QUESTIONS, EXPLAIN_CASES
from rag.schemas import SimulationContext


def test_all_eval_contexts_are_valid():
    for c in EXPLAIN_CASES:
        SimulationContext.model_validate(c.context)


def test_ids_unique_and_chat_references_exist():
    ids = [c.id for c in EXPLAIN_CASES]
    assert len(ids) == len(set(ids))
    assert {q.case_id for q in CHAT_QUESTIONS} <= set(ids)


def test_formula_consistency_spot_checks():
    by = {c.id: SimulationContext.model_validate(c.context) for c in EXPLAIN_CASES}
    # CPN never pays below the protected floor
    assert all(c.payoff >= 1_000_000 for c in by["cpn-a"].cases + by["cpn-b"].cases)
    # DCD never pays above N(1 + cT)
    cap = 10_000 * (1 + 0.08 * 30 / 365)
    assert all(c.payoff <= cap + 0.01 for c in by["dcd-b"].cases)
    # ELN-A low case knocked in and loses, base case does not
    low = next(c for c in by["eln-a"].cases if c.label == "low")
    base = next(c for c in by["eln-a"].cases if c.label == "base")
    assert low.knocked_in and low.return_pct < 0 and not base.knocked_in
