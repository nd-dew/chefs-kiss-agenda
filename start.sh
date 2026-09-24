#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

PORT="${1:-8080}"

echo "=========================================================="
echo "  Odoo Experience 2026 — Interactive Agenda & Scheduler   "
echo "=========================================================="
echo "Serving application from: $DIR"
echo "URL: http://127.0.0.1:$PORT"
echo "Press Ctrl+C to stop."
echo "=========================================================="

python3 -m http.server "$PORT"
