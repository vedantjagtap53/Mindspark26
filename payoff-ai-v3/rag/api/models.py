from pydantic import BaseModel, Field

from rag.llm.output import ChatTurn
from rag.schemas import SimulationContext


class ChatRequest(BaseModel):
    context: SimulationContext
    question: str = Field(min_length=1, max_length=1000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=40)
