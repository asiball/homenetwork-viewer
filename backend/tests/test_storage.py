"""Tests for storage.py's startup hardening: legacy-JSON validation, a
corrupt database encountered before the first successful start, and
migration atomicity (issue #123).

These exercise ensure_seeded() / _migrate() directly against a throwaway
per-test database (storage.DB_FILE / storage.LEGACY_JSON monkeypatched to a
tmp_path), rather than through the `client` fixture — the whole point is to
control what the database looks like *before* first start, which the shared
fixture's already-seeded DB doesn't let us do.
"""

import json
import sqlite3

import pytest

from app import storage


def _fresh_paths(tmp_path):
    """A DB path that doesn't exist yet + a legacy JSON path that doesn't
    exist unless a test writes one."""
    return tmp_path / "homenet.db", tmp_path / "devices.json"


def _valid_legacy_device(**overrides):
    d = {
        "id": "legacy-dev",
        "name": "Legacy Device",
        "host": "legacy.home.arpa",
        "ip": "192.168.9.9",
        "mac": "AA:BB:CC:00:09:09",
        "group": "Computer",
        "type": "desktop",
    }
    d.update(overrides)
    return d


# ─── Legacy JSON validation (item 3) ────────────────────────────────────────


def test_ensure_seeded_migrates_valid_legacy_json(tmp_path, monkeypatch):
    db, legacy = _fresh_paths(tmp_path)
    legacy.write_text(
        json.dumps({"devices": [_valid_legacy_device()], "switches": [], "cables": []}),
        encoding="utf-8",
    )
    monkeypatch.setattr(storage, "DB_FILE", db)
    monkeypatch.setattr(storage, "LEGACY_JSON", legacy)

    storage.ensure_seeded()

    assert [d["id"] for d in storage.list_devices()] == ["legacy-dev"]


def test_ensure_seeded_rejects_legacy_json_missing_id(tmp_path, monkeypatch):
    """A legacy devices.json entry missing `id` must not crash lifespan with
    a raw KeyError deep in replace_catalog — it should fail loudly, here,
    with a clear message naming the file (issue #123)."""
    db, legacy = _fresh_paths(tmp_path)
    bad = _valid_legacy_device()
    del bad["id"]
    legacy.write_text(
        json.dumps({"devices": [bad], "switches": [], "cables": []}), encoding="utf-8"
    )
    monkeypatch.setattr(storage, "DB_FILE", db)
    monkeypatch.setattr(storage, "LEGACY_JSON", legacy)

    with pytest.raises(storage.DataFileError) as exc_info:
        storage.ensure_seeded()
    assert legacy.name in str(exc_info.value)
    # Not silently reseeded / poisoned: the catalog stays empty.
    assert storage.list_devices() == []


def test_ensure_seeded_rejects_legacy_json_missing_required_field(tmp_path, monkeypatch):
    """A record missing some other required field (not `id`) must not be
    persisted as-is either — that's how a later GET /api/devices would 500
    trying to re-parse it (issue #123)."""
    db, legacy = _fresh_paths(tmp_path)
    bad = _valid_legacy_device()
    del bad["mac"]
    legacy.write_text(
        json.dumps({"devices": [bad], "switches": [], "cables": []}), encoding="utf-8"
    )
    monkeypatch.setattr(storage, "DB_FILE", db)
    monkeypatch.setattr(storage, "LEGACY_JSON", legacy)

    with pytest.raises(storage.DataFileError) as exc_info:
        storage.ensure_seeded()
    assert "device[0]" in str(exc_info.value)
    assert storage.list_devices() == []


def test_ensure_seeded_rejects_legacy_json_with_duplicate_ip(tmp_path, monkeypatch):
    """Two legacy devices sharing an ip each pass per-item Pydantic validation
    individually, so without a find_duplicate_identities check here the first
    sign of trouble used to be the UNIQUE index (_m003) failing deep inside
    replace_catalog — surfaced as a misleading "not a valid SQLite database:
    UNIQUE constraint failed" error. It must instead fail loudly here, naming
    the file and the duplicate ip."""
    db, legacy = _fresh_paths(tmp_path)
    dev_a = _valid_legacy_device(id="dev-a", mac="AA:BB:CC:00:09:09")
    dev_b = _valid_legacy_device(id="dev-b", mac="AA:BB:CC:00:09:10")  # same ip as dev_a
    legacy.write_text(
        json.dumps({"devices": [dev_a, dev_b], "switches": [], "cables": []}), encoding="utf-8"
    )
    monkeypatch.setattr(storage, "DB_FILE", db)
    monkeypatch.setattr(storage, "LEGACY_JSON", legacy)

    with pytest.raises(storage.DataFileError) as exc_info:
        storage.ensure_seeded()
    msg = str(exc_info.value)
    assert legacy.name in msg
    assert "duplicate ip" in msg
    assert "192.168.9.9" in msg
    assert "not a valid SQLite database" not in msg
    assert storage.list_devices() == []


# ─── Corrupt DB before first start (item 4) ─────────────────────────────────


def test_ensure_seeded_raises_clear_error_on_corrupt_db(tmp_path, monkeypatch):
    """A corrupt database encountered on the very first start (before
    ensure_seeded ever succeeds) must surface as DataFileError, not an
    unwrapped sqlite3.DatabaseError crashing lifespan with a raw traceback —
    consistent with the 503 /api/ready design for a corruption found later."""
    db, legacy = _fresh_paths(tmp_path)
    db.write_bytes(b"this is not a sqlite database")
    monkeypatch.setattr(storage, "DB_FILE", db)
    monkeypatch.setattr(storage, "LEGACY_JSON", legacy)

    with pytest.raises(storage.DataFileError) as exc_info:
        storage.ensure_seeded()
    assert "SQLite database" in str(exc_info.value)


# ─── Migration atomicity (item 5) ───────────────────────────────────────────


def test_migrate_fails_cleanly_after_simulated_mid_migration_crash(tmp_path, monkeypatch):
    """Simulate the failure mode the old executescript-based _migrate was
    exposed to: a crash between _m002's two CREATE TABLEs leaves one of its
    tables present while user_version is still 1. Re-running must not hang
    forever on "table already exists" via a raw traceback — it should fail
    cleanly with DataFileError."""
    db, legacy = _fresh_paths(tmp_path)
    monkeypatch.setattr(storage, "DB_FILE", db)
    monkeypatch.setattr(storage, "LEGACY_JSON", legacy)

    conn = sqlite3.connect(db)
    storage._m001_initial(conn)
    conn.execute("PRAGMA user_version = 1")
    conn.commit()
    # Fake the mid-crash state: the first table _m002 creates exists, but
    # user_version was never bumped past 1.
    conn.execute(
        "CREATE TABLE reachability_samples ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL, "
        "ts TEXT NOT NULL, reachable INTEGER NOT NULL, rtt_ms REAL, method TEXT)"
    )
    conn.commit()
    conn.close()

    with pytest.raises(storage.DataFileError):
        storage.ensure_seeded()


def test_migrate_recovers_after_a_real_mid_migration_crash(tmp_path, monkeypatch):
    """The actual crash-recovery path (distinct from the test above, which
    simulates a DB already left broken by the *old* executescript-based
    code): if the process dies mid-transaction, SQLite's own crash recovery
    rolls the incomplete migration back entirely on next connect — nothing
    committed, user_version unchanged. Simulated here with an explicit
    ROLLBACK standing in for that automatic recovery. Re-running from that
    clean, pre-migration state must then succeed rather than fail."""
    db, legacy = _fresh_paths(tmp_path)
    monkeypatch.setattr(storage, "DB_FILE", db)
    monkeypatch.setattr(storage, "LEGACY_JSON", legacy)

    conn = sqlite3.connect(db)
    storage._m001_initial(conn)
    conn.execute("PRAGMA user_version = 1")
    conn.commit()
    # Begin (but don't finish) _m002 the way _migrate itself would, then roll
    # it back -- what SQLite does on its own after a real crash.
    conn.isolation_level = None
    conn.execute("BEGIN")
    conn.execute(
        "CREATE TABLE reachability_samples ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL, "
        "ts TEXT NOT NULL, reachable INTEGER NOT NULL, rtt_ms REAL, method TEXT)"
    )
    conn.execute("ROLLBACK")
    conn.close()

    # A clean pre-migration state (v1, no reachability_samples table) -- so
    # re-running must succeed and reach the latest version.
    storage.ensure_seeded()

    with sqlite3.connect(db) as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 3


def test_migrate_is_atomic_no_partial_state_on_failure(tmp_path):
    """A migration that fails partway through must not leave user_version
    bumped or any of its tables behind — DDL + the PRAGMA bump commit or roll
    back together (issue #123)."""
    db = tmp_path / "homenet.db"
    conn = sqlite3.connect(db)
    storage._m001_initial(conn)
    conn.execute("PRAGMA user_version = 1")
    conn.commit()
    # Same simulated partial-crash state as above, exercised directly against
    # _migrate() this time.
    conn.execute(
        "CREATE TABLE reachability_samples ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL, "
        "ts TEXT NOT NULL, reachable INTEGER NOT NULL, rtt_ms REAL, method TEXT)"
    )
    conn.commit()

    with pytest.raises(sqlite3.DatabaseError):
        storage._migrate(conn)

    # user_version must still read 1 -- not bumped despite the failed attempt.
    assert conn.execute("PRAGMA user_version").fetchone()[0] == 1
    conn.close()


# ─── New _m003 migration (item 6) ───────────────────────────────────────────


def test_fresh_db_reaches_latest_user_version(tmp_path, monkeypatch):
    db, legacy = _fresh_paths(tmp_path)
    monkeypatch.setattr(storage, "DB_FILE", db)
    monkeypatch.setattr(storage, "LEGACY_JSON", legacy)

    storage.ensure_seeded()

    with sqlite3.connect(db) as conn:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
    assert version == len(storage._MIGRATIONS) == 3


def test_v2_db_upgrades_to_v3(tmp_path, monkeypatch):
    """A database left at v2 (pre-_m003) upgrades cleanly: gets the unique
    indexes and the reachability_samples(ts) index."""
    db, legacy = _fresh_paths(tmp_path)
    monkeypatch.setattr(storage, "DB_FILE", db)
    monkeypatch.setattr(storage, "LEGACY_JSON", legacy)

    conn = sqlite3.connect(db)
    storage._m001_initial(conn)
    storage._m002_reachability_history(conn)
    conn.execute("PRAGMA user_version = 2")
    conn.commit()
    conn.close()

    storage.ensure_seeded()

    with sqlite3.connect(db) as conn:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        idx = {
            r[0]
            for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'index'").fetchall()
        }
    assert version == 3
    assert {"idx_devices_ip", "idx_devices_mac", "idx_samples_ts"} <= idx


def test_m003_unique_index_rejects_duplicate_ip(tmp_path):
    """The new devices.ip index is UNIQUE, not just a plain index."""
    db = tmp_path / "homenet.db"
    conn = sqlite3.connect(db)
    storage._m001_initial(conn)
    storage._m002_reachability_history(conn)
    storage._m003_unique_indexes(conn)
    conn.execute(
        "INSERT INTO devices(id, ip, mac, doc, seq) VALUES "
        "('a', '10.0.0.1', 'AA:AA:AA:AA:AA:AA', '{}', 0)"
    )
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO devices(id, ip, mac, doc, seq) VALUES "
            "('b', '10.0.0.1', 'BB:BB:BB:BB:BB:BB', '{}', 1)"
        )
    conn.close()
