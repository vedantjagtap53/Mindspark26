"""Gemini model factories. Single place to change model, temperature, retries."""
from dataclasses import dataclass
from functools import lru_cache

from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings

from rag.config import get_settings

FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.7-flash"]


def _require_key() -> str:
    key = get_settings().google_api_key
    if not key:
        raise RuntimeError("GOOGLE_API_KEY is not set. Copy .env.example to .env and fill it in.")
    return key


@dataclass
class FallbackChat:
    """Tries the main model, then each fallback, when Gemini returns 503 etc."""
    models: list

    def with_structured_output(self, schema, **kw):
        runs = [m.with_structured_output(schema, **kw) for m in self.models]
        return runs[0].with_fallbacks(runs[1:])

    def invoke(self, *a, **k):
        return self.models[0].with_fallbacks(self.models[1:]).invoke(*a, **k)


@lru_cache
def get_chat_model(temperature: float | None = None) -> FallbackChat:
    s = get_settings()
    names = [s.llm_model] + [m for m in FALLBACK_MODELS if m != s.llm_model]
    return FallbackChat([
        ChatGoogleGenerativeAI(
            model=n,
            temperature=s.llm_temperature if temperature is None else temperature,
            google_api_key=_require_key(),
            timeout=s.llm_timeout_s,
            max_retries=1,
        ) for n in names
    ])


@lru_cache
def get_embeddings() -> GoogleGenerativeAIEmbeddings:
    s = get_settings()
    name = s.embedding_model
    if not name.startswith("models/"):
        name = f"models/{name}"
    return GoogleGenerativeAIEmbeddings(model=name, google_api_key=_require_key())
