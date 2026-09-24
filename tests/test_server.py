import json
import urllib.error
import urllib.request

import pytest


def get(url):
    with urllib.request.urlopen(url, timeout=5) as resp:
        return resp.status, resp.headers, resp.read()


def post_chat(url, body):
    req = urllib.request.Request(
        f'{url}/api/chat', data=json.dumps(body).encode(), method='POST', headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def events(raw: str) -> list[dict]:
    return [json.loads(line[5:]) for line in raw.splitlines() if line.startswith('data:')]


def test_serves_the_front_end(server):
    status, headers, body = get(f'{server}/')
    assert status == 200 and b'js/app.js' in body
    assert headers['Cache-Control'] == 'no-cache'
    status, headers, _ = get(f'{server}/js/app.js')
    assert status == 200 and 'javascript' in headers['Content-Type']
    status, _, body = get(f'{server}/data/agenda.json')
    assert json.loads(body)['total_tracks'] == 484


def test_health_reports_ai_status(server, server_without_key):
    assert json.loads(get(f'{server}/api/health')[2]) == {'ai': True, 'model': 'fake'}
    assert json.loads(get(f'{server_without_key}/api/health')[2])['ai'] is False


def test_chat_streams_events_and_sends_grounded_prompt(server, fake_gemini):
    status, raw = post_chat(server, {'messages': [{'role': 'user', 'content': 'AI talks?'}], 'context': 'Now: 14:10'})
    assert status == 200
    assert events(raw) == [{'t': 'Try '}, {'t': '[[s0]] and [[s5]].'}, {'done': True}]
    payload = fake_gemini[0]
    assert 'SESSION CATALOG' in payload['systemInstruction']['parts'][0]['text']
    assert payload['contents'][-1]['parts'][0]['text'].startswith('[App context]')


def test_chat_rejects_bad_requests(server):
    assert post_chat(server, {'messages': []})[0] == 400
    assert post_chat(server, {'messages': 'nope'})[0] == 400


def test_chat_without_key_is_unavailable(server_without_key):
    status, raw = post_chat(server_without_key, {'messages': [{'role': 'user', 'content': 'hi'}]})
    assert status == 503 and 'GEMINI_API_KEY' in raw


def test_unknown_api_route_is_404(server):
    req = urllib.request.Request(f'{server}/api/nope', data=b'{}', method='POST')
    with pytest.raises(urllib.error.HTTPError) as err:
        urllib.request.urlopen(req, timeout=5)
    assert err.value.code == 404
