"""Command line: ``oxp-agenda serve`` and ``oxp-agenda scrape``."""

import argparse
import logging
from pathlib import Path

from oxp_agenda import config


def cmd_serve(args: argparse.Namespace) -> int:
    from oxp_agenda.server import make_server

    settings = config.GeminiSettings.from_env()
    httpd = make_server(args.host, args.port, config.WEB_DIR, config.AGENDA_PATH, settings)
    host, port = httpd.server_address[:2]
    ai = f'on ({settings.model})' if settings.enabled else 'off (set GEMINI_API_KEY)'
    print(f'OXP agenda on http://{"127.0.0.1" if host == "0.0.0.0" else host}:{port}  ·  AI assistant {ai}', flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
    return 0


def cmd_scrape(args: argparse.Namespace) -> int:
    from oxp_agenda.scraper import scrape

    agenda = scrape(args.out, args.cache_dir, refresh=args.refresh, workers=args.workers)
    print(f'{agenda["total_tracks"]} sessions -> {args.out}')
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog='oxp-agenda', description=__doc__)
    parser.add_argument('-v', '--verbose', action='store_true')
    sub = parser.add_subparsers(dest='command', required=True)

    serve = sub.add_parser('serve', help='serve the app and the AI chat endpoint')
    serve.add_argument('--host', default='127.0.0.1', help='use 0.0.0.0 to open it from your phone on the LAN')
    serve.add_argument('-p', '--port', type=int, default=9099)
    serve.set_defaults(func=cmd_serve)

    scrape = sub.add_parser('scrape', help='refresh web/data/agenda.json from odoo.com')
    scrape.add_argument('--out', type=Path, default=config.AGENDA_PATH)
    scrape.add_argument('--cache-dir', type=Path, default=config.CACHE_DIR / 'pages')
    scrape.add_argument('--refresh', action='store_true', help='ignore cached pages and download again')
    scrape.add_argument('--workers', type=int, default=16)
    scrape.set_defaults(func=cmd_scrape)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format='%(levelname)s %(message)s')
    return args.func(args)
