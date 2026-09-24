"""Runs the front-end unit tests (tests/js, node:test) as part of `pytest`."""

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.skipif(not shutil.which('node'), reason='node is not installed')
def test_js_unit_tests():
    result = subprocess.run(['node', '--test', 'tests/js/'], cwd=ROOT, capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stdout + result.stderr
