"""Offline API tests with stub LLM and fake-embedding store."""
import copy

import pytest
from fastapi.testclient import TestClient
from stubs import StubLLM
from test_explainer import GOOD

from rag.api.app import create_app
from rag.llm.chat import Chatbot
from rag.llm.explainer import Explainer
from rag.llm.output import ChatReply
from rag.samples import ELN_MODE_A

CHAT_GOOD = ChatReply(scope="in_scope", answer="In the low scenario you would receive Rs 7,80,000, a loss of 22.0%.")


class _Boom:
    def with_structured_output(self, schema):
        return self

    def invoke(self, messages):
        raise RuntimeError("upstream exploded")


def _client(kb_store, api_key=None, llm=None):
    return TestClient(create_app(
        explainer=Explainer(llm=llm or StubLLM([GOOD]), vectorstore=kb_store),
        chatbot=Chatbot(llm=llm or StubLLM([CHAT_GOOD]), vectorstore=kb_store),
        api_key=api_key,
    ))


def test_health(kb_store):
    assert _client(kb_store).get("/health").json()["status"] == "ok"


def test_ready_reports_chunks(kb_store):
    r = _client(kb_store).get("/ready")
    assert r.status_code == 200 and r.json()["chunks"] > 0


def test_explain_ok(kb_store):
    r = _client(kb_store).post("/explain", json=ELN_MODE_A)
    body = r.json()
    assert r.status_code == 200 and body["checks_passed"] and body["verdict"] == "Not suitable"
    assert {"what_it_is", "best_case", "worst_case", "loss_triggers", "suitability_reasoning"} <= set(body["sections"])


def test_explain_rejects_invalid_context(kb_store):
    bad = copy.deepcopy(ELN_MODE_A)
    bad["terms"]["tenor_days"] = 1200
    assert _client(kb_store).post("/explain", json=bad).status_code == 422


def test_chat_ok(kb_store):
    r = _client(kb_store).post("/chat", json={"context": ELN_MODE_A, "question": "What do I get in the low case?"})
    assert r.status_code == 200 and r.json()["scope"] == "in_scope"


def test_chat_blank_question_is_422(kb_store):
    r = _client(kb_store).post("/chat", json={"context": ELN_MODE_A, "question": "   "})
    assert r.status_code == 422


def test_api_key_enforced_when_set(kb_store):
    c = _client(kb_store, api_key="secret")
    assert c.post("/explain", json=ELN_MODE_A).status_code == 401
    assert c.post("/explain", json=ELN_MODE_A, headers={"X-API-Key": "wrong"}).status_code == 401
    assert c.post("/explain", json=ELN_MODE_A, headers={"X-API-Key": "secret"}).status_code == 200
    assert c.get("/health").status_code == 200


def test_llm_failure_is_502_without_leaking_details(kb_store):
    r = _client(kb_store, llm=_Boom()).post("/explain", json=ELN_MODE_A)
    assert r.status_code == 502 and "exploded" not in r.text
