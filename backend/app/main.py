"""homenet backend — device catalog API.

Serves the device / switch / cable catalog and lets the single-user UI
create, edit and delete devices (spec v1.1 editing brought forward). Data is
persisted to a JSON file via app.storage.

Routes are mounted under /api so a single reverse proxy (nginx) can serve the
SPA and the API from one origin in production.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

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
    storage.ensure_seeded()
    yield


app = FastAPI(
    title="homenet API",
    version="1.0.0",
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


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


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
    except storage.ConflictError:
        raise HTTPException(
            status_code=409, detail=f"device id already exists: {payload.id}"
        )


@app.put("/api/devices/{device_id}", response_model=Device)
def update_device(device_id: str, payload: DeviceUpdate) -> dict:
    body = payload.model_dump(exclude_none=True)
    body["id"] = device_id
    try:
        return storage.update_device(device_id, body)
    except storage.NotFoundError:
        raise HTTPException(status_code=404, detail=f"device not found: {device_id}")


@app.delete("/api/devices/{device_id}", status_code=204)
def delete_device(device_id: str) -> Response:
    try:
        storage.delete_device(device_id)
    except storage.NotFoundError:
        raise HTTPException(status_code=404, detail=f"device not found: {device_id}")
    return Response(status_code=204)


# ─── Topology (read-only) ───────────────────────────────────────────────────

@app.get("/api/switches", response_model=list[Switch])
def get_switches() -> list[dict]:
    return storage.list_switches()


@app.get("/api/cables", response_model=list[Cable])
def get_cables() -> list[dict]:
    return storage.list_cables()
