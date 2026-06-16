"""homenet backend — device catalog API.

Serves the device / switch / cable catalog and lets the single-user UI
create, edit and delete devices (spec v1.1 editing brought forward). Data is
persisted to a JSON file via app.storage.

Routes are mounted under /api so a single reverse proxy (nginx) can serve the
SPA and the API from one origin in production.
"""

from __future__ import annotations

import logging
import socket
import struct
import time
from contextlib import asynccontextmanager

import json
from datetime import date

from fastapi import FastAPI, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.responses import Response as FastAPIResponse

# ─── Structured logging ────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s level=%(levelname)s logger=%(name)s %(message)s',
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger(__name__)

from . import storage
from .models import (
    Cable,
    Device,
    DeviceCreate,
    DeviceUpdate,
    Meta,
    Switch,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("app.startup action=seed")
    storage.ensure_seeded()
    logger.info("app.startup action=ready")
    yield
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
        raise HTTPException(status_code=404, detail=f"device not found: {device_id}")


@app.post("/api/devices", response_model=Device, status_code=201)
def create_device(payload: DeviceCreate) -> dict:
    try:
        return storage.create_device(payload.model_dump(exclude_none=True))
    except storage.ConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


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
        raise HTTPException(status_code=404, detail=f"device not found: {device_id}")
    except storage.ConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@app.delete("/api/devices/{device_id}", status_code=204)
def delete_device(device_id: str) -> Response:
    try:
        storage.delete_device(device_id)
    except storage.NotFoundError:
        raise HTTPException(status_code=404, detail=f"device not found: {device_id}")
    return Response(status_code=204)


@app.post("/api/devices/{device_id}/wake", status_code=200)
def wake_device(device_id: str) -> dict[str, str]:
    """Send a Wake-on-LAN magic packet to the device's MAC address."""
    try:
        device = storage.get_device(device_id)
    except storage.NotFoundError:
        raise HTTPException(status_code=404, detail=f"device not found: {device_id}")

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
        raise HTTPException(status_code=400, detail=f"invalid MAC address: {mac}")

    # Magic packet: 6x 0xFF + 16x MAC
    magic = b"\xff" * 6 + mac_bytes * 16

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            sock.sendto(magic, ("255.255.255.255", 9))
    except OSError as exc:
        raise HTTPException(status_code=503, detail=f"failed to send magic packet: {exc}")

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


@app.post("/api/import", status_code=200)
async def import_catalog(file: UploadFile) -> dict[str, int]:
    """Replace catalog with uploaded JSON after validation."""
    raw = await file.read()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail=f"not valid JSON: {exc}")

    if not isinstance(data, dict):
        raise HTTPException(status_code=422, detail="top-level must be a JSON object")

    devices = data.get("devices", [])
    switches = data.get("switches", [])
    cables = data.get("cables", [])

    if not isinstance(devices, list):
        raise HTTPException(status_code=422, detail="'devices' must be an array")

    # Validate each device against the Device model
    from .models import Device as DeviceModel
    errors = []
    for i, d in enumerate(devices):
        try:
            DeviceModel(**d)
        except Exception as exc:
            errors.append(f"device[{i}]: {exc}")

    if errors:
        raise HTTPException(status_code=422, detail="; ".join(errors[:5]))

    # Backup current data before replacing
    storage.backup_catalog()
    storage.replace_catalog(devices, switches, cables)

    return {"devices": len(devices), "switches": len(switches), "cables": len(cables)}
