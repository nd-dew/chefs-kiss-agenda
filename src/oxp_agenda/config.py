"""Paths and settings, resolved from the environment."""

import os
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WEB_DIR = Path(os.environ.get('OXP_WEB_DIR', PROJECT_ROOT / 'web'))
AGENDA_PATH = WEB_DIR / 'data' / 'agenda.json'
AFFILIATIONS_PATH = WEB_DIR / 'data' / 'affiliations.json'
EMBEDDINGS_PATH = Path(os.environ.get('OXP_EMBEDDINGS', PROJECT_ROOT / 'data' / 'embeddings.json'))
CACHE_DIR = Path(os.environ.get('XDG_CACHE_HOME', Path.home() / '.cache')) / 'oxp-agenda'

ODOO_BASE_URL = 'https://www.odoo.com'
AGENDA_URL = f'{ODOO_BASE_URL}/event/odoo-experience-2026-9099/agenda'


@dataclass(frozen=True)
class GeminiSettings:
    api_key: str | None
    model: str = 'gemini-flash-latest'
    embed_model: str = 'gemini-embedding-001'

    @classmethod
    def from_env(cls) -> 'GeminiSettings':
        key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_GENERATIVE_AI_API_KEY')
        return cls(
            api_key=key or None,
            model=os.environ.get('GEMINI_MODEL', cls.model),
            embed_model=os.environ.get('GEMINI_EMBED_MODEL', cls.embed_model),
        )

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)
