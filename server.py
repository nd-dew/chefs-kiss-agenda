#!/usr/bin/env python3
"""OXP 2026 Agenda server: serves the static app and proxies /api/chat to Gemini.

The Gemini key stays server-side (GEMINI_API_KEY env var). The whole agenda is
sent as a compact catalog in the system instruction so answers are grounded in
the real schedule; the model cites sessions as [[s<index>]] which the front-end
turns into clickable session cards.

Usage: GEMINI_API_KEY=... python3 server.py [port]
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
MODEL = os.environ.get('GEMINI_MODEL', 'gemini-flash-latest')
API_KEY = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_GENERATIVE_AI_API_KEY')
GEMINI_URL = f'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:streamGenerateContent?alt=sse'
MAX_TURNS = 24
MAX_MSG_CHARS = 4000


def build_catalog():
    with open(os.path.join(ROOT, 'data', 'agenda.json'), encoding='utf-8') as f:
        data = json.load(f)
    lines = []
    for i, t in enumerate(data['tracks']):
        desc = re.sub(r'\s*<div\s*$', '', t.get('description') or '')
        desc = re.sub(r'<[^>]*>?', '', desc)
        desc = re.sub(r'\s+', ' ', desc).strip()
        if len(desc) > 420:
            desc = desc[:420].rsplit(' ', 1)[0] + '…'
        room = 'All venues (plenary)' if len(t['rooms']) > 2 else t['room_str']
        speaker = t.get('speaker_raw') or t.get('speaker') or ''
        parts = [
            f"s{i}",
            f"{t['short_label']} {t['start_time']}-{t['end_time']}",
            room,
            t['title'],
            speaker,
            'tags: ' + ', '.join(t['badges']) if t['badges'] else '',
            'video' if t.get('youtube_id') else '',
            desc,
        ]
        lines.append(' | '.join(p for p in parts if p))
    days = ', '.join(f"{d['label']}{' (masterclasses only)' if d['is_masterclass'] else ''}" for d in data['days'])
    return data, days, '\n'.join(lines)


DATA, DAYS, CATALOG = build_catalog()

SYSTEM = f"""You are the friendly schedule assistant inside the Odoo Experience 2026 agenda app \
({DATA['location']}, times are Europe/Brussels). Conference days: {DAYS}.

You help attendees find talks, compare sessions, plan their day, and learn what a talk is about.

Rules:
- Only use the session catalog below. If something isn't in it, say so; never invent sessions, speakers, times or rooms.
- Every time you mention a specific session, write its reference exactly like [[s123]]. The app renders each \
reference as a clickable card showing title, day, time and room, so don't restate those unless it helps \
(e.g. for comparing times or pointing out a clash).
- Be concise and scannable: short intro, then bullets. Each bullet: the reference, then a one-line reason. \
Recommend at most ~8 sessions unless asked for more.
- When planning a schedule, avoid time overlaps, mention when two picks clash, and prefer sessions later than \
the current time when the day is today.
- Each user message may start with an [App context] block (current time, the day being viewed, saved sessions, \
the open session). Use it silently; don't repeat it back.
- Answer in the user's language. Use plain Markdown (bold, bullets); no tables, no headings larger than ###.

Catalog format: ref | day time | room | title | speaker(s) | tags | video available | description

SESSION CATALOG
{CATALOG}
"""


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        if not self.path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):
        if '/api/' in (args[0] if args else ''):
            super().log_message(fmt, *args)

    def do_GET(self):
        if self.path == '/api/health':
            return self._json(200, {'ai': bool(API_KEY), 'model': MODEL})
        return super().do_GET()

    def do_POST(self):
        if self.path != '/api/chat':
            return self._json(404, {'error': 'not found'})
        if not API_KEY:
            return self._json(503, {'error': 'GEMINI_API_KEY is not set on the server.'})
        try:
            length = int(self.headers.get('Content-Length') or 0)
            body = json.loads(self.rfile.read(min(length, 200_000)) or b'{}')
            msgs = body.get('messages') or []
            context = str(body.get('context') or '')[:2000]
        except (ValueError, TypeError):
            return self._json(400, {'error': 'bad request'})

        contents = []
        for m in msgs[-MAX_TURNS:]:
            role = 'model' if m.get('role') == 'assistant' else 'user'
            text = str(m.get('content') or '')[:MAX_MSG_CHARS]
            if text:
                contents.append({'role': role, 'parts': [{'text': text}]})
        if not contents or contents[-1]['role'] != 'user':
            return self._json(400, {'error': 'last message must be from the user'})
        if context:
            contents[-1]['parts'].insert(0, {'text': f'[App context]\n{context}\n[/App context]'})

        payload = {
            'systemInstruction': {'parts': [{'text': SYSTEM}]},
            'contents': contents,
            'generationConfig': {
                'temperature': 0.5,
                'maxOutputTokens': 4096,
                'thinkingConfig': {'thinkingLevel': 'low'},
            },
        }

        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Accel-Buffering', 'no')
        self.end_headers()
        try:
            self._relay(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _relay(self, payload):
        req = urllib.request.Request(
            GEMINI_URL, data=json.dumps(payload).encode(), method='POST',
            headers={'Content-Type': 'application/json', 'x-goog-api-key': API_KEY},
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                for raw in resp:
                    line = raw.decode('utf-8', 'replace').strip()
                    if not line.startswith('data:'):
                        continue
                    try:
                        chunk = json.loads(line[5:])
                    except ValueError:
                        continue
                    for cand in chunk.get('candidates') or []:
                        for part in (cand.get('content') or {}).get('parts') or []:
                            if part.get('text') and not part.get('thought'):
                                self._event({'t': part['text']})
                        reason = cand.get('finishReason')
                        if reason and reason not in ('STOP', 'MAX_TOKENS'):
                            self._event({'error': f'Response stopped ({reason}).'})
            self._event({'done': True})
        except urllib.error.HTTPError as e:
            try:
                msg = json.loads(e.read()).get('error', {}).get('message', str(e))
            except ValueError:
                msg = str(e)
            self._event({'error': f'Gemini error {e.code}: {msg}'})
        except (urllib.error.URLError, TimeoutError) as e:
            self._event({'error': f'Could not reach Gemini: {e}'})

    def _event(self, obj):
        self.wfile.write(f'data: {json.dumps(obj)}\n\n'.encode())
        self.wfile.flush()

    def _json(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9099
    httpd = ThreadingHTTPServer(('0.0.0.0', port), partial(Handler, directory=ROOT))
    print(f'OXP agenda on http://127.0.0.1:{port}  (AI: {"on, " + MODEL if API_KEY else "off — set GEMINI_API_KEY"}; '
          f'catalog {len(CATALOG) // 1000}k chars)', flush=True)
    httpd.serve_forever()


if __name__ == '__main__':
    main()
