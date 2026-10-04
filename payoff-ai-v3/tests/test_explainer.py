"""Offline: stub LLM + fake-embedding store. No Gemini key needed."""
from rag.llm.explainer import Explainer
from rag.llm.facts import build_facts
from rag.llm.output import ExplanationDraft
from rag.schemas import SimulationContext

GOOD = ExplanationDraft(
    what_it_is="This is an equity-linked note on the Nifty 50. You invest Rs 10,00,000 for 180 days and receive a coupon of 12% per year. The barrier is a lower level that, if breached, means you take the fall in the index.",
    best_case="In the high scenario you receive Rs 10,60,000, a return of 6.0%. The gain is limited to the coupon, even if the market rises a lot.",
    worst_case="In the low scenario the barrier is knocked in and you receive Rs 7,80,000, a loss of 22.0%. The likely range runs from this low scenario to the high one.",
    loss_triggers="A loss happens if the index falls below the barrier. The chance of a loss across the simulated scenarios is 18.0%.",
    suitability_reasoning="The verdict is Not suitable because the low-scenario loss of 22.0% is above your stated loss tolerance of 15%.",
)
BAD = GOOD.model_copy(update={"best_case": "In the high scenario you could receive Rs 12,50,000, which is a good outcome."})


class _Structured:
    def __init__(self, drafts):
        self.drafts, self.calls = list(drafts), 0

    def invoke(self, messages):
        d = self.drafts[min(self.calls, len(self.drafts) - 1)]
        self.calls += 1
        return d


class _StubLLM:
    def __init__(self, drafts):
        self.structured = _Structured(drafts)

    def with_structured_output(self, schema):
        return self.structured


def _ctx(eln_mode_a):
    return SimulationContext.model_validate(eln_mode_a)


def test_facts_contain_engine_numbers(eln_mode_a):
    facts = build_facts(_ctx(eln_mode_a))
    for expected in ["Rs 10,00,000", "Rs 7,80,000", "-22.0%", "18.0%", "21.0%", "Not suitable", "GARCH(1,1)-t"]:
        assert expected in facts


def test_good_draft_passes_first_time(eln_mode_a, kb_store):
    llm = _StubLLM([GOOD])
    out = Explainer(llm=llm, vectorstore=kb_store).explain(_ctx(eln_mode_a))
    assert out.checks_passed and llm.structured.calls == 1
    assert "not a guarantee" in out.risk_notice and out.sources


def test_ungrounded_number_triggers_retry(eln_mode_a, kb_store):
    llm = _StubLLM([BAD, GOOD])
    out = Explainer(llm=llm, vectorstore=kb_store).explain(_ctx(eln_mode_a))
    assert out.checks_passed and llm.structured.calls == 2


def test_persistent_failure_is_flagged_not_hidden(eln_mode_a, kb_store):
    out = Explainer(llm=_StubLLM([BAD]), vectorstore=kb_store).explain(_ctx(eln_mode_a))
    assert not out.checks_passed and "12,50,000" in out.ungrounded_numbers
