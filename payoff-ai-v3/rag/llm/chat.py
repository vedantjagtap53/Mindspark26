"""Grounded chat: FACTS for the current simulation + retrieved notes, scope control, output checks."""
from __future__ import annotations

from typing import Optional, Sequence

from langchain_chroma import Chroma
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

from rag.config import get_settings
from rag.kb.retriever import retrieve
from rag.llm.client import get_chat_model
from rag.llm.facts import build_facts
from rag.llm.grounding import (
    allowed_numbers, find_banned, number_values, ungrounded_numbers, verdict_contradiction,
)
from rag.llm.output import ChatAnswer, ChatReply, ChatTurn
from rag.llm.prompts import (
    CHAT_DECLINE, CHAT_FALLBACK, CHAT_PROMPT, CHAT_RISK_NOTE, correction_message,
)
from rag.schemas import SimulationContext


class Chatbot:
    """Stateless: the caller (API layer) sends the recent history with every request."""

    def __init__(self, llm=None, vectorstore: Optional[Chroma] = None, max_retries: int = 1):
        self.llm = llm or get_chat_model()
        self.vectorstore = vectorstore
        self.max_retries = max_retries

    def answer(
        self, ctx: SimulationContext, question: str, history: Sequence[ChatTurn] = ()
    ) -> ChatAnswer:
        s = get_settings()
        q = question.strip()
        if not q:
            raise ValueError("question is empty")
        if len(q) > s.chat_max_question_chars:
            raise ValueError(f"question longer than {s.chat_max_question_chars} characters")

        recent = list(history)[-2 * s.chat_history_turns:]
        facts = build_facts(ctx)
        verdict = ctx.suitability.verdict.value
        # Numbers the user typed may be echoed (e.g. a what-if); assistant turns are not trusted.
        allowed = allowed_numbers(facts) | number_values(q)
        for t in recent:
            if t.role == "user":
                allowed |= number_values(t.content)

        docs = retrieve(q, product=ctx.terms.product, k=s.retrieval_k + 1, vectorstore=self.vectorstore)
        messages: list[BaseMessage] = CHAT_PROMPT.format_messages(
            facts=facts,
            history=[
                HumanMessage(content=t.content) if t.role == "user" else AIMessage(content=t.content)
                for t in recent
            ],
            knowledge="\n\n".join(d.page_content for d in docs),
            question=q,
        )
        sources = [f"{d.metadata['source']} > {d.metadata['section']}" for d in docs]
        structured = self.llm.with_structured_output(ChatReply)

        numbers: list[str] = []
        violations: list[str] = []
        reply: Optional[ChatReply] = None
        for attempt in range(self.max_retries + 1):
            reply = structured.invoke(messages)
            if reply is None:
                numbers, violations = [], ["model returned no structured output"]
                continue
            if reply.scope == "out_of_scope":
                return self._result(ctx, CHAT_DECLINE, "out_of_scope", True, [], [], [])
            numbers = ungrounded_numbers(reply.answer, allowed)
            violations = []
            if find_banned(reply.answer):
                violations.append("contains promised-return or advice wording; remove it")
            if verdict_contradiction(reply.answer, verdict):
                violations.append(f"contradicts the verdict '{verdict}'")
            if not numbers and not violations:
                return self._result(ctx, reply.answer.strip(), "in_scope", True, [], [], sources)
            if attempt < self.max_retries:
                messages = [
                    *messages,
                    AIMessage(content=reply.model_dump_json()),
                    HumanMessage(content=correction_message(numbers, violations)),
                ]

        # Chat is unreviewed and interactive, so a failed check never reaches the user.
        return self._result(ctx, CHAT_FALLBACK, "in_scope", False, numbers, violations, sources)

    @staticmethod
    def _result(ctx, answer, scope, ok, numbers, violations, sources) -> ChatAnswer:
        return ChatAnswer(
            simulation_id=ctx.simulation_id,
            answer=answer,
            scope=scope,
            checks_passed=ok,
            risk_note=CHAT_RISK_NOTE,
            ungrounded_numbers=numbers,
            guardrail_violations=violations,
            sources=sources,
            model_name=get_settings().llm_model,
        )
