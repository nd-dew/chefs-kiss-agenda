# Odoo Experience 2026 — Agenda & Personal Schedule Explorer

A fast, searchable, and responsive web application for exploring the **Odoo Experience 2026** schedule and building your personal conference itinerary.

Extracted from the official Odoo event agenda at `https://www.odoo.com/event/odoo-experience-2026-9099/agenda`.

---

## ⚡ Why This Is Better Than the Official Website

| Feature | Official Odoo Website | This Web App |
| :--- | :--- | :--- |
| **Search** | Clunky tag filters, no instant search | **Instant live search** across titles, speakers, rooms, descriptions, and tags (`/` shortcut) |
| **Grid Layout** | 16-column wide table with awkward sideways scrolling | **4 Flexible Views**: Timeline View, Sticky Matrix Grid, Sequential By-Room View, & My Schedule |
| **Mobile Experience** | Difficult to read horizontal table | **Fully responsive**: optimized cards, sticky headers, touch-friendly navigation |
| **Personal Schedule** | Requires logging into Odoo account | **Local & Private**: 1-click star bookmarks stored in browser `localStorage` |
| **Conflict Detection** | None | **Automatic warning banner** when bookmarked sessions overlap in time |
| **Calendar Sync** | Cumbersome | **1-Click Export**: Google Calendar web intent + standard `.ICS` file download |
| **Live Streams** | Separate page navigation | **Embedded YouTube player** directly inside the session detail dialog |
| **Performance** | Multi-megabyte server renders | **Instant & Offline**: Bundled JSON dataset loads in <15ms with zero lag |
| **Theme** | Fixed light theme | **Dark & Light Mode** with persistent theme toggle |

---

## 📊 Extracted Dataset Statistics

- **Total Sessions**: 484 talks & masterclasses
- **Conference Dates**: Sep 22 – Sep 26, 2026 (Brussels Expo, Belgium)
  - **Tuesday, Sep 22**: 8 Masterclasses
  - **Wednesday, Sep 23**: 8 Masterclasses
  - **Thursday, Sep 24**: 165 Sessions (Opening Keynote: Unveiling Odoo 20)
  - **Friday, Sep 25**: 162 Sessions
  - **Saturday, Sep 26**: 141 Sessions
- **Rooms**: 24 distinct tracks (Auditorium 4000 A-D, Auditorium 2000 A-C, Auditorium 500, Hall 6.A-E, Hall 7.A-B, Education Village, Masterclass Rooms)
- **Live Stream / Video Talks**: 115 sessions with direct YouTube stream/video IDs
- **Speakers**: 452 sessions with speaker profiles, avatars, and bios

---

## 🚀 Quick Start

Run the standalone local server:

```bash
cd /home/odoo/repos/oxp-agenda
./start.sh 8080
```

Then open `http://localhost:8080` in your web browser.

---

## ✦ AI assistant

Press `A` (or the **Ask AI** button) to chat with an assistant that knows every session. `server.py` serves the app and
proxies `/api/chat` to Gemini (`gemini-flash-latest` by default, override with `GEMINI_MODEL`), so the key never reaches the browser.
The whole agenda goes into the system prompt as a compact catalog. The model cites sessions as `[[s123]]`, and the page renders
each one as a clickable card you can star. Each question also sends the current time, the day you're viewing, your filters and
your saved sessions, so "what's on next?" or "check my schedule for clashes" just work.

```bash
GEMINI_API_KEY=... ./start.sh 9099
```

A plain static server still serves the agenda, but the chat will report that the AI backend is offline.

---

## ⌨️ Keyboard Shortcuts

- `/` : Focus search · `Esc` : close menu / drawer / clear search
- `1` – `5` or `←` `→` : Switch conference day
- `G` : Timetable · `L` : List · `S` : Saved schedule
- `N` : Jump to now · `D` : Toggle dark mode

Filters (room, track, level, language, format, tags, video, saved, hide past) are kept in the URL hash, so any view can be shared as a link.
Append `?now=2026-09-24T14:10` to preview the live "now" line at a given time.

---

## 🛠️ Data Pipeline & Updating

To refresh the agenda data from Odoo:

```bash
# 1. Download updated agenda HTML
curl -s "https://www.odoo.com/event/odoo-experience-2026-9099/agenda" -o /tmp/oxp_agenda.html

# 2. Run concurrent scraper (parses tables & fetches all talk abstracts/bios)
python3 /home/odoo/repos/oxp-agenda/scrape_oxp.py
```

The script extracts the table structure, handles cell rowspans/colspans, fetches talk pages concurrently with 25 worker threads, caches raw HTML to `/tmp/oxp_track_cache/`, and generates `data/agenda.json` and `data/agenda.min.json`.

---

## 📁 Project Structure

```text
oxp-agenda/
├── index.html            # Core application layout and semantic markup
├── style.css             # Design system, themes (dark/light), responsive layout
├── app.js                # State management, views, search, calendar generators
├── server.py             # Static server + Gemini chat proxy (/api/chat)
├── scrape_oxp.py         # Concurrent data extraction pipeline
├── start.sh              # One-line development / local server launcher
└── data/
    ├── agenda.json       # Pretty structured JSON dataset (484 tracks)
    └── agenda.min.json   # Minified high-speed JSON dataset (~900 KB)
```
