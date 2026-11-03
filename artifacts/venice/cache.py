"""Exact + semantic cache with single-flight.

Never cache partial streams, non-stop finish reasons, empty payloads, or foreign responses.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import time
from contextlib import asynccontextmanager
from typing import AsyncIterator

from .leases import LeaseStore

log = logging.getLogger(__name__)

# Optional semantic embeddings
try:
    from sentence_transformers import SentenceTransformer
    _EMBED_MODEL = None

    def _get_embedder():
        global _EMBED_MODEL
        if _EMBED_MODEL is None:
            _EMBED_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
        return _EMBED_MODEL

    _HAS_EMBED = True
except ImportError:
    _HAS_EMBED = False
    log.warning("sentence-transformers not available; semantic cache disabled")


def normalize(text: str) -> str:
    """NUL→space, collapse whitespace, strip trailing spaces."""
    text = text.replace("\x00", " ")
    text = re.sub(r"\s+", " ", text)
    return text.rstrip()


def canonical_json(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


def _digits(text: str) -> set[str]:
    return set(re.findall(r"\d+", text))


def _wrap_payload(payload: str, src: str) -> str:
    try:
        obj = json.loads(payload)
        if isinstance(obj, dict):
            obj["_venice_src"] = src
            return json.dumps(obj)
    except Exception:
        pass
    return json.dumps({"_venice_src": src, "_raw": payload})


def _unwrap_payload(payload: str) -> tuple[str, str]:
    try:
        obj = json.loads(payload)
        if isinstance(obj, dict) and "_venice_src" in obj:
            src = str(obj.pop("_venice_src"))
            if set(obj.keys()) == {"_raw"}:
                return str(obj["_raw"]), src
            return json.dumps(obj), src
    except Exception:
        pass
    return payload, ""


def exact_key(model: str, messages: list) -> str:
    norm_messages = []
    for m in messages:
        content = m.get("content", "")
        if isinstance(content, str):
            content = normalize(content)
        norm_messages.append({**m, "content": content})
    raw = model + canonical_json(norm_messages)
    return hashlib.sha256(raw.encode()).hexdigest()


class Cache:
    def __init__(self, store: LeaseStore, ttl_s: int = 86400, semantic_threshold: float = 0.97, semantic_min_chars: int = 40):
        self.store = store
        self.ttl_s = ttl_s
        self.semantic_threshold = semantic_threshold
        self.semantic_min_chars = semantic_min_chars
        self._inflight: dict[str, asyncio.Future] = {}
        self._lock = asyncio.Lock()
        self._gets = 0

    async def prune(self) -> None:
        cutoff = time.time() - self.ttl_s
        async with self.store._write_lock:
            await self.store.db.execute("DELETE FROM cache WHERE created < ?", (cutoff,))
            await self.store.db.commit()

    async def get(self, model: str, messages: list) -> tuple[str, str] | None:
        """Return (payload, kind) or None. kind is 'exact' or 'semantic'."""
        key = exact_key(model, messages)
        self._gets += 1
        if self._gets % 64 == 0:
            try:
                await self.prune()
            except Exception:
                pass
        rows = await self.store.db.execute_fetchall(
            "SELECT payload, kind, created FROM cache WHERE key = ?", (key,)
        )
        if rows:
            payload, kind, created = rows[0]
            if time.time() - created < self.ttl_s:
                clean, _src = _unwrap_payload(payload)
                return clean, "exact"

        # Semantic tier — skip entirely for short prompts
        last_user = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                last_user = str(m.get("content", ""))
                break
        if len(last_user) < self.semantic_min_chars:
            return None

        if not _HAS_EMBED:
            return None

        query_digits = _digits(normalize(last_user))
        try:
            embedder = _get_embedder()
            qvec = embedder.encode(normalize(last_user), convert_to_numpy=True)
            cutoff = time.time() - self.ttl_s
            rows = await self.store.db.execute_fetchall(
                "SELECT payload, embedding FROM cache WHERE model = ? AND created > ? AND embedding IS NOT NULL ORDER BY created DESC LIMIT 200",
                (model, cutoff),
            )
            best_score = 0.0
            best_payload = None
            for r in rows:
                if r["embedding"] is None:
                    continue
                clean, src = _unwrap_payload(r["payload"])
                # digit the candidate does not match exactly → skip this candidate
                if query_digits and (not src or not query_digits.issubset(_digits(src))):
                    continue
                import numpy as np
                cvec = np.frombuffer(r["embedding"], dtype=np.float32)
                score = float(np.dot(qvec, cvec) / (np.linalg.norm(qvec) * np.linalg.norm(cvec) + 1e-9))
                if score > best_score and score >= self.semantic_threshold:
                    best_score = score
                    best_payload = clean
            if best_payload:
                return best_payload, "semantic"
        except Exception as exc:
            log.debug("semantic lookup failed: %s", exc)
        return None

    async def put(self, model: str, messages: list, payload: str, embedding: bytes | None = None) -> None:
        if not payload or not payload.strip():
            return
        last_user = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                last_user = str(m.get("content", ""))
                break
        src = normalize(last_user)
        stored = _wrap_payload(payload, src)
        if embedding is None and _HAS_EMBED and len(src) >= self.semantic_min_chars:
            try:
                import numpy as np
                vec = _get_embedder().encode(src, convert_to_numpy=True).astype("float32")
                embedding = vec.tobytes()
            except Exception as exc:
                log.debug("embed on put failed: %s", exc)
        key = exact_key(model, messages)
        async with self.store._write_lock:
            await self.store.db.execute(
                "INSERT OR REPLACE INTO cache (key, kind, model, payload, embedding, created) VALUES (?, ?, ?, ?, ?, ?)",
                (key, "exact", model, stored, embedding, time.time()),
            )
            await self.store.db.commit()

    @asynccontextmanager
    async def single_flight(self, key: str) -> AsyncIterator[None]:
        """Leader runs; followers await. If leader raises, followers wake and retry (do not receive exception)."""
        async with self._lock:
            if key in self._inflight:
                fut = self._inflight[key]
                is_leader = False
            else:
                fut = asyncio.get_event_loop().create_future()
                self._inflight[key] = fut
                is_leader = True

        if is_leader:
            try:
                yield
                if not fut.done():
                    fut.set_result(None)
            except Exception as exc:
                if not fut.done():
                    fut.set_exception(exc)
                raise
            finally:
                async with self._lock:
                    self._inflight.pop(key, None)
        else:
            try:
                await fut
            except Exception:
                # Followers do not receive the exception; they retry
                pass
            yield
