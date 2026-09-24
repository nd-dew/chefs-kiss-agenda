# OXP 2026 Agenda

A clean, fast explorer for the **Odoo Experience 2026** schedule (484 sessions, Sep 22–26, Brussels Expo),
with a timetable view, rich filtering, a personal schedule and a Gemini-powered assistant that knows every talk.

- **Timetable** (default): rooms × time, sticky headers, keynotes/lunch as full-width bands, a live "now" line
- **List** (default on phones) and **Saved** views; overlap detection; Google Calendar / `.ics` export
- **Filters**: room (grouped by venue), track, level, language, format, any tag, has video, saved, hide past,
  all with live counts; full-text search; state kept in the URL so views can be shared
- **Details**: hover card on desktop, side panel with speaker, abstract, video and related talks
- **Ask AI** (`A`): answers grounded on the full agenda; cited sessions appear as clickable, starrable cards
- Dark/light themes, mobile-first layout, keyboard shortcuts

## Quick start

Requires [uv](https://docs.astral.sh/uv/). Runtime is stdlib-only Python; there is no front-end build step.

```bash
export GEMINI_API_KEY=...          # optional: enables the assistant
uv run oxp-agenda serve            # http://127.0.0.1:9099
```

`serve` binds to localhost by default because it proxies your API key. Use `--host 0.0.0.0` to open it from a
phone on the same network, and `-p` to pick another port. The model defaults to `gemini-flash-latest`
(override with `GEMINI_MODEL`).

Add `?now=2026-09-24T14:10` to the URL to preview the live "now" state at any moment.

## Refreshing the data

```bash
uv run oxp-agenda scrape            # uses cached pages in ~/.cache/oxp-agenda
uv run oxp-agenda scrape --refresh  # download everything again
```

This parses the agenda tables on odoo.com and every talk page (description, speaker bio, photo, video), then
writes `web/data/agenda.json`.

## How the assistant works

`POST /api/chat` streams server-sent events from Gemini. The system prompt contains a compact catalog of all
sessions (`s<index> | day time | room | title | speaker | tags | video | description`); `<index>` is the
session's position in `agenda.json`. The model cites sessions as `[[s123]]`, and the front-end uses the same
numbering to render them as cards. Each question also carries a small context block (current Brussels time,
the day and filters being viewed, saved sessions, the open session), so questions like "what's next?" or
"check my schedule for clashes" work.

The catalog is about 70k tokens and is sent with every question, so each question costs more than a short
prompt would.

## Keyboard shortcuts

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| `/` | Search | `G` / `L` / `S` | Timetable / List / Saved |
| `1`–`5`, `←` `→` | Change day | `N` | Jump to now |
| `A` | Ask AI | `D` | Toggle dark mode |
| `Esc` | Close menu, panel or chat; clear search | | |

## Project layout

```text
src/oxp_agenda/        Python package (CLI: oxp-agenda)
  cli.py               serve | scrape
  config.py            paths and GeminiSettings (env)
  server.py            static files + /api/chat, /api/health
  gemini.py            request building and SSE streaming
  catalog.py           agenda -> assistant system prompt
  scraper.py           odoo.com agenda + talk pages -> agenda.json
web/                   the app (served as-is)
  index.html
  css/app.css          @imports tokens, base, one file per component, responsive
  js/app.js            entry: render loop, actions, event wiring
  js/agenda.js         dataset prep      js/state.js     filters, saved, URL hash
  js/taxonomy.js       tags -> tracks…   js/calendar.js  Google Calendar / .ics
  js/views/            timetable, list, saved, shared parts
  js/ui/               filter bar & theme, facet menu, popover, drawer, toast
  js/chat/             panel, SSE client, safe Markdown renderer
  js/lib/              html, time, storage, dom, event bus
  data/agenda.json
tests/                 pytest (Python + runs tests/js) · js/ node:test · e2e/ Playwright
```

## Development

```bash
uv run pytest                          # Python tests + front-end unit tests (needs node)
uv run ruff check . && uv run ruff format --check .
uv run --group e2e playwright install chromium   # once
uv run --group e2e pytest -m e2e       # browser smoke tests (Gemini is faked)
```
