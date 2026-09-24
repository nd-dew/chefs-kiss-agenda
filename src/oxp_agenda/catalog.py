"""Turns the agenda dataset into the grounding prompt for the assistant.

Sessions are referenced as ``s<index>``, where index is the session's position in
``agenda.json``'s ``tracks`` list. The front-end uses the same convention to turn
``[[s123]]`` citations into clickable session cards, so keep the two in sync.
"""

import json
import re
from pathlib import Path

DESCRIPTION_LIMIT = 420


def load_agenda(path: Path) -> dict:
    with path.open(encoding='utf-8') as f:
        return json.load(f)


def short_description(text: str, limit: int = DESCRIPTION_LIMIT) -> str:
    text = re.sub(r'<[^>]*>?', '', text or '')
    text = re.sub(r'\s+', ' ', text).strip()
    if len(text) > limit:
        text = text[:limit].rsplit(' ', 1)[0] + '…'
    return text


def catalog_line(index: int, track: dict) -> str:
    room = 'All venues (plenary)' if len(track['rooms']) > 2 else track['room_str']
    fields = [
        f's{index}',
        f'{track["short_label"]} {track["start_time"]}-{track["end_time"]}',
        room,
        track['title'],
        track.get('speaker_raw') or track.get('speaker') or '',
        'tags: ' + ', '.join(track['badges']) if track['badges'] else '',
        'video' if track.get('youtube_id') else '',
        short_description(track.get('description', '')),
    ]
    return ' | '.join(f for f in fields if f)


def build_catalog(agenda: dict) -> str:
    return '\n'.join(catalog_line(i, t) for i, t in enumerate(agenda['tracks']))


def build_system_prompt(agenda: dict) -> str:
    days = ', '.join(d['label'] + (' (masterclasses only)' if d['is_masterclass'] else '') for d in agenda['days'])
    return f"""You are the friendly schedule assistant inside the {agenda['event_title']} agenda app \
({agenda['location']}, times are {agenda['timezone']}). Conference days: {days}.

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
{build_catalog(agenda)}
"""
