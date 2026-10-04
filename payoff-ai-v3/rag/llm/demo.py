"""Try the explainer on a sample: python -m rag.llm.demo  (needs GOOGLE_API_KEY and a built index)"""
import copy

from rag.llm.explainer import Explainer
from rag.samples import ELN_MODE_A
from rag.schemas import SimulationContext

if __name__ == "__main__":
    ctx = SimulationContext.model_validate(copy.deepcopy(ELN_MODE_A))
    result = Explainer().explain(ctx)
    for name, text in result.sections.model_dump().items():
        print(f"\n## {name}\n{text}")
    print(f"\n{result.risk_notice}\n\nchecks_passed={result.checks_passed}")
    if not result.checks_passed:
        print("ungrounded:", result.ungrounded_numbers, "violations:", result.guardrail_violations)
