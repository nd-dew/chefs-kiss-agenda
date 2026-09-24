"""Who's presenting: Odoo staff, external speakers, or both.

Most sessions say it themselves in the agenda ("X from Odoo", "CEO at Dynapps",
an Odoo login like "(pian)"), and Odoo's own tags help (Internal vs Community,
Partner, Invited Speaker, Influencer). Speakers whose listing names no company
are looked up online with Gemini + Google Search. The result is written to
``web/data/affiliations.json``: {session id: {"kind": "odoo"|"external"|"mixed",
"orgs": [...], "source": "agenda"|"web"}}.
"""

import json
import logging
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

from oxp_agenda.config import GeminiSettings
from oxp_agenda.gemini import API_BASE, GeminiError

log = logging.getLogger(__name__)

EXTERNAL_TAGS = {'Community', 'Community Talk', 'Partner', 'Partner talk', 'Invited Speaker', 'Influencer'}
ODOO_TAGS = {'Internal'}
WEB_BATCH = 8

# "Name from Company", "Role at Company", "@Company", "chez Company"
ORG_RE = re.compile(r'(?:(?:\bfrom|\bat|\bchez)\s+|@\s*)([^\s,&|()][^,&|()]*?)\s*(?=$|,|&|\||\(|\bfrom\b|\bat\b)', re.I)
ODOO_LOGIN_RE = re.compile(r'\((?:[a-z]{2,5})\)')  # Odoo staff sign with their login, e.g. "(pian)"
ODOO_TAIL_RE = re.compile(r'\bOdoo(?:\s+S\.?A\.?)?\s*$', re.I)


def _is_odoo(org: str) -> bool:
    return bool(re.fullmatch(r'odoo(\s+s\.?a\.?|\s+belgium|\s+inc\.?)?', org.strip().lower()))


def from_agenda(track: dict) -> dict | None:
    """Classify from the agenda text and tags alone; None if there's no evidence."""
    raw = (track.get('speaker_raw') or '').strip()
    if not raw:
        return None
    names = {n.strip().lower() for n in re.split(r'&|,', raw.split(',')[0])}
    # Ignore "companies" that are really a speaker's own name (a glitch in some Odoo listings).
    orgs = [o.strip(' .') for o in ORG_RE.findall(raw) if o.strip(' .').lower() not in names]
    odoo = any(_is_odoo(o) for o in orgs) or bool(ODOO_LOGIN_RE.search(raw) or ODOO_TAIL_RE.search(raw))
    others = sorted({o for o in orgs if not _is_odoo(o)})
    tags = set(track.get('badges') or [])
    if odoo and others:
        kind = 'mixed'
    elif odoo or tags & ODOO_TAGS:
        kind = 'odoo'
    elif others or tags & EXTERNAL_TAGS:
        kind = 'external'
    else:
        return None
    return {'kind': kind, 'orgs': (['Odoo'] if kind != 'external' else []) + others, 'explicit': bool(orgs) or odoo}


# ---------------------------------------------------------------- web lookup
def _ask(settings: GeminiSettings, prompt: str, retries: int = 4) -> str:
    body = {
        'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
        'tools': [{'google_search': {}}],
        'generationConfig': {'temperature': 0},
    }
    req = urllib.request.Request(
        f'{API_BASE}/{settings.model}:generateContent',
        data=json.dumps(body).encode(),
        method='POST',
        headers={'Content-Type': 'application/json', 'x-goog-api-key': settings.api_key},
    )
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                data = json.load(resp)
            parts = data['candidates'][0]['content']['parts']
            return ''.join(p.get('text', '') for p in parts if not p.get('thought'))
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 503) or attempt == retries - 1:
                raise GeminiError(f'Gemini error {e.code}') from e
        except (urllib.error.URLError, TimeoutError, KeyError) as e:
            if attempt == retries - 1:
                raise GeminiError(f'Gemini lookup failed: {e}') from e
        time.sleep(10 * (attempt + 1))
    raise GeminiError('unreachable')


def lookup_online(settings: GeminiSettings, people: list[str]) -> list[dict | None]:
    """For each 'Name, headline' string, ask Gemini (with Google Search) who employs them."""
    listing = '\n'.join(f'{i}. {p}' for i, p in enumerate(people))
    prompt = (
        'Use Google Search to look up EACH person below; they are speakers at Odoo Experience 2026 in Brussels. '
        'Find their current employer or role. Do not guess from memory.\n'
        'Answer ONLY with a JSON array of objects {"i": number, "odoo": true|false|null, "employer": string|null}, '
        'where "odoo" is true only if they are employed by Odoo S.A., false if they work elsewhere or independently, '
        'null if you could not find them.\n\n' + listing
    )
    text = _ask(settings, prompt)
    match = re.search(r'\[.*\]', text, re.S)
    answers = {a['i']: a for a in json.loads(match.group(0))} if match else {}
    return [answers.get(i) for i in range(len(people))]


# ---------------------------------------------------------------- build
def build(agenda: dict, out_path: Path, settings: GeminiSettings | None = None) -> dict:
    """Classify every talk; speakers without an explicit company are checked online when a key is set."""
    previous = json.loads(out_path.read_text(encoding='utf-8')) if out_path.exists() else {}
    result: dict[str, dict] = {}
    to_check: list[tuple[str, str]] = []  # (session id, speaker text)
    for t in agenda['tracks']:
        if t.get('is_masterclass') or len(t['rooms']) > 2:
            continue
        guess = from_agenda(t)
        if guess is None:
            continue
        explicit = guess.pop('explicit')
        result[t['id']] = {**guess, 'source': 'agenda'}
        if not explicit:
            if previous.get(t['id'], {}).get('source') == 'web':
                result[t['id']] = previous[t['id']]  # already looked up
            else:
                to_check.append((t['id'], t['speaker_raw']))

    if to_check and settings and settings.enabled:
        people = sorted({raw for _, raw in to_check})
        found: dict[str, dict] = {}
        for i in range(0, len(people), WEB_BATCH):
            batch = people[i : i + WEB_BATCH]
            log.info('looking up %d speakers online (%d/%d)…', len(batch), i + len(batch), len(people))
            try:
                for person, answer in zip(batch, lookup_online(settings, batch), strict=True):
                    if answer and answer.get('odoo') is not None:
                        found[person] = answer
            except (GeminiError, ValueError) as e:
                log.warning('online lookup failed for a batch: %s', e)
        for sid, raw in to_check:
            if answer := found.get(raw):
                employer = (answer.get('employer') or '').strip()
                kind = 'odoo' if answer['odoo'] else 'external'
                orgs = ['Odoo'] if kind == 'odoo' else ([employer] if employer else [])
                result[sid] = {'kind': kind, 'orgs': orgs, 'source': 'web'}

    out_path.write_text(json.dumps(result, indent=1, ensure_ascii=False, sort_keys=True) + '\n', encoding='utf-8')
    return result
