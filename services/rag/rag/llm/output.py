"""LLM output schemas."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from rag.schemas import Verdict


class ExplanationDraft(BaseModel):
    """What the model writes. Fixed sections required by PRD 7.3."""
    what_it_is: str = Field(min_length=20, description="What the product is, in plain words.")
    best_case: str = Field(min_length=20, description="The best outcome and what limits it.")
    worst_case: str = Field(min_length=20, description="The worst outcome shown, in plain words.")
    loss_triggers: str = Field(min_length=20, description="What makes the client lose money.")
    suitability_reasoning: str = Field(
        min_length=20, description="State the verdict exactly and explain why, using the flags."
    )


class Explanation(BaseModel):
    """What the API returns and the backend stores as evidence."""
    simulation_id: str
    verdict: Verdict
    sections: ExplanationDraft
    risk_notice: str  # written by code, never by the model
    checks_passed: bool
    ungrounded_numbers: list[str] = Field(default_factory=list)
    guardrail_violations: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    model_name: str


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatReply(BaseModel):
    """What the model writes for one chat turn."""
    scope: Literal["in_scope", "out_of_scope"] = Field(
        description="in_scope if the question is about this simulation, the product or the verdict."
    )
    answer: str = Field(description="2-5 short sentences. Ignored if scope is out_of_scope.")


class ChatAnswer(BaseModel):
    """What the API returns for one chat turn."""
    simulation_id: str
    answer: str
    scope: Literal["in_scope", "out_of_scope"]
    checks_passed: bool
    risk_note: str
    ungrounded_numbers: list[str] = Field(default_factory=list)
    guardrail_violations: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    model_name: str
