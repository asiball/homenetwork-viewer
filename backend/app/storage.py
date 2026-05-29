"""File-backed storage for the device catalog.

The single source of truth is a JSON document (`devices.json`) holding
`devices`, `switches` and `cables` (spec §3 / §2 note). This keeps the data
human-editable, exactly as the spec intends ("手動編集 or 編集フォーム経由").

Writes are atomic (temp file + os.replace) and guarded by a process-wide lock
so concurrent edits from the single-user UI never corrupt the file.
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

APP_DIR = Path(__file__).resolve().parent
SEED_FILE = APP_DIR / "seed" / "devices.json"

# Runtime data file. Override with HOMENET_DATA_FILE (docker mounts /data).
DATA_FILE = Path(
    os.environ.get("HOMENET_DATA_FILE", str(APP_DIR.parent / "data" / "devices.json"))
)

_lock = threading.RLock()


class NotFoundError(KeyError):
    """Raised when a device id does not exist."""


class ConflictError(ValueError):
    """Raised when creating a device whose id already exists."""


def _empty_doc() -> dict[str, Any]:
    return {"devices": [], "switches": [], "cables": []}


def ensure_seeded() -> None:
    """Create the data file from the bundled seed on first run."""
    with _lock:
        if DATA_FILE.exists():
            return
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        if SEED_FILE.exists():
            shutil.copyfile(SEED_FILE, DATA_FILE)
        else:  # pragma: no cover - seed is shipped with the image
            _write_doc(_empty_doc())


def _read_doc() -> dict[str, Any]:
    with _lock:
        if not DATA_FILE.exists():
            ensure_seeded()
        with DATA_FILE.open("r", encoding="utf-8") as fh:
            doc = json.load(fh)
    # Defensive: guarantee the three collections always exist.
    for key in ("devices", "switches", "cables"):
        doc.setdefault(key, [])
    return doc


def _write_doc(doc: dict[str, Any]) -> None:
    """Atomically replace the data file."""
    with _lock:
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(
            dir=str(DATA_FILE.parent), prefix=".devices.", suffix=".tmp"
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(doc, fh, ensure_ascii=False, indent=2)
                fh.write("\n")
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp, DATA_FILE)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)


# ─── Reads ──────────────────────────────────────────────────────────────────

def list_devices() -> list[dict[str, Any]]:
    return _read_doc()["devices"]


def get_device(device_id: str) -> dict[str, Any]:
    for d in _read_doc()["devices"]:
        if d.get("id") == device_id:
            return d
    raise NotFoundError(device_id)


def list_switches() -> list[dict[str, Any]]:
    return _read_doc()["switches"]


def list_cables() -> list[dict[str, Any]]:
    return _read_doc()["cables"]


def updated_at() -> Optional[str]:
    if not DATA_FILE.exists():
        return None
    ts = DATA_FILE.stat().st_mtime
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


# ─── Writes ─────────────────────────────────────────────────────────────────

def create_device(device: dict[str, Any]) -> dict[str, Any]:
    with _lock:
        doc = _read_doc()
        if any(d.get("id") == device["id"] for d in doc["devices"]):
            raise ConflictError(device["id"])
        doc["devices"].append(device)
        _write_doc(doc)
        return device


def update_device(device_id: str, device: dict[str, Any]) -> dict[str, Any]:
    with _lock:
        doc = _read_doc()
        for i, d in enumerate(doc["devices"]):
            if d.get("id") == device_id:
                device["id"] = device_id  # id is immutable
                doc["devices"][i] = device
                _write_doc(doc)
                return device
        raise NotFoundError(device_id)


def delete_device(device_id: str) -> None:
    with _lock:
        doc = _read_doc()
        before = len(doc["devices"])
        doc["devices"] = [d for d in doc["devices"] if d.get("id") != device_id]
        if len(doc["devices"]) == before:
            raise NotFoundError(device_id)
        _write_doc(doc)
