"""Explainer chain: retrieve, build facts, generate, check, retry once, return with check results."""
from __future__ import annotations

from typing import Optional

from langchain_chroma import Chroma
from langchain_core.messages import AIMessage, HumanMessage

from rag.config import get_settings
from rag.kb.retriever import retrieve_for_simulation
from rag.llm.client import get_chat_model
from rag.llm.facts import build_facts
from rag.llm.grounding import allowed_numbers, check_texts
from rag.llm.output import Explanation, ExplanationDraft
from rag.llm.prompts import (
    EXPLAIN_PROMPT, MODE_GUIDANCE, PRODUCT_GUIDANCE, correction_message, risk_notice,
)
from rag.schemas import SimMode, SimulationContext


class ExplanationError(RuntimeError):
    pass


class Explainer:
    def __init__(self, llm=None, vectorstore: Optional[Chroma] = None, max_retries: int = 1):
        self.llm = llm or get_chat_model()
        self.vectorstore = vectorstore
        self.max_retries = max_retries

    def explain(self, ctx: SimulationContext) -> Explanation:
        retrieved = retrieve_for_simulation(ctx, vectorstore=self.vectorstore)
        facts = build_facts(ctx)
        allowed = allowed_numbers(facts)
        verdict = ctx.suitability.verdict.value

        messages = EXPLAIN_PROMPT.format_messages(
            facts=facts,
            knowledge=retrieved.as_prompt_text(),
            mode_guidance=MODE_GUIDANCE[ctx.mode],
            product_guidance=PRODUCT_GUIDANCE[ctx.terms.product],
            verdict=verdict,
        )
        structured = self.llm.with_structured_output(ExplanationDraft)

        draft: Optional[ExplanationDraft] = None
        numbers: list[str] = []
        violations: list[str] = []
        for attempt in range(self.max_retries + 1):
            draft = structured.invoke(messages)
            if draft is None:
                numbers, violations = [], ["model returned no structured output"]
                continue
            numbers, violations = check_texts(
                draft.model_dump(), verdict, ctx.mode == SimMode.A, allowed
            )
            if not numbers and not violations:
                break
            if attempt < self.max_retries:
                messages = [
                    *messages,
                    AIMessage(content=draft.model_dump_json()),
                    HumanMessage(content=correction_message(numbers, violations)),
                ]
        if draft is None:
            raise ExplanationError("model returned no usable output")

        return Explanation(
            simulation_id=ctx.simulation_id,
            verdict=ctx.suitability.verdict,
            sections=draft,
            risk_notice=risk_notice(ctx),
            checks_passed=not numbers and not violations,
            ungrounded_numbers=numbers,
            guardrail_violations=violations,
            sources=[f"{d.metadata['source']} > {d.metadata['section']}" for d in retrieved.all_docs()],
            model_name=get_settings().llm_model,
        )
