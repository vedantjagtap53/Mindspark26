"""Chroma vector store: build and access. Embeddings via Gemini (rag.llm)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from langchain_chroma import Chroma
from langchain_core.embeddings import Embeddings

from rag.config import get_settings
from rag.kb.loader import load_markdown_documents
from rag.kb.splitter import split_documents
from rag.llm import get_embeddings


def make_vectorstore(
    embeddings: Embeddings | None = None,
    persist_directory: Path | str | None = None,
    collection_name: str | None = None,
) -> Chroma:
    """Factory with injectable parts (tests pass fake embeddings and a tmp dir)."""
    s = get_settings()
    return Chroma(
        collection_name=collection_name or s.collection_name,
        embedding_function=embeddings or get_embeddings(),
        persist_directory=str(persist_directory or s.vector_store_dir),
    )


@lru_cache
def get_vectorstore() -> Chroma:
    return make_vectorstore()


def build_index(rebuild: bool = False, vectorstore: Chroma | None = None) -> int:
    """Chunk the knowledge files and upsert them. Returns the number of chunks.

    Chunk ids are content hashes, so re-running is idempotent. After EDITING or
    DELETING knowledge files, use rebuild=True so stale chunks are removed.
    """
    s = get_settings()
    chunks = split_documents(
        load_markdown_documents(s.knowledge_dir), s.chunk_size, s.chunk_overlap
    )
    vs = vectorstore
    if vs is None:
        if rebuild:
            get_vectorstore().delete_collection()
            get_vectorstore.cache_clear()
        vs = get_vectorstore()
    elif rebuild:
        vs.reset_collection()
    vs.add_documents(chunks, ids=[c.metadata["chunk_id"] for c in chunks])
    return len(chunks)
