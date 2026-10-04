import copy

import pytest
from langchain_core.embeddings import DeterministicFakeEmbedding

from rag.kb.store import build_index, make_vectorstore
from rag.samples import ELN_MODE_A


@pytest.fixture
def eln_mode_a() -> dict:
    return copy.deepcopy(ELN_MODE_A)


@pytest.fixture
def kb_store(tmp_path):
    store = make_vectorstore(DeterministicFakeEmbedding(size=64), tmp_path, "test_kb_shared")
    build_index(vectorstore=store)
    return store
