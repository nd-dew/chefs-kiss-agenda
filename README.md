# Odoo Experience 2026 — Agenda & Personal Schedule Explorer

A fast, searchable, and responsive web application for exploring the **Odoo Experience 2026** schedule and building your personal conference itinerary.

Extracted from the official Odoo event agenda at `https://www.odoo.com/event/odoo-experience-2026-9099/agenda`.

## 🚀 Quick Start

```bash
./start.sh 8080
```

Then open `http://localhost:8080` in your web browser.

## 🛠️ Data Pipeline & Updating

```bash
# 1. Download updated agenda HTML
curl -s "https://www.odoo.com/event/odoo-experience-2026-9099/agenda" -o /tmp/oxp_agenda.html

# 2. Run concurrent scraper (parses tables & fetches all talk abstracts/bios)
python3 scrape_oxp.py
```
