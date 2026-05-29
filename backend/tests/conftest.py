"""Test fixtures.

Point storage at a throwaway data file *before* the app is imported, so the
real seed / runtime data is never touched. Each test starts from a fresh copy
of the bundled seed.
"""

import os
import tempfile
from pathlib import Path

# Must be set before app.storage is imported anywhere.
_TMP_DIR = Path(tempfile.mkdtemp(prefix="homenet-test-"))
os.environ["HOMENET_DATA_FILE"] = str(_TMP_DIR / "devices.json")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import storage  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    # Reset to a clean seed for every test.
    if storage.DATA_FILE.exists():
        storage.DATA_FILE.unlink()
    storage.ensure_seeded()
    with TestClient(app) as c:
        yield c
