"""Load markdown knowledge files with simple `key: value` frontmatter."""
from __future__ import annotations

import re
from pathlib import Path

from langchain_core.documents import Document

_FRONTMATTER = re.compile(r"\A---\n(.*?)\n---\n", re.S)
ALLOWED_PRODUCTS = {"ELN", "DCD", "CPN", "all"}
ALLOWED_DOC_TYPES = {"product_note", "policy", "glossary"}


def _parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    m = _FRONTMATTER.match(text)
    if not m:
        return {}, text
    meta: dict[str, str] = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            meta[key.strip()] = value.strip()
    return meta, text[m.end():]


def load_markdown_documents(root: Path) -> list[Document]:
    docs: list[Document] = []
    for path in sorted(Path(root).rglob("*.md")):
        meta, body = _parse_frontmatter(path.read_text(encoding="utf-8"))
        rel = str(path.relative_to(root))
        if meta.get("product") not in ALLOWED_PRODUCTS:
            raise ValueError(f"{rel}: 'product' must be one of {sorted(ALLOWED_PRODUCTS)}")
        if meta.get("doc_type") not in ALLOWED_DOC_TYPES:
            raise ValueError(f"{rel}: 'doc_type' must be one of {sorted(ALLOWED_DOC_TYPES)}")
        meta["source"] = rel
        docs.append(Document(page_content=body, metadata=meta))
    if not docs:
        raise FileNotFoundError(f"No .md knowledge files found under {root}")
    return docs
