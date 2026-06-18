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
import time
from contextlib import asynccontextmanager
from datetime import date

from fastapi import FastAPI, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.responses import Response as FastAPIResponse
from pydantic import BaseModel

from . import collector, oui, storage, wol
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
    format="%(asctime)s level=%(levelname)s logger=%(name)s %(message)s",
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
# server (5173) talks to the API directly; in docker the SPA is same-origin and
# needs none. Origins are configurable via HOMENET_CORS_ORIGINS (comma list);
# set it empty in production to drop the middleware entirely (#89).
_DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080"
)
_cors_origins = [
    o.strip()
    for o in os.environ.get("HOMENET_CORS_ORIGINS", _DEFAULT_CORS_ORIGINS).split(",")
    if o.strip()
]
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
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
        "http method=%s path=%s status=%d duration_ms=%.1f",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


@app.exception_handler(storage.DataFileError)
async def _data_file_error(_request: Request, exc: storage.DataFileError) -> JSONResponse:
    # An unreadable / corrupt database should give a clear message instead of an
    # opaque 500, so an operator can tell "data problem" apart from "app bug".
    return JSONResponse(status_code=503, content={"detail": str(exc)})


# Map the storage layer's domain errors to HTTP once, here, so the route
# handlers stay on the happy path instead of repeating the same try/except.
@app.exception_handler(storage.NotFoundError)
async def _not_found(_request: Request, exc: storage.NotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": f"device not found: {exc}"})


@app.exception_handler(storage.ConflictError)
async def _conflict(_request: Request, exc: storage.ConflictError) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": str(exc)})


@app.get("/api/health")
def health() -> dict[str, str]:
    """Liveness: the process is up and serving. Always 200 while running."""
    return {"status": "ok"}


@app.get("/api/ready")
def ready() -> dict[str, str]:
    """Readiness: liveness *and* the database is readable (#89).

    Unlike /api/health this returns 503 when the database is corrupt, so an
    operator can tell "process up" apart from "actually able to serve data".
    """
    try:
        storage.list_devices()
    except storage.DataFileError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"status": "ready"}


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


@app.get("/api/oui/{mac}")
def oui_lookup(mac: str) -> dict[str, str | None]:
    """Manufacturer for a MAC address (or prefix), via the bundled IEEE table.

    Used by the edit form to suggest `ownership.manufacturer` while typing the
    MAC (issue #107). Always 200: a randomized / unregistered prefix returns
    ``{"manufacturer": null}`` rather than a 404 so the UI treats "no vendor"
    as a quiet non-suggestion, not an error.
    """
    return {"manufacturer": oui.lookup(mac)}


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
    # storage.NotFoundError -> 404 via the exception handler above.
    return storage.get_device(device_id)


@app.post("/api/devices", response_model=Device, status_code=201)
def create_device(payload: DeviceCreate) -> dict:
    # storage.ConflictError (duplicate id/ip/mac) -> 409 via the handler above.
    return storage.create_device(payload.model_dump(exclude_none=True))


@app.put("/api/devices/{device_id}", response_model=Device)
def update_device(device_id: str, payload: DeviceUpdate) -> dict:
    # exclude_unset (not exclude_none): keys the client omits are left untouched
    # by the storage merge, while keys sent explicitly as null overwrite (clear)
    # the stored value. This lets the edit form erase optional fields without
    # wiping auto-collected `detail` blocks the form never sends.
    body = payload.model_dump(exclude_unset=True)
    body["id"] = device_id
    # NotFoundError -> 404, ConflictError -> 409 via the handlers above.
    return storage.update_device(device_id, body)


@app.delete("/api/devices/{device_id}", status_code=204)
def delete_device(device_id: str) -> Response:
    storage.delete_device(device_id)  # NotFoundError -> 404 via the handler above
    return Response(status_code=204)


@app.post("/api/devices/{device_id}/wake", status_code=200)
def wake_device(device_id: str) -> dict[str, str]:
    """Send a Wake-on-LAN magic packet to the device's MAC address."""
    device = storage.get_device(device_id)  # NotFoundError -> 404 via the handler

    mac = device.get("mac", "")
    if not mac:
        raise HTTPException(status_code=400, detail="device has no MAC address")

    try:
        wol.send_magic_packet(mac)
    except wol.InvalidMacError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=503, detail=f"failed to send magic packet: {exc}") from exc

    logger.info("wol device_id=%s mac=%s", device_id, mac)
    return {"status": "sent", "mac": mac}


# ─── Topology (read-only) ───────────────────────────────────────────────────


@app.get("/api/switches", response_model=list[Switch])
def get_switches() -> list[dict]:
    """List switches/hubs. Read-only by design (#123): the switch/cable ledger
    is edited as a whole via export → hand-edit → import, not per-row CRUD. If
    per-row editing is ever added, route it through storage._write so it stays
    symmetric with the device endpoints."""
    return storage.list_switches()


@app.get("/api/cables", response_model=list[Cable])
def get_cables() -> list[dict]:
    """List cables. Read-only by design — see get_switches (#123)."""
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


def _check_referential_integrity(
    devices: list[dict], switches: list[dict], cables: list[dict]
) -> list[str]:
    """Reject an import whose cables / switch ports point at ids that aren't in
    the same payload (#88). A dangling `fromDev` / `toDev` / `portMap[].device`
    would otherwise be saved silently and break topology / inventory rendering.

    Valid targets are device *and* switch ids — a cable or port can connect to
    either (e.g. a switch uplinked to another switch)."""
    valid = {d["id"] for d in devices if d.get("id")} | {s["id"] for s in switches if s.get("id")}
    errors: list[str] = []
    for i, c in enumerate(cables):
        for key in ("fromDev", "toDev"):
            ref = c.get(key)
            if ref and ref not in valid:
                errors.append(f"cable[{i}]: {key} {ref!r} is not a known device/switch id")
    for i, s in enumerate(switches):
        for port, slot in (s.get("portMap") or {}).items():
            ref = slot.get("device") if isinstance(slot, dict) else None
            if ref and ref not in valid:
                errors.append(
                    f"switch[{i}] port {port}: device {ref!r} is not a known device/switch id"
                )
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
        # Only worth checking once every item parsed cleanly. Uniqueness is
        # enforced by storage so import and create share one contract (#123).
        errors += storage.find_duplicate_identities(norm_devices)
        errors += _check_referential_integrity(norm_devices, norm_switches, norm_cables)
    if errors:
        raise HTTPException(status_code=422, detail="; ".join(errors[:5]))

    # Backup current data before replacing
    storage.backup_catalog()
    storage.replace_catalog(norm_devices, norm_switches, norm_cables)

    return {"devices": len(devices), "switches": len(switches), "cables": len(cables)}
