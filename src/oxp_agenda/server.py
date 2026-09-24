"""HTTP server: static front-end plus the streaming ``/api/chat`` endpoint."""

import json
import logging
import urllib.parse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from oxp_agenda import catalog, gemini
from oxp_agenda.config import GeminiSettings
from oxp_agenda.semantic import SemanticIndex

log = logging.getLogger(__name__)
MAX_BODY_BYTES = 200_000


class ChatService:
    def __init__(self, agenda_path: Path, settings: GeminiSettings, embeddings_path: Path | None = None):
        self.settings = settings
        agenda = catalog.load_agenda(agenda_path)
        self.system_prompt = catalog.build_system_prompt(agenda)
        self.index = SemanticIndex(agenda, embeddings_path, settings) if embeddings_path else None
        if self.index and settings.enabled and self.index.missing():
            self.index.build_in_background()

    def health(self) -> dict:
        semantic = bool(self.index and self.index.ready)
        return {'ai': self.settings.enabled, 'model': self.settings.model, 'semantic': semantic}

    def search(self, query: str, limit: int) -> dict:
        if not (self.index and self.index.ready):
            return {'semantic': False, 'confident': False, 'results': []}
        return {'semantic': True, **self.index.search(query, limit)}

    def stream(self, body: dict):
        payload = gemini.build_payload(self.system_prompt, body.get('messages') or [], str(body.get('context') or ''))
        return gemini.stream_text(self.settings, payload)


class Handler(SimpleHTTPRequestHandler):
    chat: ChatService

    def __init__(self, *args, chat: ChatService, **kwargs):
        self.chat = chat
        super().__init__(*args, **kwargs)

    def end_headers(self):
        if not self.path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):
        if self.path.startswith('/api/'):
            log.info('%s %s', self.address_string(), fmt % args)

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        if url.path == '/api/health':
            return self._json(200, self.chat.health())
        if url.path == '/api/search':
            params = urllib.parse.parse_qs(url.query)
            query = (params.get('q') or [''])[0].strip()[:200]
            if not query:
                return self._json(400, {'error': 'missing q'})
            try:
                limit = min(int((params.get('k') or ['40'])[0]), 100)
                return self._json(200, self.chat.search(query, limit))
            except ValueError:
                return self._json(400, {'error': 'bad k'})
            except gemini.GeminiError as e:
                return self._json(502, {'error': str(e)})
        return super().do_GET()

    def do_POST(self):
        if self.path != '/api/chat':
            return self._json(404, {'error': 'not found'})
        if not self.chat.settings.enabled:
            return self._json(503, {'error': 'GEMINI_API_KEY is not set on the server.'})
        try:
            length = min(int(self.headers.get('Content-Length') or 0), MAX_BODY_BYTES)
            chunks = self.chat.stream(json.loads(self.rfile.read(length) or b'{}'))
        except (ValueError, TypeError, AttributeError) as e:
            return self._json(400, {'error': f'bad request: {e}'})

        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Accel-Buffering', 'no')
        self.end_headers()
        try:
            try:
                for text in chunks:
                    self._event({'t': text})
                self._event({'done': True})
            except gemini.GeminiError as e:
                self._event({'error': str(e)})
        except (BrokenPipeError, ConnectionResetError):
            log.info('client disconnected mid-stream')

    def _event(self, obj: dict):
        self.wfile.write(f'data: {json.dumps(obj)}\n\n'.encode())
        self.wfile.flush()

    def _json(self, code: int, obj: dict):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def make_server(
    host: str,
    port: int,
    web_dir: Path,
    agenda_path: Path,
    settings: GeminiSettings,
    embeddings_path: Path | None = None,
):
    chat = ChatService(agenda_path, settings, embeddings_path)
    handler = partial(Handler, directory=str(web_dir), chat=chat)
    return ThreadingHTTPServer((host, port), handler)
