"""Minimal streaming client for the Gemini ``streamGenerateContent`` REST endpoint."""

import json
import urllib.error
import urllib.request
from collections.abc import Iterator

from oxp_agenda.config import GeminiSettings

API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
MAX_TURNS = 24
MAX_MESSAGE_CHARS = 4000
MAX_CONTEXT_CHARS = 2000


class GeminiError(Exception):
    pass


def build_payload(system: str, messages: list[dict], context: str = '') -> dict:
    """Map chat history (role: user|assistant) to a Gemini request body.

    The app context is prepended to the last user turn rather than the system
    prompt, so the large system prompt stays identical across requests.
    """
    contents = []
    for m in messages[-MAX_TURNS:]:
        text = str(m.get('content') or '')[:MAX_MESSAGE_CHARS]
        if text:
            role = 'model' if m.get('role') == 'assistant' else 'user'
            contents.append({'role': role, 'parts': [{'text': text}]})
    if not contents or contents[-1]['role'] != 'user':
        raise ValueError('the last message must come from the user')
    if context:
        block = f'[App context]\n{context[:MAX_CONTEXT_CHARS]}\n[/App context]'
        contents[-1]['parts'].insert(0, {'text': block})
    return {
        'systemInstruction': {'parts': [{'text': system}]},
        'contents': contents,
        'generationConfig': {
            'temperature': 0.5,
            'maxOutputTokens': 4096,
            'thinkingConfig': {'thinkingLevel': 'low'},
        },
    }


def iter_sse_text(lines: Iterator[bytes]) -> Iterator[str]:
    """Extract answer text from Gemini's server-sent events, skipping thought parts."""
    for raw in lines:
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
                    yield part['text']
            reason = cand.get('finishReason')
            if reason and reason not in ('STOP', 'MAX_TOKENS'):
                raise GeminiError(f'Response stopped ({reason}).')


def stream_text(settings: GeminiSettings, payload: dict, timeout: float = 120) -> Iterator[str]:
    if not settings.enabled:
        raise GeminiError('GEMINI_API_KEY is not set on the server.')
    req = urllib.request.Request(
        f'{API_BASE}/{settings.model}:streamGenerateContent?alt=sse',
        data=json.dumps(payload).encode(),
        method='POST',
        headers={'Content-Type': 'application/json', 'x-goog-api-key': settings.api_key},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            yield from iter_sse_text(resp)
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read()).get('error', {}).get('message', str(e))
        except ValueError:
            msg = str(e)
        raise GeminiError(f'Gemini error {e.code}: {msg}') from e
    except (urllib.error.URLError, TimeoutError) as e:
        raise GeminiError(f'Could not reach Gemini: {e}') from e
