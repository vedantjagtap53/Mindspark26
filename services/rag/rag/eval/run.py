"""
Live eval against Gemini: python -m rag.eval.run [--min-pass 0.9]
Needs GOOGLE_API_KEY and a built index. Exits 1 if either pass rate is below the threshold.
"""
import argparse
import sys
import time

from rag.eval.cases import CHAT_QUESTIONS, EXPLAIN_CASES
from rag.llm.chat import Chatbot
from rag.llm.explainer import Explainer
from rag.schemas import SimulationContext


def _mentions(text: str, needles: list[str]) -> list[str]:
    t = text.lower()
    return [n for n in needles if n not in t]


def _retry(fn, tries=5, wait=20):
    for i in range(tries):
        try:
            return fn()
        except Exception as e:
            if i == tries - 1:
                raise
            print(f"  API error ({str(e)[:60]}), retrying in {wait}s...")
            time.sleep(wait)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-pass", type=float, default=0.9)
    args = ap.parse_args()

    ctxs = {c.id: SimulationContext.model_validate(c.context) for c in EXPLAIN_CASES}
    explainer, bot = Explainer(), Chatbot()

    print("== Explainer ==")
    exp_ok = 0
    for case in EXPLAIN_CASES:
        res = _retry(lambda: explainer.explain(ctxs[case.id]))
        text = " ".join(res.sections.model_dump().values())
        missing = _mentions(text, case.must_mention)
        ok = res.checks_passed and not missing
        exp_ok += ok
        print(f"{'PASS' if ok else 'FAIL'} {case.id} checks_passed={res.checks_passed} "
              f"ungrounded={res.ungrounded_numbers} violations={res.guardrail_violations} missing={missing}")

    print("\n== Chat ==")
    chat_ok = 0
    for q in CHAT_QUESTIONS:
        res = _retry(lambda: bot.answer(ctxs[q.case_id], q.question))
        low = res.answer.lower()
        problems = []
        if q.expected_scope and res.scope != q.expected_scope:
            problems.append(f"scope={res.scope}")
        if not res.checks_passed:
            problems.append("checks_failed")
        if res.scope == "in_scope":
            problems += [f"missing '{m}'" for m in _mentions(res.answer, q.must_mention)]
        problems += [f"contains '{n}'" for n in q.must_not_mention if n in low]
        chat_ok += not problems
        print(f"{'PASS' if not problems else 'FAIL'} [{q.case_id}] {q.question} {problems or ''}")

    er, cr = exp_ok / len(EXPLAIN_CASES), chat_ok / len(CHAT_QUESTIONS)
    print(f"\nexplainer {exp_ok}/{len(EXPLAIN_CASES)} ({er:.0%}), chat {chat_ok}/{len(CHAT_QUESTIONS)} ({cr:.0%})")
    return 0 if min(er, cr) >= args.min_pass else 1


if __name__ == "__main__":
    sys.exit(main())
