"""Terminal chat on the sample simulation: python -m rag.llm.chat_demo  (needs key + built index)"""
import copy

from rag.llm.chat import Chatbot
from rag.llm.output import ChatTurn
from rag.samples import ELN_MODE_A
from rag.schemas import SimulationContext

if __name__ == "__main__":
    ctx = SimulationContext.model_validate(copy.deepcopy(ELN_MODE_A))
    bot, history = Chatbot(), []
    print("Ask about the sample ELN simulation (empty line to quit).")
    while (q := input("\n> ").strip()):
        res = bot.answer(ctx, q, history)
        print(res.answer, f"\n[{res.scope}, checks_passed={res.checks_passed}]")
        history += [ChatTurn(role="user", content=q), ChatTurn(role="assistant", content=res.answer)]
