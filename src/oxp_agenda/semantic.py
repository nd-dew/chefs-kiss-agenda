"""Semantic search: Gemini embeddings for every session plus cosine ranking.

Session vectors are cached in ``data/embeddings.json`` (int8-quantised, keyed by
session id + content hash), so only new or edited talks are re-embedded.
"""

import base64
import hashlib
import json
import logging
import math
import threading
import urllib.error
import urllib.request
from collections import OrderedDict
from pathlib import Path

from oxp_agenda.config import GeminiSettings
from oxp_agenda.gemini import API_BASE, GeminiError

log = logging.getLogger(__name__)

DIMENSIONS = 256
BATCH_SIZE = 100  # API limit per batchEmbedContents call
QUERY_CACHE_SIZE = 256
CONFIDENT_Z = 3.5  # best match must stand out this much for the query to be meaningful


# ---------------------------------------------------------------- vectors
def normalise(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


def quantise(vec: list[float]) -> str:
    """Unit vector -> base64 int8 (plenty of precision for ranking, ~4x smaller)."""
    return base64.b64encode(bytes((round(x * 127) & 0xFF) for x in vec)).decode()


def dequantise(data: str) -> list[float]:
    raw = base64.b64decode(data)
    return normalise([(b - 256 if b > 127 else b) / 127 for b in raw])


def dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b, strict=True))


# ---------------------------------------------------------------- documents
def document_text(track: dict) -> str:
    """What gets embedded for a session: title first, then who/what, then the abstract."""
    parts = [
        track['title'],
        track.get('speaker_raw') or '',
        ', '.join(track.get('badges') or []),
        (track.get('description') or '')[:1500],
    ]
    return '\n'.join(p for p in parts if p)


def content_hash(text: str, model: str) -> str:
    return hashlib.sha1(f'{model}\n{DIMENSIONS}\n{text}'.encode()).hexdigest()[:16]


# ---------------------------------------------------------------- Gemini
def embed(settings: GeminiSettings, texts: list[str], task: str) -> list[list[float]]:
    """Embed texts with ``task`` = RETRIEVAL_DOCUMENT or RETRIEVAL_QUERY."""
    if not settings.enabled:
        raise GeminiError('GEMINI_API_KEY is not set on the server.')
    model = f'models/{settings.embed_model}'
    vectors: list[list[float]] = []
    for i in range(0, len(texts), BATCH_SIZE):
        request = {'model': model, 'taskType': task, 'outputDimensionality': DIMENSIONS}
        body = {'requests': [{**request, 'content': {'parts': [{'text': t}]}} for t in texts[i : i + BATCH_SIZE]]}
        req = urllib.request.Request(
            f'{API_BASE}/{settings.embed_model}:batchEmbedContents',
            data=json.dumps(body).encode(),
            method='POST',
            headers={'Content-Type': 'application/json', 'x-goog-api-key': settings.api_key},
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                vectors += [normalise(e['values']) for e in json.load(resp)['embeddings']]
        except urllib.error.HTTPError as e:
            raise GeminiError(f'Embedding error {e.code}: {e.read()[:300]!r}') from e
        except (urllib.error.URLError, TimeoutError) as e:
            raise GeminiError(f'Could not reach Gemini: {e}') from e
    return vectors


# ---------------------------------------------------------------- index
class SemanticIndex:
    def __init__(self, agenda: dict, cache_path: Path, settings: GeminiSettings):
        self.settings = settings
        self.cache_path = cache_path
        self.tracks = agenda['tracks']
        self.vectors: list[list[float] | None] = [None] * len(self.tracks)
        self._queries: OrderedDict[str, list[float]] = OrderedDict()
        self._lock = threading.Lock()
        self._load()

    @property
    def ready(self) -> bool:
        return self.settings.enabled and all(v is not None for v in self.vectors)

    def _texts(self):
        return [document_text(t) for t in self.tracks]

    def _load(self):
        if not self.cache_path.exists():
            return
        cache = json.loads(self.cache_path.read_text(encoding='utf-8'))
        items = cache.get('items', {})
        model = self.settings.embed_model
        for i, (track, text) in enumerate(zip(self.tracks, self._texts(), strict=True)):
            item = items.get(track['id'])
            if item and item['hash'] == content_hash(text, model):
                self.vectors[i] = dequantise(item['v'])

    def missing(self) -> int:
        return sum(v is None for v in self.vectors)

    def build(self) -> int:
        """Embed sessions that have no up-to-date vector and save the cache. Returns how many."""
        texts = self._texts()
        todo = [i for i, v in enumerate(self.vectors) if v is None]
        if todo:
            log.info('embedding %d sessions with %s…', len(todo), self.settings.embed_model)
            for i, vec in zip(todo, embed(self.settings, [texts[i] for i in todo], 'RETRIEVAL_DOCUMENT'), strict=True):
                self.vectors[i] = vec
        self._save(texts)
        return len(todo)

    def _save(self, texts: list[str]):
        model = self.settings.embed_model
        items = {
            t['id']: {'hash': content_hash(text, model), 'v': quantise(v)}
            for t, text, v in zip(self.tracks, texts, self.vectors, strict=True)
            if v is not None
        }
        payload = {'model': model, 'dimensions': DIMENSIONS, 'items': items}
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.cache_path.write_text(json.dumps(payload, indent=0, sort_keys=True) + '\n', encoding='utf-8')

    def _plenary(self, i: int) -> bool:
        """Plenaries and the pre-event masterclasses are never search results."""
        track = self.tracks[i]
        return len(track['rooms']) > 2 or bool(track.get('is_masterclass'))

    def build_in_background(self):
        def run():
            try:
                self.build()
                log.info('semantic search ready')
            except GeminiError as e:
                log.warning('semantic search unavailable: %s', e)

        threading.Thread(target=run, name='embed', daemon=True).start()

    def _query_vector(self, query: str) -> list[float]:
        key = query.strip().lower()
        with self._lock:
            if key in self._queries:
                self._queries.move_to_end(key)
                return self._queries[key]
        vec = embed(self.settings, [query], 'RETRIEVAL_QUERY')[0]
        with self._lock:
            self._queries[key] = vec
            if len(self._queries) > QUERY_CACHE_SIZE:
                self._queries.popitem(last=False)
        return vec

    def search(self, query: str, limit: int = 40) -> dict:
        """Talks ranked by similarity to the query.

        Raw cosine scores bunch together (~0.6-0.75) whatever the query, so each hit
        also gets a z-score against this query's score distribution; that's what
        separates real matches from noise. `confident` is False for gibberish or
        queries the agenda has nothing about.
        """
        q = self._query_vector(query)
        # Plenaries (lunch, concerts…) match everything vaguely; only rank real talks.
        talks = [(dot(q, v), i) for i, v in enumerate(self.vectors) if v is not None and not self._plenary(i)]
        if not talks:
            return {'confident': False, 'results': []}
        scores = [s for s, _ in talks]
        mean = sum(scores) / len(scores)
        spread = math.sqrt(sum((s - mean) ** 2 for s in scores) / len(scores)) or 1.0
        talks.sort(reverse=True)
        z = lambda score: round((score - mean) / spread, 2)  # noqa: E731
        results = [{'ref': f's{i}', 'score': round(score, 4), 'z': z(score)} for score, i in talks[:limit]]
        return {'confident': results[0]['z'] >= CONFIDENT_Z, 'results': results}
