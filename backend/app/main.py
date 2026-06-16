"""homenet backend — device catalog API.

Serves the device / switch / cable catalog and lets the single-user UI
create, edit and delete devices (spec v1.1 editing brought forward). Data is
persisted to a JSON file via app.storage.

Routes are mounted under /api so a single reverse proxy (nginx) can serve the
SPA and the API from one origin in production.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import socket
import time
from contextlib import asynccontextmanager
from datetime import date

from fastapi import FastAPI, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.responses import Response as FastAPIResponse
from pydantic import BaseModel

from . import collector, storage
from .models import (
    Cable,
    Device,
    DeviceCreate,
    DeviceUpdate,
    Meta,
    Switch,
)

# ─── Structured logging ────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s level=%(levelname)s logger=%(name)s %(message)s',
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("app.startup action=seed")
    storage.ensure_seeded()
    # The collector probes the real network and writes back online/last. Tests
    # set HOMENET_DISABLE_COLLECTOR=1 so they stay deterministic (otherwise a
    # sweep can rewrite seed reachability mid-test and flake the meta counts).
    task = None
    if not os.environ.get("HOMENET_DISABLE_COLLECTOR"):
        task = asyncio.create_task(collector.run_collector(storage))
        logger.info("app.startup action=ready collector=started")
    else:
        logger.info("app.startup action=ready collector=disabled")
    yield
    if task is not None:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
    logger.info("app.shutdown")


app = FastAPI(
    title="homenet API",
    version="1.1.0",
    description="家庭ネットワーク機器カタログ — devices / switches / cables.",
    lifespan=lifespan,
)

# LAN-only tool, single user. CORS is opened for local dev where the Vite dev
# server (5173) talks to the API directly; in docker the SPA is same-origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log every HTTP request with method, path, status and duration."""
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    logger.info(
        'http method=%s path=%s status=%d duration_ms=%.1f',
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


@app.exception_handler(storage.DataFileError)
async def _data_file_error(_request: Request, exc: storage.DataFileError) -> JSONResponse:
    # A hand-edited devices.json with a syntax error should give a clear message
    # ("not valid JSON: ...") instead of an opaque 500.
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/whoami")
def whoami(request: Request) -> dict[str, str | None]:
    """Best-effort client IP so the UI can highlight "this device".

    In docker, nginx forwards the LAN client address in X-Real-IP /
    X-Forwarded-For; direct access (vite dev / tests) falls back to the
    socket peer. Returns null when nothing sensible is available.
    """
    ip = request.headers.get("x-real-ip")
    if not ip:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
    if not ip and request.client:
        ip = request.client.host
    return {"ip": ip or None}


@app.get("/api/meta", response_model=Meta)
def meta() -> Meta:
    devices = storage.list_devices()
    online = sum(1 for d in devices if d.get("online"))
    return Meta(
        total=len(devices),
        online=online,
        offline=len(devices) - online,
        updated_at=storage.updated_at(),
    )


# ─── Devices ──────────────────────────────────────────────────────────────

@app.get("/api/devices", response_model=list[Device])
def get_devices() -> list[dict]:
    return storage.list_devices()


@app.get("/api/devices/{device_id}", response_model=Device)
def get_device(device_id: str) -> dict:
    try:
        return storage.get_device(device_id)
    except storage.NotFoundError:
        raise HTTPException(status_code=404, detail=f"device not found: {device_id}") from None


@app.post("/api/devices", response_model=Device, status_code=201)
def create_device(payload: DeviceCreate) -> dict:
    try:
        return storage.create_device(payload.model_dump(exclude_none=True))
    except storage.ConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.put("/api/devices/{device_id}", response_model=Device)
def update_device(device_id: str, payload: DeviceUpdate) -> dict:
    # exclude_unset (not exclude_none): keys the client omits are left untouched
    # by the storage merge, while keys sent explicitly as null overwrite (clear)
    # the stored value. This lets the edit form erase optional fields without
    # wiping auto-collected `detail` blocks the form never sends.
    body = payload.model_dump(exclude_unset=True)
    body["id"] = device_id
    try:
        return storage.update_device(device_id, body)
    except storage.NotFoundError:
        raise HTTPException(status_code=404, detail=f"device not found: {device_id}") from None
    except storage.ConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.delete("/api/devices/{device_id}", status_code=204)
def delete_device(device_id: str) -> Response:
    try:
        storage.delete_device(device_id)
    except storage.NotFoundError:
        raise HTTPException(status_code=404, detail=f"device not found: {device_id}") from None
    return Response(status_code=204)


@app.post("/api/devices/{device_id}/wake", status_code=200)
def wake_device(device_id: str) -> dict[str, str]:
    """Send a Wake-on-LAN magic packet to the device's MAC address."""
    try:
        device = storage.get_device(device_id)
    except storage.NotFoundError:
        raise HTTPException(status_code=404, detail=f"device not found: {device_id}") from None

    mac = device.get("mac", "")
    if not mac:
        raise HTTPException(status_code=400, detail="device has no MAC address")

    # Normalize MAC: remove separators, convert to bytes
    mac_clean = mac.replace(":", "").replace("-", "").replace(".", "")
    if len(mac_clean) != 12:
        raise HTTPException(status_code=400, detail=f"invalid MAC address: {mac}")

    try:
        mac_bytes = bytes.fromhex(mac_clean)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"invalid MAC address: {mac}") from None

    # Magic packet: 6x 0xFF + 16x MAC
    magic = b"\xff" * 6 + mac_bytes * 16

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            sock.sendto(magic, ("255.255.255.255", 9))
    except OSError as exc:
        raise HTTPException(status_code=503, detail=f"failed to send magic packet: {exc}") from exc

    logger.info("wol device_id=%s mac=%s", device_id, mac)
    return {"status": "sent", "mac": mac}


# ─── Topology (read-only) ───────────────────────────────────────────────────

@app.get("/api/switches", response_model=list[Switch])
def get_switches() -> list[dict]:
    return storage.list_switches()


@app.get("/api/cables", response_model=list[Cable])
def get_cables() -> list[dict]:
    return storage.list_cables()


# ─── Export / Import ───────────────────────────────────────────────────────

@app.get("/api/export")
def export_catalog() -> FastAPIResponse:
    """Download the full catalog as a JSON file."""
    catalog = {
        "devices": storage.list_devices(),
        "switches": storage.list_switches(),
        "cables": storage.list_cables(),
    }
    filename = f"homenet-{date.today().isoformat()}.json"
    return FastAPIResponse(
        content=json.dumps(catalog, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# Cap the import body so a stray multi-GB upload can't OOM the process. A home
# catalog is a few KB; 5 MiB is comfortably generous.
MAX_IMPORT_BYTES = 5 * 1024 * 1024


def _validate_and_dump(
    items: list, model: type[BaseModel], label: str
) -> tuple[list[dict], list[str]]:
    """Validate each item against *model*; return (normalized dicts, errors).

    The normalized dicts come from ``model_dump(exclude_none=True)`` — exactly
    what create_device persists — so an imported device gets the same MAC
    upper-casing and field shape as one added through the form.
    """
    dumped: list[dict] = []
    errors: list[str] = []
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            errors.append(f"{label}[{i}]: must be a JSON object")
            continue
        try:
            dumped.append(model(**item).model_dump(exclude_none=True))
        except Exception as exc:
            errors.append(f"{label}[{i}]: {exc}")
    return dumped, errors


def _check_import_uniqueness(devices: list[dict]) -> list[str]:
    """Reject an import whose devices collide on id / ip / mac (matches the
    409 contract that create_device enforces — import must not be a back door)."""
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


@app.post("/api/import", status_code=200)
async def import_catalog(request: Request, file: UploadFile) -> dict[str, int]:
    """Replace catalog with uploaded JSON after validation."""
    # CSRF guard: a multipart POST is a CORS "simple request" (no preflight), so
    # a malicious site could otherwise auto-submit a form to wipe the catalog.
    # Requiring a custom header forces a preflight, which CORS then blocks for
    # any origin not on the allow-list. The SPA sends this header (see api.ts).
    if not request.headers.get("x-requested-with"):
        raise HTTPException(status_code=403, detail="missing X-Requested-With header")

    # Read at most MAX_IMPORT_BYTES+1 so an oversized upload is rejected without
    # ever buffering the whole thing in memory.
    raw = await file.read(MAX_IMPORT_BYTES + 1)
    if len(raw) > MAX_IMPORT_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"import too large (max {MAX_IMPORT_BYTES // (1024 * 1024)} MiB)",
        )

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail=f"not valid JSON: {exc}") from exc

    if not isinstance(data, dict):
        raise HTTPException(status_code=422, detail="top-level must be a JSON object")

    devices = data.get("devices", [])
    switches = data.get("switches", [])
    cables = data.get("cables", [])

    # All three collections must be arrays before we validate their contents.
    for label, value in (("devices", devices), ("switches", switches), ("cables", cables)):
        if not isinstance(value, list):
            raise HTTPException(status_code=422, detail=f"'{label}' must be an array")

    # Validate + normalize every item so a malformed switch/cable can't be
    # persisted (and later break topology / inventory) and an imported device
    # is stored in the same shape as a form-created one.
    norm_devices, dev_errors = _validate_and_dump(devices, Device, "device")
    norm_switches, sw_errors = _validate_and_dump(switches, Switch, "switch")
    norm_cables, cb_errors = _validate_and_dump(cables, Cable, "cable")
    errors = dev_errors + sw_errors + cb_errors
    if not errors:
        # Only worth checking once every device parsed cleanly.
        errors += _check_import_uniqueness(norm_devices)
    if errors:
        raise HTTPException(status_code=422, detail="; ".join(errors[:5]))

    # Backup current data before replacing
    storage.backup_catalog()
    storage.replace_catalog(norm_devices, norm_switches, norm_cables)

    return {"devices": len(devices), "switches": len(switches), "cables": len(cables)}
