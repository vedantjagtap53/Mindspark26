"""Offline tests: fake embeddings, temp Chroma dir. No Gemini key needed."""
from pathlib import Path

import pytest
from langchain_core.embeddings import DeterministicFakeEmbedding

from rag.config import get_settings
from rag.kb.loader import load_markdown_documents
from rag.kb.retriever import retrieve, retrieve_for_simulation
from rag.kb.splitter import split_documents
from rag.kb.store import build_index, make_vectorstore
from rag.schemas import SimulationContext

KB_DIR = Path(get_settings().knowledge_dir)


@pytest.fixture
def chunks():
    s = get_settings()
    return split_documents(load_markdown_documents(KB_DIR), s.chunk_size, s.chunk_overlap)


@pytest.fixture
def vs(tmp_path):
    store = make_vectorstore(DeterministicFakeEmbedding(size=64), tmp_path, "test_kb")
    build_index(vectorstore=store)
    return store


def test_loader_reads_all_docs():
    docs = load_markdown_documents(KB_DIR)
    assert {d.metadata["product"] for d in docs} == {"ELN", "DCD", "CPN", "all"}
    assert {d.metadata["doc_type"] for d in docs} == {"product_note", "policy", "glossary"}


def test_chunks_have_section_and_unique_ids(chunks):
    ids = [c.metadata["chunk_id"] for c in chunks]
    assert len(ids) == len(set(ids))
    assert all(c.metadata["section"] for c in chunks)


def test_worked_example_numbers_survive_chunking(chunks):
    text = "\n".join(c.page_content for c in chunks)
    assert "Rs 8,50,000" in text and "USD 9,724" in text and "Rs 11,20,000" in text


def test_product_filter_excludes_other_products(vs):
    docs = retrieve("key risks", product="ELN", doc_type="product_note", k=10, vectorstore=vs)
    assert docs and {d.metadata["product"] for d in docs} == {"ELN"}


def test_product_filter_still_includes_shared_docs(vs):
    docs = retrieve("verdict", product="CPN", doc_type="policy", k=10, vectorstore=vs)
    assert docs and all(d.metadata["product"] == "all" for d in docs)


def test_retrieve_for_simulation(vs, eln_mode_a):
    ctx = SimulationContext.model_validate(eln_mode_a)
    rc = retrieve_for_simulation(ctx, vectorstore=vs)
    assert rc.product_notes and all(d.metadata["product"] == "ELN" for d in rc.product_notes)
    assert rc.policy and rc.glossary
    assert "Product notes" in rc.as_prompt_text()


def test_build_index_is_idempotent(tmp_path):
    store = make_vectorstore(DeterministicFakeEmbedding(size=64), tmp_path, "idem")
    n1 = build_index(vectorstore=store)
    n2 = build_index(vectorstore=store)
    assert n1 == n2 == store._collection.count()
