"""Test fixtures.

Point storage at a throwaway database *before* the app is imported, so the
real seed / runtime data is never touched. Each test starts from a fresh copy
of the bundled seed.
"""

import os
import tempfile
from pathlib import Path

# Must be set before app.storage is imported anywhere.
_TMP_DIR = Path(tempfile.mkdtemp(prefix="homenet-test-"))
os.environ["HOMENET_DB_FILE"] = str(_TMP_DIR / "homenet.db")
# No legacy JSON to migrate from: force seeding from the bundled seed file so the
# expected counts stay deterministic.
os.environ["HOMENET_DATA_FILE"] = str(_TMP_DIR / "nonexistent.json")
# Keep tests deterministic: don't let the background reachability collector
# probe the network and rewrite seed online/last counts mid-test.
os.environ["HOMENET_DISABLE_COLLECTOR"] = "1"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import storage  # noqa: E402
from app.main import app  # noqa: E402


def _reset_db() -> None:
    """Remove the SQLite database and its WAL/SHM sidecars for a clean seed."""
    for suffix in ("", "-wal", "-shm"):
        p = Path(str(storage.DB_FILE) + suffix)
        if p.exists():
            p.unlink()


@pytest.fixture()
def client():
    # Reset to a clean seed for every test.
    _reset_db()
    storage.ensure_seeded()
    with TestClient(app) as c:
        yield c
