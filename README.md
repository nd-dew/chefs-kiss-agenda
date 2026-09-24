# OXP 2026 Agenda

A clean, fast explorer for the **Odoo Experience 2026** schedule (468 talks, Sep 24–26, Brussels Expo; the pre-event masterclass days are left out),
with a timetable view, rich filtering, a personal schedule and a Gemini-powered assistant that knows every talk.

- **Timetable** (default): rooms × time, sticky headers, keynotes/lunch as full-width bands, a live "now" line;
  hours before 10:00 and after 18:00 (only welcome, keynotes, dinner and concerts) are squeezed
- **List** (default on phones) and **Saved** views; overlap detection; Google Calendar / `.ics` export
- **One-row header**: days, search, 🇬🇧 🇫🇷 🇳🇱 language flags (toggle any combination) and one **Filters** panel
  with just topic, level, room (grouped by venue), saved and hide past, all with live counts. Active filters show
  as removable chips. Everything is kept in the URL, so views can be shared
- **Smart search**: instant keyword matches; if the day has few or none, results widen automatically to other days
  and then to talks *related by meaning* (Gemini embeddings), e.g. "how to speed up my database" → the PostgreSQL talks
- **Odoo or external speaker** on every talk, plus a Speaker filter (see below)
- **Language** of every talk: Odoo's tag when present, otherwise detected from the title and abstract
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
uv run oxp-agenda embed             # (re)embed new or edited talks; scrape runs this when a key is set
```

This parses the agenda tables on odoo.com and every talk page (description, speaker bio, photo, video), then
writes `web/data/agenda.json`, and updates the embeddings in `data/embeddings.json`.

## Odoo vs external speakers

`uv run oxp-agenda affiliations` (also run by `scrape`) writes `web/data/affiliations.json`. Most talks say it
themselves in the official agenda ("… from Odoo", "CEO at Dynapps", an Odoo login such as "(pian)"), and Odoo's
own tags help (Internal vs Community / Partner / Invited Speaker / Influencer). Speakers whose listing names no
company are looked up online with Gemini + Google Search, and the results are cached. Company names shown in the
app come only from the agenda; web lookups only decide Odoo vs external.

## How semantic search works

Each talk (title, speakers, tags, abstract) is embedded once with `gemini-embedding-001` at 256 dimensions and
stored int8-quantised in `data/embeddings.json` (~200 KB, keyed by content hash, so only changed talks are
re-embedded; the server also fills gaps in the background at start-up). `GET /api/search?q=` embeds the query
and ranks talks by cosine similarity. Raw scores bunch together (≈0.6–0.75) for any query, so each hit also gets
a z-score against that query's distribution. Results are only trusted when the best match stands out
(z ≥ 3.5), and a talk counts as related at z ≥ 3.0. That keeps gibberish or off-topic queries from producing
noise. Without a key the app falls back to keyword search.

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
| `1`–`3`, `←` `→` | Change day | | |
| `A` | Ask AI | `F` | Filters |
| `D` | Toggle dark mode | | |
| `Esc` | Close menu, panel or chat; clear search | | |

## Project layout

```text
src/oxp_agenda/        Python package (CLI: oxp-agenda)
  cli.py               serve | scrape
  config.py            paths and GeminiSettings (env)
  server.py            static files + /api/chat, /api/health
  gemini.py            request building and SSE streaming
  catalog.py           agenda -> assistant system prompt
  semantic.py          embeddings cache + /api/search ranking
  affiliation.py       Odoo / external speaker tagging
  scraper.py           odoo.com agenda + talk pages -> agenda.json
web/                   the app (served as-is)
  index.html
  css/app.css          @imports tokens, base, one file per component, responsive
  js/app.js            entry: render loop, actions, event wiring
  js/agenda.js         dataset prep      js/state.js     filters, saved, URL hash
  js/taxonomy.js       tags -> tracks…   js/calendar.js  Google Calendar / .ics
  js/search.js         semantic lookups  js/views/results.js  widening search results
  js/views/            timetable, list, saved, shared parts
  js/ui/               filter bar & theme, facet menu, popover, drawer, toast
  js/chat/             panel, SSE client, safe Markdown renderer
  js/lib/              html, time, storage, dom, event bus
  data/agenda.json
data/embeddings.json   session vectors for semantic search
tests/                 pytest (Python + runs tests/js) · js/ node:test · e2e/ Playwright
```

## Development

```bash
uv run pytest                          # Python tests + front-end unit tests (needs node)
uv run ruff check . && uv run ruff format --check .
uv run --group e2e playwright install chromium   # once
uv run --group e2e pytest -m e2e       # browser smoke tests (Gemini is faked)
```
