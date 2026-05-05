"""
coach_memory.py — RAG persistent memory for the JobNest coach.

Stores every coach message as a dense vector (all-MiniLM-L6-v2) in a per-user
pickle file under ./coach_vectors/. Before each response, runs cosine similarity
against all stored vectors to retrieve the 3 most relevant past messages.

No external vector database required — numpy is sufficient at this scale.
"""

from __future__ import annotations

import os
import pickle
from datetime import datetime, timezone
from typing import List, Dict

import numpy as np

# ---------------------------------------------------------------------------
# Paths + singleton model
# ---------------------------------------------------------------------------

_VECTORS_DIR = os.path.join(os.path.dirname(__file__), "coach_vectors")
_model = None


def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def _user_path(user_id: int) -> str:
    os.makedirs(_VECTORS_DIR, exist_ok=True)
    return os.path.join(_VECTORS_DIR, f"user_{user_id}.pkl")


def _load(user_id: int) -> list:
    path = _user_path(user_id)
    if not os.path.exists(path):
        return []
    with open(path, "rb") as f:
        return pickle.load(f)


def _save(user_id: int, entries: list) -> None:
    with open(_user_path(user_id), "wb") as f:
        pickle.dump(entries, f)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def warm_up() -> None:
    """Pre-load the embedding model at server startup so the first request is instant."""
    try:
        _get_model()
        print("[coach_memory] Embedding model ready.")
    except Exception as e:
        print(f"[coach_memory] Warm-up failed: {e}")


def embed_and_store(user_id: int, message: str, role: str) -> None:
    """Embed a message and append it to this user's vector store."""
    if not message or not message.strip():
        return
    try:
        embedding = _get_model().encode(message)
        entries = _load(user_id)
        entries.append({
            "message":   message,
            "role":      role,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "embedding": embedding,
        })
        _save(user_id, entries)
    except Exception as e:
        print(f"[coach_memory] embed_and_store failed: {e}")


def retrieve_relevant(user_id: int, query: str, n: int = 3) -> List[Dict[str, str]]:
    """
    Return the n most semantically relevant past messages for this user.
    Each result is {"role": str, "message": str, "timestamp": str}.
    """
    if not query or not query.strip():
        return []
    try:
        entries = _load(user_id)
        if not entries:
            return []

        query_vec = _get_model().encode(query)
        matrix    = np.stack([e["embedding"] for e in entries])

        # Cosine similarity: dot product of unit vectors
        q_norm = query_vec / (np.linalg.norm(query_vec) + 1e-10)
        m_norm = matrix / (np.linalg.norm(matrix, axis=1, keepdims=True) + 1e-10)
        scores = m_norm @ q_norm

        top_idx = np.argsort(scores)[::-1][:n]
        return [
            {
                "role":      entries[i]["role"],
                "message":   entries[i]["message"],
                "timestamp": entries[i]["timestamp"],
            }
            for i in top_idx
        ]
    except Exception as e:
        print(f"[coach_memory] retrieve_relevant failed: {e}")
        return []
