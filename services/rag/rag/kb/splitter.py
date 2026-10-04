"""Section-aware chunking: split on markdown headers first, then by size."""
from __future__ import annotations

import hashlib

from langchain_core.documents import Document
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter

_HEADERS = [("#", "h1"), ("##", "h2"), ("###", "h3")]


def split_documents(docs: list[Document], chunk_size: int, chunk_overlap: int) -> list[Document]:
    header_splitter = MarkdownHeaderTextSplitter(headers_to_split_on=_HEADERS, strip_headers=False)
    size_splitter = RecursiveCharacterTextSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)

    chunks: list[Document] = []
    for doc in docs:
        for sec in header_splitter.split_text(doc.page_content):
            section = " > ".join(sec.metadata[h] for _, h in _HEADERS if h in sec.metadata)
            for i, piece in enumerate(size_splitter.split_text(sec.page_content)):
                chunk_id = hashlib.sha1(
                    f"{doc.metadata['source']}|{section}|{i}|{piece}".encode()
                ).hexdigest()
                # Prefix the section path so each chunk is self-describing when embedded.
                text = f"[{section}]\n{piece}" if section else piece
                chunks.append(
                    Document(
                        page_content=text,
                        metadata={**doc.metadata, "section": section, "chunk_id": chunk_id},
                    )
                )
    return chunks
