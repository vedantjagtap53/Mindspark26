"""Offline: stub LLM + fake-embedding store. No Gemini key needed."""
import pytest
from stubs import StubLLM

from rag.llm.chat import Chatbot
from rag.llm.output import ChatReply, ChatTurn
from rag.llm.prompts import CHAT_DECLINE, CHAT_FALLBACK
from rag.schemas import SimulationContext

GOOD = ChatReply(scope="in_scope", answer="In the low scenario you would receive Rs 7,80,000, a loss of 22.0%.")
BAD_NUMBER = ChatReply(scope="in_scope", answer="In the low scenario you would receive Rs 6,10,000.")
OUT = ChatReply(scope="out_of_scope", answer="Tax on this is 30%, which is sensible.")


def _ctx(d):
    return SimulationContext.model_validate(d)


def _bot(replies, store):
    llm = StubLLM(replies)
    return Chatbot(llm=llm, vectorstore=store), llm


def test_in_scope_answer_passes(eln_mode_a, kb_store):
    bot, _ = _bot([GOOD], kb_store)
    res = bot.answer(_ctx(eln_mode_a), "What do I get in the low case?")
    assert res.checks_passed and res.scope == "in_scope" and res.answer == GOOD.answer and res.sources


def test_out_of_scope_uses_fixed_decline(eln_mode_a, kb_store):
    bot, _ = _bot([OUT], kb_store)
    res = bot.answer(_ctx(eln_mode_a), "What is the tax on this?")
    assert res.scope == "out_of_scope" and res.answer == CHAT_DECLINE and "30%" not in res.answer


def test_ungrounded_number_retries_then_passes(eln_mode_a, kb_store):
    bot, llm = _bot([BAD_NUMBER, GOOD], kb_store)
    res = bot.answer(_ctx(eln_mode_a), "What do I get in the low case?")
    assert res.checks_passed and llm.structured.calls == 2


def test_persistent_failure_returns_fallback(eln_mode_a, kb_store):
    bot, _ = _bot([BAD_NUMBER], kb_store)
    res = bot.answer(_ctx(eln_mode_a), "What do I get in the low case?")
    assert not res.checks_passed and res.answer == CHAT_FALLBACK and "6,10,000" in res.ungrounded_numbers


def test_user_typed_number_may_be_echoed(eln_mode_a, kb_store):
    reply = ChatReply(scope="in_scope", answer="A 30% fall is not one of the computed scenarios, so I cannot give a figure for it.")
    bot, _ = _bot([reply], kb_store)
    res = bot.answer(_ctx(eln_mode_a), "What if the index falls 30%?")
    assert res.checks_passed


def test_contradicting_the_verdict_is_blocked(eln_mode_a, kb_store):
    reply = ChatReply(scope="in_scope", answer="This product is suitable for the client.")
    bot, _ = _bot([reply], kb_store)
    res = bot.answer(_ctx(eln_mode_a), "Is it suitable?")  # fixture verdict: Not suitable
    assert not res.checks_passed and res.guardrail_violations


def test_history_is_sent_to_the_model(eln_mode_a, kb_store):
    bot, llm = _bot([GOOD], kb_store)
    history = [ChatTurn(role="user", content="Earlier question about barriers"),
               ChatTurn(role="assistant", content="Earlier answer")]
    bot.answer(_ctx(eln_mode_a), "And the low case?", history)
    sent = " ".join(str(m.content) for m in llm.structured.last_messages)
    assert "Earlier question about barriers" in sent and "Earlier answer" in sent


def test_empty_question_rejected(eln_mode_a, kb_store):
    bot, _ = _bot([GOOD], kb_store)
    with pytest.raises(ValueError):
        bot.answer(_ctx(eln_mode_a), "   ")
