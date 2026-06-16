"""File-backed storage for the device catalog.

The single source of truth is a JSON document (`devices.json`) holding
`devices`, `switches` and `cables` (spec §3 / §2 note). This keeps the data
human-editable, exactly as the spec intends ("手動編集 or 編集フォーム経由").

Writes are atomic (temp file + os.replace) and guarded by a process-wide lock
so concurrent edits from the single-user UI never corrupt the file.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import tempfile
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

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


class DataFileError(RuntimeError):
    """Raised when the data file exists but cannot be parsed as JSON."""


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
            logger.info("storage.seed action=copy src=%s dst=%s", SEED_FILE, DATA_FILE)
        else:  # pragma: no cover - seed is shipped with the image
            _write_doc(_empty_doc())
            logger.info("storage.seed action=empty dst=%s", DATA_FILE)


def _read_doc() -> dict[str, Any]:
    with _lock:
        if not DATA_FILE.exists():
            ensure_seeded()
        with DATA_FILE.open("r", encoding="utf-8") as fh:
            try:
                doc = json.load(fh)
            except json.JSONDecodeError as exc:
                logger.error("storage.read error=invalid_json file=%s", DATA_FILE.name)
                raise DataFileError(
                    f"{DATA_FILE.name} is not valid JSON: {exc}"
                ) from exc
    # Valid JSON but the wrong shape (e.g. a top-level array) would otherwise
    # blow up on .setdefault below — surface it as a clear DataFileError too.
    if not isinstance(doc, dict):
        logger.error("storage.read error=wrong_shape file=%s", DATA_FILE.name)
        raise DataFileError(
            f"{DATA_FILE.name} must be a JSON object with "
            "devices / switches / cables arrays"
        )
    # Defensive: guarantee the three collections always exist and are arrays
    # (a hand-edit like {"devices": {}} would otherwise crash the iterators).
    for key in ("devices", "switches", "cables"):
        doc.setdefault(key, [])
        if not isinstance(doc[key], list):
            logger.error("storage.read error=bad_collection key=%s file=%s", key, DATA_FILE.name)
            raise DataFileError(f"{DATA_FILE.name}: '{key}' must be a JSON array")
    logger.debug("storage.read action=read file=%s", DATA_FILE.name)
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
            logger.debug("storage.write action=write file=%s", DATA_FILE.name)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)


# ─── Helpers ────────────────────────────────────────────────────────────────

def _deep_merge(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    """Recursively merge *overlay* into *base*, returning the merged result.

    For keys present in both dicts whose values are themselves dicts, the merge
    recurses. All other overlay values overwrite the base. Keys in *base* that
    are absent from *overlay* are preserved.
    """
    merged = dict(base)
    for key, value in overlay.items():
        if (
            key in merged
            and isinstance(merged[key], dict)
            and isinstance(value, dict)
        ):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _check_ip_mac_unique(
    devices: list[dict[str, Any]],
    ip: str | None,
    mac: str | None,
    exclude_id: str | None = None,
) -> None:
    """Raise `ConflictError` if *ip* or *mac* already belong to another device."""
    for d in devices:
        if exclude_id is not None and d.get("id") == exclude_id:
            continue
        if ip and d.get("ip") == ip:
            raise ConflictError(f"ip already in use by '{d.get('name', d.get('id'))}'")
        if mac and d.get("mac") and mac.upper() == d["mac"].upper():
            raise ConflictError(f"mac already in use by '{d.get('name', d.get('id'))}'")



# ─── Reads ──────────────────────────────────────────────────────────────────

def list_devices() -> list[dict[str, Any]]:
    logger.debug("storage.op action=list_devices")
    return _read_doc()["devices"]


def get_device(device_id: str) -> dict[str, Any]:
    for d in _read_doc()["devices"]:
        if d.get("id") == device_id:
            logger.debug("storage.op action=get_device id=%s", device_id)
            return d
    logger.warning("storage.op action=get_device id=%s error=not_found", device_id)
    raise NotFoundError(device_id)


def list_switches() -> list[dict[str, Any]]:
    return _read_doc()["switches"]


def list_cables() -> list[dict[str, Any]]:
    return _read_doc()["cables"]


def updated_at() -> str | None:
    if not DATA_FILE.exists():
        return None
    ts = DATA_FILE.stat().st_mtime
    return datetime.fromtimestamp(ts, tz=UTC).isoformat()


# ─── Writes ─────────────────────────────────────────────────────────────────

def create_device(device: dict[str, Any]) -> dict[str, Any]:
    with _lock:
        doc = _read_doc()
        if any(d.get("id") == device["id"] for d in doc["devices"]):
            raise ConflictError(device["id"])
        _check_ip_mac_unique(doc["devices"], device.get("ip"), device.get("mac"))
        doc["devices"].append(device)
        _write_doc(doc)
        logger.info("storage.op action=create_device id=%s", device.get("id"))
        return device


def update_device(device_id: str, device: dict[str, Any]) -> dict[str, Any]:
    with _lock:
        doc = _read_doc()
        for i, d in enumerate(doc["devices"]):
            if d.get("id") == device_id:
                _check_ip_mac_unique(
                    doc["devices"], device.get("ip"), device.get("mac"),
                    exclude_id=device_id,
                )
                merged = _deep_merge(d, device)
                merged["id"] = device_id  # id is immutable
                doc["devices"][i] = merged
                _write_doc(doc)
                logger.info("storage.op action=update_device id=%s", device_id)
                return merged
        logger.warning("storage.op action=update_device id=%s error=not_found", device_id)
        raise NotFoundError(device_id)


def delete_device(device_id: str) -> None:
    with _lock:
        doc = _read_doc()
        before = len(doc["devices"])
        doc["devices"] = [d for d in doc["devices"] if d.get("id") != device_id]
        if len(doc["devices"]) == before:
            logger.warning("storage.op action=delete_device id=%s error=not_found", device_id)
            raise NotFoundError(device_id)
        _write_doc(doc)
        logger.info("storage.op action=delete_device id=%s", device_id)


def bulk_update_reachability(updates: list[dict]) -> None:
    """Update online/last for multiple devices atomically."""
    with _lock:
        data = _read_doc()
        by_id = {u["id"]: u for u in updates}
        for d in data.get("devices", []):
            upd = by_id.get(d.get("id"))
            if upd is None:
                continue
            d["online"] = upd["online"]
            if upd["online"] and upd.get("last"):
                d["last"] = upd["last"]
        _write_doc(data)


# ─── Backup / Restore ───────────────────────────────────────────────────────

def backup_catalog() -> None:
    """Save a timestamped backup of the current data file."""
    import time as _time
    with _lock:
        if DATA_FILE.exists():
            bak = DATA_FILE.parent / f"devices.json.bak-{int(_time.time())}"
            shutil.copy2(DATA_FILE, bak)
            logger.info("storage.op action=backup dst=%s", bak.name)
            # Keep only the 5 most recent backups
            baks = sorted(DATA_FILE.parent.glob("devices.json.bak-*"))
            for old in baks[:-5]:
                old.unlink(missing_ok=True)
                logger.info("storage.op action=prune_backup file=%s", old.name)


def replace_catalog(devices: list, switches: list, cables: list) -> None:
    """Atomically replace the catalog with new data."""
    with _lock:
        current = _read_doc()
        current["devices"] = devices
        current["switches"] = switches
        current["cables"] = cables
        _write_doc(current)
        logger.info(
            "storage.op action=replace_catalog devices=%d switches=%d cables=%d",
            len(devices), len(switches), len(cables),
        )
