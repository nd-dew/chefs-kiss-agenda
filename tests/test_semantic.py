import hashlib
import json
import urllib.request

import pytest

from oxp_agenda import semantic
from oxp_agenda.config import GeminiSettings

SETTINGS = GeminiSettings(api_key='test-key', embed_model='fake-embed')
VOCAB = ['invoice', 'football', 'database', 'restaurant', 'payroll', 'ai']


def fake_embed(settings, texts, task):
    """Bag-of-topics vectors: similarity == shared topic words, plus a little noise."""
    out = []
    for text in texts:
        low = text.lower()
        noise = hashlib.sha1(low.encode()).digest()
        vec = [(3.0 if w in low else 0.0) + b / 5100 for w, b in zip(VOCAB, noise, strict=False)]
        out.append(semantic.normalise(vec + [0.05] * (semantic.DIMENSIONS - len(vec))))
    return out


@pytest.fixture
def fake(monkeypatch):
    calls = []

    def embed(settings, texts, task):
        calls.append((task, len(texts)))
        return fake_embed(settings, texts, task)

    monkeypatch.setattr(semantic, 'embed', embed)
    return calls


def talk(i, title, rooms=('Hall 6.A',)):
    return {'id': f't{i}', 'title': title, 'rooms': list(rooms), 'badges': [], 'description': ''}


AGENDA = {
    'tracks': [
        talk(0, 'Invoice automation'),
        talk(1, 'Football and AI'),
        talk(2, 'Database tuning'),
        talk(3, 'Lunch break with a football screen', rooms=('A', 'B', 'C')),  # plenary
        *[talk(i, f'Unrelated session {i}') for i in range(4, 30)],
    ]
}


def test_quantise_round_trip_keeps_direction():
    vec = semantic.normalise([0.3, -0.7, 0.1, 0.0])
    back = semantic.dequantise(semantic.quantise(vec))
    assert semantic.dot(vec, back) > 0.999


def test_build_embeds_only_missing_and_caches(tmp_path, fake):
    cache = tmp_path / 'emb.json'
    index = semantic.SemanticIndex(AGENDA, cache, SETTINGS)
    assert not index.ready and index.missing() == 30
    assert index.build() == 30
    assert fake == [('RETRIEVAL_DOCUMENT', 30)]
    assert set(json.loads(cache.read_text())['items']) == {t['id'] for t in AGENDA['tracks']}

    edited = {'tracks': [dict(AGENDA['tracks'][0], title='Invoice automation v2'), *AGENDA['tracks'][1:]]}
    again = semantic.SemanticIndex(edited, cache, SETTINGS)
    assert again.missing() == 1  # only the edited talk is re-embedded


def test_search_ranks_by_meaning_and_skips_plenaries(tmp_path, fake):
    index = semantic.SemanticIndex(AGENDA, tmp_path / 'emb.json', SETTINGS)
    index.build()
    result = index.search('football match', limit=5)
    assert result['confident']
    assert result['results'][0]['ref'] == 's1'
    assert all(r['ref'] != 's3' for r in result['results'])  # plenary excluded
    assert result['results'][0]['z'] > result['results'][1]['z']


def test_query_vectors_are_cached(tmp_path, fake):
    index = semantic.SemanticIndex(AGENDA, tmp_path / 'emb.json', SETTINGS)
    index.build()
    index.search('Payroll')
    index.search('payroll ')
    assert [c for c in fake if c[0] == 'RETRIEVAL_QUERY'] == [('RETRIEVAL_QUERY', 1)]


def test_search_endpoint(tmp_path, fake, monkeypatch):
    import threading

    from oxp_agenda import config
    from oxp_agenda.server import make_server

    httpd = make_server('127.0.0.1', 0, config.WEB_DIR, config.AGENDA_PATH, SETTINGS, tmp_path / 'emb.json')
    httpd.RequestHandlerClass.keywords['chat'].index.build()
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{httpd.server_address[1]}'
    try:
        with urllib.request.urlopen(f'{base}/api/search?q=restaurant&k=3') as resp:
            data = json.load(resp)
        assert data['semantic'] is True and len(data['results']) == 3
        assert {'ref', 'score', 'z'} <= data['results'][0].keys()
        with urllib.request.urlopen(f'{base}/api/health') as resp:
            assert json.load(resp)['semantic'] is True
    finally:
        httpd.shutdown()
        httpd.server_close()
