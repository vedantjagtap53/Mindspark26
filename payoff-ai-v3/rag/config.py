from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PACKAGE_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    """Loaded from environment / .env. Field names map to env vars (GOOGLE_API_KEY, LLM_MODEL, ...)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    google_api_key: str = Field(default="")
    llm_model: str = "gemini-2.5-flash"
    embedding_model: str = "gemini-embedding-001"
    llm_temperature: float = 0.2
    llm_timeout_s: int = 60
    llm_max_retries: int = 2
    service_api_key: str = ""  # if set, /explain and /chat require X-API-Key

    # Used from Part 2 onwards
    knowledge_dir: Path = PACKAGE_DIR / "knowledge"
    vector_store_dir: Path = PACKAGE_DIR / "store"
    collection_name: str = "payoff_kb"
    chunk_size: int = 800
    chunk_overlap: int = 120
    retrieval_k: int = 4
    chat_history_turns: int = 6
    chat_max_question_chars: int = 1000


@lru_cache
def get_settings() -> Settings:
    return Settings()
