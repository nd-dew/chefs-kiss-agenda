import json
import threading

import pytest

from oxp_agenda import config, gemini
from oxp_agenda.config import GeminiSettings
from oxp_agenda.server import make_server


@pytest.fixture(scope='session')
def agenda() -> dict:
    return json.loads(config.AGENDA_PATH.read_text(encoding='utf-8'))


@pytest.fixture
def fake_gemini(monkeypatch):
    """Replace the Gemini call with canned chunks; records the payloads sent."""
    calls = []

    def stream_text(settings, payload, timeout=120):
        calls.append(payload)
        yield 'Try '
        yield '[[s0]] and [[s5]].'

    monkeypatch.setattr(gemini, 'stream_text', stream_text)
    return calls


def _serve(settings):
    httpd = make_server('127.0.0.1', 0, config.WEB_DIR, config.AGENDA_PATH, settings)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd, f'http://127.0.0.1:{httpd.server_address[1]}'


@pytest.fixture
def server(fake_gemini):
    """App server with a fake API key and the fake Gemini stream."""
    httpd, url = _serve(GeminiSettings(api_key='test-key', model='fake'))
    yield url
    httpd.shutdown()
    httpd.server_close()


@pytest.fixture
def server_without_key():
    httpd, url = _serve(GeminiSettings(api_key=None))
    yield url
    httpd.shutdown()
    httpd.server_close()
