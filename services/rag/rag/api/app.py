"""
AI service API (stateless). The backend owns simulation records and sends the full
SimulationContext with every request.

Run: uvicorn rag.api.app:app --port 8001
"""
from __future__ import annotations

import hmac
import logging
import time
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException

from rag.api.models import ChatRequest
from rag.config import get_settings
from rag.kb.store import get_vectorstore
from rag.llm.chat import Chatbot
from rag.llm.explainer import Explainer, ExplanationError
from rag.llm.output import ChatAnswer, Explanation
from rag.schemas import SimulationContext

log = logging.getLogger("rag.api")


def create_app(
    explainer: Optional[Explainer] = None,
    chatbot: Optional[Chatbot] = None,
    api_key: Optional[str] = None,
) -> FastAPI:
    key = get_settings().service_api_key if api_key is None else api_key
    holder = {"explainer": explainer, "chatbot": chatbot}
    app = FastAPI(title="Payoff AI (RAG + LLM)", version="0.1.0")

    def auth(x_api_key: Optional[str] = Header(default=None)) -> None:
        if key and not (x_api_key and hmac.compare_digest(x_api_key, key)):
            raise HTTPException(status_code=401, detail="Invalid or missing API key")

    def get_explainer() -> Explainer:
        if holder["explainer"] is None:
            holder["explainer"] = Explainer()
        return holder["explainer"]

    def get_chatbot() -> Chatbot:
        if holder["chatbot"] is None:
            holder["chatbot"] = Chatbot()
        return holder["chatbot"]

    @app.get("/health")
    def health():
        return {"status": "ok", "model": get_settings().llm_model}

    @app.get("/ready")
    def ready():
        try:
            e = holder["explainer"]
            vs = (e.vectorstore if e else None) or get_vectorstore()
            n = vs._collection.count()
        except Exception:
            raise HTTPException(status_code=503, detail="Index not available")
        if n == 0:
            raise HTTPException(status_code=503, detail="Index is empty; run python -m rag.kb.build")
        return {"status": "ready", "chunks": n}

    @app.post("/explain", response_model=Explanation, dependencies=[Depends(auth)])
    def explain(ctx: SimulationContext):
        started = time.perf_counter()
        try:
            result = get_explainer().explain(ctx)
        except ExplanationError:
            raise HTTPException(status_code=502, detail="LLM returned no usable output")
        except Exception:
            log.exception("explain failed sim=%s", ctx.simulation_id)
            raise HTTPException(status_code=502, detail="LLM service error")
        # IDs and outcomes only: no client profile or question text in logs.
        log.info("explain sim=%s checks_passed=%s ms=%d", ctx.simulation_id,
                 result.checks_passed, (time.perf_counter() - started) * 1000)
        return result

    @app.post("/chat", response_model=ChatAnswer, dependencies=[Depends(auth)])
    def chat(req: ChatRequest):
        started = time.perf_counter()
        try:
            result = get_chatbot().answer(req.context, req.question, req.history)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        except Exception:
            log.exception("chat failed sim=%s", req.context.simulation_id)
            raise HTTPException(status_code=502, detail="LLM service error")
        log.info("chat sim=%s scope=%s checks_passed=%s ms=%d", req.context.simulation_id,
                 result.scope, result.checks_passed, (time.perf_counter() - started) * 1000)
        return result

    return app


app = create_app()
