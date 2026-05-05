"""
coach_memory.py — RAG memory for the JobNest coach.

Embeds every coach message (user + assistant) into a local ChromaDB collection
using sentence-transformers (all-MiniLM-L6-v2). Before each coach response,
retrieves the 3 most semantically relevant past messages for that user and
injects them into the system prompt so the coach remembers across sessions.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import List, Dict

# ---------------------------------------------------------------------------
# Singletons — model and DB client are loaded once on first use
# ---------------------------------------------------------------------------

_model = None
_chroma_client = None
_collection = None

_CHROMA_PATH = os.path.join(os.path.dirname(__file__), "chroma_db")
_COLLECTION_NAME = "coach_memory"


def _get_collection():
    global _model, _chroma_client, _collection
    if _collection is not None:
        return _collection

    from sentence_transformers import SentenceTransformer
    import chromadb

    _model = SentenceTransformer("all-MiniLM-L6-v2")
    _chroma_client = chromadb.PersistentClient(path=_CHROMA_PATH)
    _collection = _chroma_client.get_or_create_collection(
        name=_COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )
    return _collection


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def embed_and_store(user_id: int, message: str, role: str) -> None:
    """
    Embed a single coach message and persist it in ChromaDB.
    Called after every user message and assistant reply.
    """
    if not message or not message.strip():
        return

    try:
        collection = _get_collection()
        timestamp = datetime.now(timezone.utc).isoformat()
        doc_id = f"{user_id}_{timestamp}_{role}"

        embedding = _model.encode(message).tolist()

        collection.add(
            ids=[doc_id],
            embeddings=[embedding],
            documents=[message],
            metadatas=[{
                "user_id": str(user_id),
                "role": role,
                "timestamp": timestamp,
            }],
        )
    except Exception as e:
        # Never crash the chat flow over a memory write failure
        print(f"[coach_memory] embed_and_store failed: {e}")


def retrieve_relevant(user_id: int, query: str, n: int = 3) -> List[Dict[str, str]]:
    """
    Search ChromaDB for the n most semantically relevant past messages for
    this user. Returns a list of {"role": str, "message": str, "timestamp": str},
    sorted by relevance (closest first). Returns [] on any failure.
    """
    if not query or not query.strip():
        return []

    try:
        collection = _get_collection()

        total = collection.count()
        if total == 0:
            return []

        embedding = _model.encode(query).tolist()

        results = collection.query(
            query_embeddings=[embedding],
            n_results=min(n, total),
            where={"user_id": str(user_id)},
        )

        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]

        memories = []
        for doc, meta in zip(docs, metas):
            memories.append({
                "role":      meta.get("role", "unknown"),
                "message":   doc,
                "timestamp": meta.get("timestamp", ""),
            })
        return memories

    except Exception as e:
        print(f"[coach_memory] retrieve_relevant failed: {e}")
        return []
