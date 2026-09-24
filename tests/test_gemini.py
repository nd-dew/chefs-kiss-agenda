import json

import pytest

from oxp_agenda import gemini
from oxp_agenda.config import GeminiSettings


def test_payload_maps_roles_and_prepends_context_to_last_user_turn():
    payload = gemini.build_payload(
        'SYSTEM',
        [
            {'role': 'user', 'content': 'hi'},
            {'role': 'assistant', 'content': 'hello'},
            {'role': 'user', 'content': 'q'},
        ],
        context='Now: 14:10',
    )
    assert payload['systemInstruction'] == {'parts': [{'text': 'SYSTEM'}]}
    assert [c['role'] for c in payload['contents']] == ['user', 'model', 'user']
    last = payload['contents'][-1]['parts']
    assert last[0]['text'].startswith('[App context]\nNow: 14:10')
    assert last[1] == {'text': 'q'}


def test_payload_trims_history_and_long_messages():
    msgs = [{'role': 'user', 'content': 'x' * 10_000}] * 50
    payload = gemini.build_payload('S', msgs)
    assert len(payload['contents']) == gemini.MAX_TURNS
    assert len(payload['contents'][-1]['parts'][0]['text']) == gemini.MAX_MESSAGE_CHARS


@pytest.mark.parametrize('messages', [[], [{'role': 'assistant', 'content': 'hi'}], [{'role': 'user', 'content': ''}]])
def test_payload_requires_a_final_user_message(messages):
    with pytest.raises(ValueError):
        gemini.build_payload('S', messages)


def sse(obj) -> bytes:
    return f'data: {json.dumps(obj)}\n'.encode()


def test_sse_text_skips_thoughts_and_blank_lines():
    lines = [
        sse({'candidates': [{'content': {'parts': [{'text': 'thinking…', 'thought': True}, {'text': 'Hel'}]}}]}),
        b'\n',
        sse(
            {
                'candidates': [
                    {
                        'content': {'parts': [{'text': 'lo'}, {'text': '', 'thoughtSignature': 'x'}]},
                        'finishReason': 'STOP',
                    }
                ]
            }
        ),
    ]
    assert ''.join(gemini.iter_sse_text(iter(lines))) == 'Hello'


def test_sse_text_raises_on_blocked_answer():
    lines = [sse({'candidates': [{'content': {'parts': []}, 'finishReason': 'SAFETY'}]})]
    with pytest.raises(gemini.GeminiError, match='SAFETY'):
        list(gemini.iter_sse_text(iter(lines)))


def test_stream_text_without_key_fails_fast():
    with pytest.raises(gemini.GeminiError, match='GEMINI_API_KEY'):
        list(gemini.stream_text(GeminiSettings(api_key=None), {}))
