"""Connectivity check: python -m rag.llm.smoke"""
from rag.llm import get_chat_model, get_embeddings

if __name__ == "__main__":
    print("chat:", get_chat_model().invoke("Reply with the single word: ready").content)
    vec = get_embeddings().embed_query("equity linked note")
    print("embedding dim:", len(vec))
