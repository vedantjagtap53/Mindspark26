"""Metadata-filtered retrieval, plus the retrieval bundle the explainer (Part 3) consumes."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from langchain_chroma import Chroma
from langchain_core.documents import Document

from rag.config import get_settings
from rag.kb.store import get_vectorstore
from rag.schemas import SimMode, SimulationContext


def _build_filter(product: Optional[str], doc_type: Optional[str]) -> Optional[dict]:
    conds: list[dict] = []
    if product:
        # Product-specific docs plus anything marked product: all (policy, glossary)
        conds.append({"product": {"$in": [product, "all"]}})
    if doc_type:
        conds.append({"doc_type": doc_type})
    if not conds:
        return None
    return conds[0] if len(conds) == 1 else {"$and": conds}


def retrieve(
    query: str,
    *,
    product: Optional[str] = None,
    doc_type: Optional[str] = None,
    k: Optional[int] = None,
    vectorstore: Optional[Chroma] = None,
) -> list[Document]:
    vs = vectorstore or get_vectorstore()
    return vs.similarity_search(
        query, k=k or get_settings().retrieval_k, filter=_build_filter(product, doc_type)
    )


@dataclass
class RetrievedContext:
    product_notes: list[Document] = field(default_factory=list)
    policy: list[Document] = field(default_factory=list)
    glossary: list[Document] = field(default_factory=list)

    def all_docs(self) -> list[Document]:
        return [*self.product_notes, *self.policy, *self.glossary]

    def as_prompt_text(self) -> str:
        def block(title: str, docs: list[Document]) -> str:
            if not docs:
                return ""
            body = "\n\n".join(d.page_content for d in docs)
            return f"### {title}\n{body}"

        parts = [
            block("Product notes", self.product_notes),
            block("Suitability policy", self.policy),
            block("Glossary", self.glossary),
        ]
        return "\n\n".join(p for p in parts if p)


_GLOSSARY_TERMS = {
    "ELN": "notional coupon strike barrier knock-in european american barrier",
    "DCD": "notional coupon strike alternate currency tenor",
    "CPN": "notional protection level participation rate cap",
}


def _dedupe(docs: list[Document]) -> list[Document]:
    seen: set[str] = set()
    out: list[Document] = []
    for d in docs:
        cid = d.metadata.get("chunk_id", d.page_content)
        if cid not in seen:
            seen.add(cid)
            out.append(d)
    return out


def retrieve_for_simulation(
    ctx: SimulationContext, *, vectorstore: Optional[Chroma] = None
) -> RetrievedContext:
    """Fetch the notes, policy text and glossary entries relevant to one simulation."""
    product = ctx.terms.product

    notes = retrieve(
        f"{product} what it is, payoff, worked example and key risks",
        product=product, doc_type="product_note", k=4, vectorstore=vectorstore,
    )

    flag_text = "; ".join(f.message for f in ctx.suitability.flags) or "no flags raised"
    policy = retrieve(
        f"suitability verdict {ctx.suitability.verdict.value}: {flag_text}",
        doc_type="policy", k=4, vectorstore=vectorstore,
    )

    glossary_query = _GLOSSARY_TERMS[product]
    if ctx.mode == SimMode.A:
        glossary_query += " low base high case percentile probability of loss"
    glossary = retrieve(glossary_query, doc_type="glossary", k=4, vectorstore=vectorstore)

    return RetrievedContext(
        product_notes=_dedupe(notes), policy=_dedupe(policy), glossary=_dedupe(glossary)
    )
