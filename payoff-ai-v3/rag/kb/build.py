"""Build the index: python -m rag.kb.build [--rebuild]"""
import argparse

from rag.kb.store import build_index

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--rebuild", action="store_true", help="drop the collection first (use after editing docs)")
    args = ap.parse_args()
    print(f"Indexed {build_index(rebuild=args.rebuild)} chunks")
