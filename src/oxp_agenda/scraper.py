"""Scrapes the OXP 2026 agenda page and every talk page into ``agenda.json``.

The agenda is an HTML table per day (15-minute rows, one column per room, with
row/colspans); talk pages add the description, speaker bio, avatar and video.
Downloaded pages are cached so re-runs are fast and offline-friendly.
"""

import hashlib
import json
import logging
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from html import unescape
from pathlib import Path

from oxp_agenda.config import AGENDA_URL, ODOO_BASE_URL

log = logging.getLogger(__name__)

USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
SLOT_MINUTES = 15
MAX_NAME = 200
MASTERCLASS_ROOMS = [f'Masterclass Room {i + 1}' for i in range(8)]


def _day(date: str, weekday: str, start: str, table_idx: int, masterclass: bool = False) -> dict:
    day = int(date[-2:])
    h, m = map(int, start.split(':'))
    return {
        'date': date,
        'label': f'{weekday}, Sep {day}',
        'short_label': f'{weekday[:3]} Sep {day}',
        'is_masterclass': masterclass,
        'start_min': h * 60 + m,  # time of the first 15-minute row in that day's table
        'table_idx': table_idx,
    }


DAYS = [
    _day('2026-09-22', 'Tuesday', '09:00', 1, masterclass=True),
    _day('2026-09-23', 'Wednesday', '09:00', 2, masterclass=True),
    _day('2026-09-24', 'Thursday', '07:30', 3),
    _day('2026-09-25', 'Friday', '07:30', 4),
    _day('2026-09-26', 'Saturday', '08:00', 5),
]


# ---------------------------------------------------------------- fetching
@dataclass
class PageCache:
    root: Path
    refresh: bool = False

    def path_for(self, url: str) -> Path:
        name = re.sub(r'[^a-zA-Z0-9_\-]', '_', url.removeprefix(ODOO_BASE_URL).strip('/')) or 'index'
        if len(name) > MAX_NAME:  # some talk slugs exceed the filesystem's 255-byte name limit
            name = f'{name[: MAX_NAME - 13]}-{hashlib.sha1(name.encode()).hexdigest()[:12]}'
        return self.root / f'{name}.html'

    def get(self, url: str, timeout: float = 15) -> str:
        path = self.path_for(url)
        if path.exists() and not self.refresh:
            return path.read_text(encoding='utf-8')
        full = url if url.startswith('http') else ODOO_BASE_URL + url
        req = urllib.request.Request(full, headers={'User-Agent': USER_AGENT})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(html, encoding='utf-8')
        return html


# ---------------------------------------------------------------- parsing helpers
def strip_tags(html: str) -> str:
    return unescape(re.sub(r'<[^>]+>', '', html)).strip()


def clean_html(raw: str) -> str:
    """HTML fragment -> plain text with paragraph breaks."""
    if not raw:
        return ''
    text = re.sub(r'<(script|style)[^>]*>[\s\S]*?</\1>', ' ', raw)
    text = re.sub(r'<[^>]*$', '', text)  # fragments are cut at arbitrary offsets: drop an unterminated tag
    text = re.sub(r'<br\s*/?>', '\n', text)
    text = re.sub(r'</p>', '\n\n', text)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = unescape(text)
    lines = (re.sub(r'[ \t]+', ' ', line).strip() for line in text.split('\n'))
    return '\n'.join(line for line in lines if line).strip()


def hhmm(minutes: int) -> str:
    return f'{minutes // 60:02d}:{minutes % 60:02d}'


# ---------------------------------------------------------------- agenda tables
def parse_cell(td_inner: str) -> dict:
    title_m = re.search(
        r'class="o_we_agenda_card_title[^"]*"[\s\S]*?(?:<a[^>]*href="([^"]*)"[^>]*>|<span[^>]*>)([\s\S]*?)(?:</a>|</span>)',
        td_inner,
    )
    url = (title_m.group(1) or '') if title_m else ''
    title = re.sub(r'\s+', ' ', strip_tags(title_m.group(2))) if title_m else 'Untitled'

    speaker_m = re.search(r'<div class="opacity-75 text-center">[\s\S]*?<small>([\s\S]*?)</small>', td_inner)
    speaker_raw = strip_tags(speaker_m.group(1)) if speaker_m else ''
    name, _, role = speaker_raw.partition(',')

    badges = []
    for b in re.findall(r'<span[^>]*class="[^"]*badge[^"]*"[^>]*>([\s\S]*?)</span>', td_inner):
        b = strip_tags(b)
        if b and b not in badges:
            badges.append(b)
    return {
        'title': title,
        'url': url,
        'speaker_raw': speaker_raw,
        'speaker': name.strip(),
        'speaker_role': role.strip(),
        'badges': badges,
    }


def parse_day(table_html: str, day: dict, counter_start: int = 0) -> list[dict]:
    rows = re.findall(r'<tr[^>]*>([\s\S]*?)</tr>', table_html)
    rooms = [r for r in (strip_tags(th) for th in re.findall(r'<th[^>]*>([\s\S]*?)</th>', rows[0])) if r]
    rooms = rooms or MASTERCLASS_ROOMS

    occupied: set[tuple[int, int]] = set()
    tracks = []
    counter = counter_start
    for r_idx, row_html in enumerate(rows[1:]):
        col = 0
        for m in re.finditer(r'<td([^>]*)>([\s\S]*?)</td>', row_html):
            attrs, inner = m.groups()
            while (r_idx, col) in occupied:
                col += 1
            rowspan = int(m_.group(1)) if (m_ := re.search(r'rowspan="(\d+)"', attrs)) else 1
            colspan = int(m_.group(1)) if (m_ := re.search(r'colspan="(\d+)"', attrs)) else 1
            occupied.update((r, c) for r in range(r_idx, r_idx + rowspan) for c in range(col, col + colspan))

            if col > 0 and 'event_track' in attrs:
                start = day['start_min'] + r_idx * SLOT_MINUTES
                duration = rowspan * SLOT_MINUTES
                first_room = col - 1
                assigned = rooms[first_room : first_room + colspan] if first_room < len(rooms) else ['General']
                cell = parse_cell(inner)
                tracks.append(
                    {
                        'id': f'track_{day["date"]}_{hhmm(start).replace(":", "")}_{col}_{counter}',
                        'title': cell['title'],
                        'url': cell['url'],
                        'speaker': cell['speaker'],
                        'speaker_role': cell['speaker_role'],
                        'speaker_raw': cell['speaker_raw'],
                        'speaker_avatar': '',
                        'speaker_bio': '',
                        'description': '',
                        'youtube_id': '',
                        'day': day['date'],
                        'day_label': day['label'],
                        'short_label': day['short_label'],
                        'is_masterclass': day['is_masterclass'],
                        'start_time': hhmm(start),
                        'end_time': hhmm(start + duration),
                        'duration_min': duration,
                        'rooms': assigned,
                        'room_str': ', '.join(assigned),
                        'badges': cell['badges'],
                    }
                )
                counter += 1
            col += colspan
    return tracks


def parse_agenda(html: str) -> list[dict]:
    tables = re.split(r'<table id="table_search"', html)
    tracks: list[dict] = []
    for day in DAYS:
        tracks += parse_day(tables[day['table_idx']].split('</table>')[0], day, counter_start=len(tracks))
    return tracks


# ---------------------------------------------------------------- talk pages
def parse_track_page(html: str) -> dict:
    yt = re.search(r'data-youtube-video-id="([^"]+)"', html)
    avatar = re.search(r'<img[^>]+src="(https://odoocdn\.com/web/image/event\.track/[^"]+)"', html)

    start = html.find('class="o_wesession_track_main_description')
    end = html.find('id="oe_structure_wesession_track_index_2', start)
    block = html[start:end] if start != -1 and end != -1 else ''

    bio = description = ''
    if '<hr' in block:
        speaker_part, desc_part = re.split(r'<hr[^>]*>', block, maxsplit=1)
        if bios := re.findall(r'<div class="oe_no_empty">([\s\S]*?)</div>', speaker_part):
            bio = clean_html(bios[-1])
        description = clean_html(desc_part)
    elif block:
        if parts := re.findall(r'<div class="(?:my-2\s+)?oe_no_empty">([\s\S]*?)</div>', block):
            description = clean_html('\n\n'.join(parts))
        else:
            header_end = block.find('</div>\n            </div>')
            description = clean_html(block[header_end + 22 :] if header_end != -1 else block)

    return {
        'youtube_id': yt.group(1) if yt else '',
        'speaker_avatar': avatar.group(1) if avatar else '',
        'description': description,
        'speaker_bio': bio,
    }


def enrich(tracks: list[dict], cache: PageCache, workers: int = 16) -> int:
    """Fill in talk-page details in place. Returns the number of pages that failed."""
    urls = sorted({t['url'] for t in tracks if t['url']})

    def fetch(url: str) -> tuple[str, dict | None]:
        try:
            return url, parse_track_page(cache.get(url))
        except OSError as e:
            log.warning('failed %s: %s', url, e)
            return url, None

    with ThreadPoolExecutor(max_workers=workers) as pool:
        details = dict(pool.map(fetch, urls))

    for t in tracks:
        for key, value in (details.get(t['url']) or {}).items():
            if value:
                t[key] = value
    return sum(1 for d in details.values() if d is None)


# ---------------------------------------------------------------- entry point
def scrape(out_path: Path, cache_dir: Path, refresh: bool = False, workers: int = 16) -> dict:
    cache = PageCache(cache_dir, refresh=refresh)
    tracks = parse_agenda(cache.get(AGENDA_URL))
    log.info('parsed %d sessions, fetching talk pages…', len(tracks))
    failed = enrich(tracks, cache, workers=workers)
    if failed:
        log.warning('%d talk pages could not be fetched', failed)

    agenda = {
        'event_title': 'Odoo Experience 2026',
        'location': 'Brussels Expo, Belgium',
        'timezone': 'Europe/Brussels',
        'total_tracks': len(tracks),
        'days': DAYS,
        'rooms': sorted({r for t in tracks for r in t['rooms']}),
        'badges': sorted({b for t in tracks for b in t['badges']}),
        'tracks': tracks,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(agenda, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    log.info('wrote %d sessions to %s', len(tracks), out_path)
    return agenda
