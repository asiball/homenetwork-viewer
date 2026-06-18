"""SQLite-backed storage for the device catalog.

The single source of truth is a SQLite database (`homenet.db`). The static,
human-curated catalog (devices / switches / cables — spec §3) is kept separate
from the machine-written reachability *state* (online / last): the background
collector updates reachability in its own table, so a sweep never rewrites the
record the user edits, and never pays the per-sweep full-file fsync the old JSON
store did. JSON stays the import/export interchange format, so the catalog is
still portable, diff-able on export and easy to back up.

Reachability is also kept as an append-only *time series* (``reachability_samples``)
plus the state-transition edges (``reachability_events``), so uptime, the 7-day
history and outage records are computed from real data instead of a frozen
hand-entered field (issue #93). ``device_state`` stays as the fast "current"
cache derived from the latest sample.

Schema changes go through numbered migrations keyed off ``PRAGMA user_version``,
applied on startup, so the database can evolve forward safely.

Writes are serialized by a process-wide lock and run in a transaction (commit on
success, rollback on error) so a rejected operation never persists a half-applied
change. Reads use WAL so they don't block the writer.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
import time
from collections.abc import Iterator
from contextlib import closing, contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

APP_DIR = Path(__file__).resolve().parent
SEED_FILE = APP_DIR / "seed" / "devices.json"

# Runtime database. Override with HOMENET_DB_FILE (docker mounts /data).
DB_FILE = Path(os.environ.get("HOMENET_DB_FILE", str(APP_DIR.parent / "data" / "homenet.db")))

# Legacy JSON catalog. If it exists on first start and the DB is still empty, it
# is migrated in, so deployments upgrading from the JSON store keep their data.
LEGACY_JSON = Path(
    os.environ.get("HOMENET_DATA_FILE", str(APP_DIR.parent / "data" / "devices.json"))
)

# Reachability fields the collector owns. Kept out of the catalog "doc" (they
# live in the device_state table) so a sweep never rewrites the curated record.
_STATE_FIELDS = ("online", "last")

# How long to keep raw reachability samples / events before pruning (#93). A home
# LAN at one sweep / 2 min is ~720 rows/device/day; 30 days bounds the table while
# leaving plenty for the 7-day history and recent outage list.
RETENTION_DAYS = 30

_lock = threading.RLock()


class NotFoundError(KeyError):
    """Raised when a device id does not exist."""


class ConflictError(ValueError):
    """Raised when creating a device whose id / ip / mac already exists."""


class DataFileError(RuntimeError):
    """Raised when the database file exists but cannot be opened / read."""


# ─── Connection / migrations ─────────────────────────────────────────────────


def _connect() -> sqlite3.Connection:
    DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_FILE, timeout=5.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _wrap_db_error(exc: sqlite3.DatabaseError) -> DataFileError:
    logger.error("storage.db error=%s file=%s", exc, DB_FILE.name)
    return DataFileError(f"{DB_FILE.name} is not a valid SQLite database: {exc}")


@contextmanager
def _db() -> Iterator[sqlite3.Connection]:
    """Yield a read connection, translating a corrupt DB into DataFileError."""
    try:
        conn = _connect()
    except sqlite3.DatabaseError as exc:
        raise _wrap_db_error(exc) from exc
    try:
        yield conn
    except sqlite3.DatabaseError as exc:
        raise _wrap_db_error(exc) from exc
    finally:
        conn.close()


@contextmanager
def _write() -> Iterator[sqlite3.Connection]:
    """Read-modify-write under the lock, in one transaction.

    Commits on normal exit; rolls back if the body raises (a ConflictError /
    NotFoundError thus never persists a half-applied change). This is the single
    primitive every writer goes through, so the lock/transaction pair can't drift
    between them.
    """
    with _lock:
        try:
            conn = _connect()
        except sqlite3.DatabaseError as exc:
            raise _wrap_db_error(exc) from exc
        try:
            with conn:  # commit on success, rollback on exception
                yield conn
        except sqlite3.DatabaseError as exc:
            raise _wrap_db_error(exc) from exc
        finally:
            conn.close()


def _m001_initial(conn: sqlite3.Connection) -> None:
    """Catalog tables + machine-state table + a key/value meta table.

    `seq` preserves insertion order for list endpoints (ORDER BY seq). Device
    reachability lives in device_state, separate from the curated `doc`.
    """
    conn.executescript(
        """
        CREATE TABLE devices (
            id   TEXT PRIMARY KEY,
            ip   TEXT,
            mac  TEXT,
            doc  TEXT NOT NULL,
            seq  INTEGER NOT NULL
        );
        CREATE TABLE device_state (
            id     TEXT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
            online INTEGER NOT NULL DEFAULT 0,
            last   TEXT
        );
        CREATE TABLE switches (
            id   TEXT PRIMARY KEY,
            doc  TEXT NOT NULL,
            seq  INTEGER NOT NULL
        );
        CREATE TABLE cables (
            id   TEXT PRIMARY KEY,
            doc  TEXT NOT NULL,
            seq  INTEGER NOT NULL
        );
        CREATE TABLE meta (
            key   TEXT PRIMARY KEY,
            value TEXT
        );
        CREATE INDEX idx_devices_ip ON devices(ip);
        CREATE INDEX idx_devices_mac ON devices(mac);
        """
    )


def _m002_reachability_history(conn: sqlite3.Connection) -> None:
    """Append-only reachability time series + state-transition edges (#93).

    `reachability_samples` keeps one row per device per sweep (uptime / hist7 are
    aggregated from it); `reachability_events` keeps only the up/down edges (the
    source for outage history and, later, notifications). Both cascade-delete with
    their device, so removing a device cleans up its history too.
    """
    conn.executescript(
        """
        CREATE TABLE reachability_samples (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
            ts        TEXT NOT NULL,
            reachable INTEGER NOT NULL,
            rtt_ms    REAL,
            method    TEXT
        );
        CREATE TABLE reachability_events (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
            ts        TEXT NOT NULL,
            kind      TEXT NOT NULL
        );
        CREATE INDEX idx_samples_device_ts ON reachability_samples(device_id, ts);
        CREATE INDEX idx_events_device_ts ON reachability_events(device_id, ts);
        """
    )


# Append-only: each migration is applied once, in order, the first time the DB's
# user_version is below its index. Never edit a shipped migration — add a new one.
_MIGRATIONS = [_m001_initial, _m002_reachability_history]


def _migrate(conn: sqlite3.Connection) -> None:
    version = conn.execute("PRAGMA user_version").fetchone()[0]
    for i, migration in enumerate(_MIGRATIONS, start=1):
        if version < i:
            migration(conn)
            conn.execute(f"PRAGMA user_version = {i}")
            logger.info("storage.migrate applied=%d", i)
    conn.commit()


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def ensure_seeded() -> None:
    """Create + migrate the database, seeding it on first run.

    Seeds from a legacy ``devices.json`` if one is present (so an upgrade keeps
    existing data), otherwise from the bundled seed.
    """
    with _lock:
        with closing(_connect()) as conn:
            _migrate(conn)
            already = conn.execute("SELECT 1 FROM devices LIMIT 1").fetchone()
        if already:
            return
        source = LEGACY_JSON if LEGACY_JSON.exists() else SEED_FILE
        if source.exists():
            doc = json.loads(source.read_text(encoding="utf-8"))
            replace_catalog(
                doc.get("devices", []),
                doc.get("switches", []),
                doc.get("cables", []),
            )
            logger.info("storage.seed action=load src=%s", source.name)
        else:  # pragma: no cover - seed ships with the image
            with _write() as conn:
                _touch_catalog(conn)
            logger.info("storage.seed action=empty dst=%s", DB_FILE.name)


# ─── Helpers ────────────────────────────────────────────────────────────────


def _deep_merge(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    """Recursively merge *overlay* into *base*, returning the merged result.

    For keys present in both dicts whose values are themselves dicts, the merge
    recurses. All other overlay values overwrite the base. Keys in *base* that
    are absent from *overlay* are preserved.
    """
    merged = dict(base)
    for key, value in overlay.items():
        if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _check_identity_unique(
    devices: list[dict[str, Any]],
    *,
    id: str | None = None,
    ip: str | None = None,
    mac: str | None = None,
    exclude_id: str | None = None,
) -> None:
    """Raise `ConflictError` if *id*, *ip* or *mac* already belong to another
    device. The single place id / ip / mac uniqueness is enforced against the
    stored catalog — create *and* update go through here, so the rule can't
    drift between them (issue #123)."""
    for d in devices:
        did = d.get("id")
        if exclude_id is not None and did == exclude_id:
            continue
        if id is not None and did == id:
            raise ConflictError(f"id already in use: {id}")
        if ip and d.get("ip") == ip:
            raise ConflictError(f"ip already in use by '{d.get('name', did)}'")
        if mac and d.get("mac") and mac.upper() == d["mac"].upper():
            raise ConflictError(f"mac already in use by '{d.get('name', did)}'")


def find_duplicate_identities(devices: list[dict[str, Any]]) -> list[str]:
    """Return error strings for devices that collide on id / ip / mac *within*
    the given list. Used by the import path so a bulk upload is held to the same
    id/ip/mac uniqueness contract that create_device enforces — the check lives
    here, next to _check_identity_unique, rather than being reimplemented in the
    route (issue #123)."""
    errors: list[str] = []
    seen_id: set[str] = set()
    seen_ip: set[str] = set()
    seen_mac: set[str] = set()
    for i, d in enumerate(devices):
        for key, seen in (("id", seen_id), ("ip", seen_ip), ("mac", seen_mac)):
            val = d.get(key)
            if not val:
                continue
            norm = val.upper() if key == "mac" else val
            if norm in seen:
                errors.append(f"device[{i}]: duplicate {key} {val!r}")
            seen.add(norm)
    return errors


def _split_state(device: dict[str, Any]) -> tuple[dict[str, Any], int, str | None]:
    """Split a device dict into its curated `doc` and its (online, last) state."""
    doc = {k: v for k, v in device.items() if k not in _STATE_FIELDS}
    return doc, int(bool(device.get("online", False))), device.get("last")


def _row_to_device(row: sqlite3.Row) -> dict[str, Any]:
    """Re-merge a stored doc with its reachability state into one device dict."""
    device = json.loads(row["doc"])
    device["online"] = bool(row["online"])
    if row["last"] is not None:
        device["last"] = row["last"]
    return device


_DEVICE_SELECT = (
    "SELECT d.doc, s.online, s.last FROM devices d LEFT JOIN device_state s ON s.id = d.id"
)


def _identity_rows(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """Minimal {id, ip, mac, name} rows for the uniqueness check."""
    rows = conn.execute(
        "SELECT id, ip, mac, json_extract(doc, '$.name') AS name FROM devices"
    ).fetchall()
    return [dict(r) for r in rows]


def _touch_catalog(conn: sqlite3.Connection) -> None:
    """Stamp the catalog's last-edited time. Reachability sweeps deliberately do
    NOT call this, so updated_at reflects human edits, not machine state."""
    conn.execute(
        "INSERT INTO meta(key, value) VALUES('catalog_updated_at', ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (_now_iso(),),
    )


def _next_seq(conn: sqlite3.Connection, table: str) -> int:
    # table is an internal constant, never user input.
    return conn.execute(f"SELECT COALESCE(MAX(seq), -1) + 1 FROM {table}").fetchone()[0]


# ─── Reads ──────────────────────────────────────────────────────────────────


def list_devices() -> list[dict[str, Any]]:
    logger.debug("storage.op action=list_devices")
    with _db() as conn:
        rows = conn.execute(_DEVICE_SELECT + " ORDER BY d.seq").fetchall()
    return [_row_to_device(r) for r in rows]


def get_device(device_id: str) -> dict[str, Any]:
    with _db() as conn:
        row = conn.execute(_DEVICE_SELECT + " WHERE d.id = ?", (device_id,)).fetchone()
    if row is None:
        logger.warning("storage.op action=get_device id=%s error=not_found", device_id)
        raise NotFoundError(device_id)
    logger.debug("storage.op action=get_device id=%s", device_id)
    return _row_to_device(row)


def list_switches() -> list[dict[str, Any]]:
    with _db() as conn:
        rows = conn.execute("SELECT doc FROM switches ORDER BY seq").fetchall()
    return [json.loads(r["doc"]) for r in rows]


def list_cables() -> list[dict[str, Any]]:
    with _db() as conn:
        rows = conn.execute("SELECT doc FROM cables ORDER BY seq").fetchall()
    return [json.loads(r["doc"]) for r in rows]


def updated_at() -> str | None:
    try:
        with _db() as conn:
            row = conn.execute("SELECT value FROM meta WHERE key = 'catalog_updated_at'").fetchone()
    except DataFileError:
        return None
    return row["value"] if row else None


# ─── Writes ─────────────────────────────────────────────────────────────────


def create_device(device: dict[str, Any]) -> dict[str, Any]:
    doc, online, last = _split_state(device)
    with _write() as conn:
        _check_identity_unique(
            _identity_rows(conn),
            id=device["id"],
            ip=device.get("ip"),
            mac=device.get("mac"),
        )
        conn.execute(
            "INSERT INTO devices(id, ip, mac, doc, seq) VALUES (?, ?, ?, ?, ?)",
            (
                device["id"],
                device.get("ip"),
                device.get("mac"),
                json.dumps(doc, ensure_ascii=False),
                _next_seq(conn, "devices"),
            ),
        )
        conn.execute(
            "INSERT INTO device_state(id, online, last) VALUES (?, ?, ?)",
            (device["id"], online, last),
        )
        _touch_catalog(conn)
        logger.info("storage.op action=create_device id=%s", device.get("id"))
    return device


def update_device(device_id: str, device: dict[str, Any]) -> dict[str, Any]:
    with _write() as conn:
        row = conn.execute(_DEVICE_SELECT + " WHERE d.id = ?", (device_id,)).fetchone()
        if row is None:
            logger.warning("storage.op action=update_device id=%s error=not_found", device_id)
            raise NotFoundError(device_id)
        _check_identity_unique(
            _identity_rows(conn),
            ip=device.get("ip"),
            mac=device.get("mac"),
            exclude_id=device_id,
        )
        merged = _deep_merge(_row_to_device(row), device)
        merged["id"] = device_id  # id is immutable
        doc, online, last = _split_state(merged)
        conn.execute(
            "UPDATE devices SET ip = ?, mac = ?, doc = ? WHERE id = ?",
            (merged.get("ip"), merged.get("mac"), json.dumps(doc, ensure_ascii=False), device_id),
        )
        conn.execute(
            "INSERT INTO device_state(id, online, last) VALUES (?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET online = excluded.online, last = excluded.last",
            (device_id, online, last),
        )
        _touch_catalog(conn)
        logger.info("storage.op action=update_device id=%s", device_id)
    return merged


def delete_device(device_id: str) -> None:
    with _write() as conn:
        # device_state is removed by the ON DELETE CASCADE foreign key.
        cur = conn.execute("DELETE FROM devices WHERE id = ?", (device_id,))
        if cur.rowcount == 0:
            logger.warning("storage.op action=delete_device id=%s error=not_found", device_id)
            raise NotFoundError(device_id)
        _touch_catalog(conn)
        logger.info("storage.op action=delete_device id=%s", device_id)


def bulk_update_reachability(updates: list[dict]) -> None:
    """Update online/last for multiple devices. Touches only device_state — never
    the curated catalog — and writes a row only when it actually changes, so an
    unchanged sweep does no disk write at all (saves SD-card wear)."""
    if not updates:
        return
    with _write() as conn:
        for upd in updates:
            dev_id = upd["id"]
            row = conn.execute(
                "SELECT online, last FROM device_state WHERE id = ?", (dev_id,)
            ).fetchone()
            if (
                row is None
                and not conn.execute("SELECT 1 FROM devices WHERE id = ?", (dev_id,)).fetchone()
            ):
                continue  # unknown device id — nothing to update
            cur_online = row["online"] if row else None
            cur_last = row["last"] if row else None
            new_online = int(bool(upd["online"]))
            # Keep the previous last-seen instant when going offline (issue #84).
            new_last = upd["last"] if (upd["online"] and upd.get("last")) else cur_last
            if new_online == cur_online and new_last == cur_last:
                continue
            conn.execute(
                "INSERT INTO device_state(id, online, last) VALUES (?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET online = excluded.online, last = excluded.last",
                (dev_id, new_online, new_last),
            )


# ─── Reachability time series (#93) ──────────────────────────────────────────


def record_reachability(samples: list[dict], ts: str | None = None) -> None:
    """Append one reachability sample per device for a sweep, record up/down
    transitions, and refresh the device_state "current" cache — all in one
    transaction.

    Each sample is ``{id, reachable, rtt_ms?, method?, ts?}``. The sweep instant
    (``ts``) is stamped once for the whole batch unless a sample carries its own
    ``ts`` (used by tests to place samples on specific days). Unknown device ids
    are skipped. A transition (online flips vs the stored state) writes a
    ``reachability_events`` row; the very first observation of a device writes no
    event. ``last`` keeps the previous instant while a device is offline (#84)."""
    if not samples:
        return
    sweep_ts = ts or _now_iso()
    with _write() as conn:
        for s in samples:
            dev_id = s["id"]
            row = conn.execute(
                "SELECT online, last FROM device_state WHERE id = ?", (dev_id,)
            ).fetchone()
            if (
                row is None
                and not conn.execute("SELECT 1 FROM devices WHERE id = ?", (dev_id,)).fetchone()
            ):
                continue  # unknown device id — nothing to record
            sample_ts = s.get("ts") or sweep_ts
            reachable = bool(s["reachable"])
            conn.execute(
                "INSERT INTO reachability_samples(device_id, ts, reachable, rtt_ms, method) "
                "VALUES (?, ?, ?, ?, ?)",
                (dev_id, sample_ts, int(reachable), s.get("rtt_ms"), s.get("method")),
            )
            cur_online = row["online"] if row else None
            cur_last = row["last"] if row else None
            new_online = int(reachable)
            # Record the up/down edge only on an actual flip from a known state.
            if cur_online is not None and cur_online != new_online:
                conn.execute(
                    "INSERT INTO reachability_events(device_id, ts, kind) VALUES (?, ?, ?)",
                    (dev_id, sample_ts, "up" if reachable else "down"),
                )
            new_last = sample_ts if reachable else cur_last
            if new_online != cur_online or new_last != cur_last:
                conn.execute(
                    "INSERT INTO device_state(id, online, last) VALUES (?, ?, ?) "
                    "ON CONFLICT(id) DO UPDATE SET online = excluded.online, last = excluded.last",
                    (dev_id, new_online, new_last),
                )


def reachability_history(device_id: str, days: int = 7) -> dict[str, Any]:
    """Per-day uptime over the last *days* calendar days (UTC), from samples.

    Returns ``{device_id, days, history: [{date, uptime, samples}], uptime_pct}``
    where ``uptime``/``uptime_pct`` are ratios in 0..1 and are ``None`` for a day
    (or window) with no samples — history is never invented (spec §6.4)."""
    days = max(1, days)
    today = datetime.now(UTC).date()
    start = today - timedelta(days=days - 1)
    with _db() as conn:
        rows = conn.execute(
            "SELECT date(ts) AS day, AVG(reachable) AS up, COUNT(*) AS n "
            "FROM reachability_samples WHERE device_id = ? AND ts >= ? "
            "GROUP BY date(ts)",
            (device_id, start.isoformat()),
        ).fetchall()
    by_day = {r["day"]: (r["up"], r["n"]) for r in rows}
    history: list[dict[str, Any]] = []
    total_n = 0
    total_up = 0.0
    for i in range(days):
        d = (start + timedelta(days=i)).isoformat()
        up, n = by_day.get(d, (None, 0))
        history.append({"date": d, "uptime": up, "samples": n})
        if n:
            total_n += n
            total_up += up * n
    uptime_pct = (total_up / total_n) if total_n else None
    return {"device_id": device_id, "days": days, "history": history, "uptime_pct": uptime_pct}


def list_reachability_events(device_id: str, limit: int = 20) -> list[dict[str, Any]]:
    """Most-recent up/down transitions for a device, newest first."""
    with _db() as conn:
        rows = conn.execute(
            "SELECT ts, kind FROM reachability_events WHERE device_id = ? "
            "ORDER BY ts DESC, id DESC LIMIT ?",
            (device_id, max(1, limit)),
        ).fetchall()
    return [{"ts": r["ts"], "kind": r["kind"]} for r in rows]


def prune_reachability(retention_days: int = RETENTION_DAYS) -> int:
    """Delete samples / events older than *retention_days*; returns rows removed."""
    cutoff = (datetime.now(UTC) - timedelta(days=retention_days)).isoformat(timespec="seconds")
    with _write() as conn:
        n = conn.execute("DELETE FROM reachability_samples WHERE ts < ?", (cutoff,)).rowcount
        n += conn.execute("DELETE FROM reachability_events WHERE ts < ?", (cutoff,)).rowcount
    if n:
        logger.info("storage.op action=prune_reachability removed=%d", n)
    return n


# ─── Backup / Restore ───────────────────────────────────────────────────────


def backup_catalog() -> None:
    """Save a timestamped backup of the database via SQLite's online backup API
    (safe to run alongside a writer, unlike a raw file copy with WAL)."""
    with _lock:
        if not DB_FILE.exists():
            return
        # Nanosecond precision so two imports in the same second don't clobber
        # each other's backup; fixed-width keeps the name-sort chronological.
        bak = DB_FILE.parent / f"{DB_FILE.name}.bak-{time.time_ns()}"
        try:
            with closing(_connect()) as src, closing(sqlite3.connect(bak)) as dst:
                src.backup(dst)
        except sqlite3.DatabaseError as exc:
            raise _wrap_db_error(exc) from exc
        logger.info("storage.op action=backup dst=%s", bak.name)
        # Keep only the 5 most recent backups.
        for old in sorted(DB_FILE.parent.glob(f"{DB_FILE.name}.bak-*"))[:-5]:
            old.unlink(missing_ok=True)
            logger.info("storage.op action=prune_backup file=%s", old.name)


def replace_catalog(devices: list, switches: list, cables: list) -> None:
    """Atomically replace the whole catalog with new data.

    A full replace also drops reachability history: deleting devices cascades to
    device_state, reachability_samples and reachability_events (so an import never
    leaves history orphaned to ids that no longer exist)."""
    with _write() as conn:
        conn.execute("DELETE FROM device_state")
        conn.execute("DELETE FROM devices")
        conn.execute("DELETE FROM switches")
        conn.execute("DELETE FROM cables")
        for seq, dev in enumerate(devices):
            doc, online, last = _split_state(dev)
            conn.execute(
                "INSERT INTO devices(id, ip, mac, doc, seq) VALUES (?, ?, ?, ?, ?)",
                (
                    dev["id"],
                    dev.get("ip"),
                    dev.get("mac"),
                    json.dumps(doc, ensure_ascii=False),
                    seq,
                ),
            )
            conn.execute(
                "INSERT INTO device_state(id, online, last) VALUES (?, ?, ?)",
                (dev["id"], online, last),
            )
        for seq, sw in enumerate(switches):
            conn.execute(
                "INSERT INTO switches(id, doc, seq) VALUES (?, ?, ?)",
                (sw["id"], json.dumps(sw, ensure_ascii=False), seq),
            )
        for seq, cb in enumerate(cables):
            conn.execute(
                "INSERT INTO cables(id, doc, seq) VALUES (?, ?, ?)",
                (cb["id"], json.dumps(cb, ensure_ascii=False), seq),
            )
        _touch_catalog(conn)
        logger.info(
            "storage.op action=replace_catalog devices=%d switches=%d cables=%d",
            len(devices),
            len(switches),
            len(cables),
        )
