"""Pydantic models for the homenet device catalog.

The data model follows spec/homenet-spec.md §3. Required device fields are
strict; everything else is optional because "detail data is normally absent"
(§3.3). Validation is intentionally lenient on nested detail blocks so that
hand-edited devices.json files keep working.
"""

from __future__ import annotations

import ipaddress
import re
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator

Group = Literal["Infra", "IoT", "Media", "Mobile", "Computer", "Misc"]

# Spec §3.2 connection enum. "—" means not applicable (e.g. the gateway).
Conn = Literal[
    "Wired 1G",
    "Wired 2.5G",
    "Wired 100M",
    "Wi-Fi 2.4 GHz",
    "Wi-Fi 5 GHz",
    "Wi-Fi 6 GHz",
    "—",
]

MAC_RE = re.compile(r"^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$")
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")  # kebab-case (spec §3.1)


class NetInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")
    ipv4: Optional[str] = None
    ipv6: Optional[str] = None
    gateway: Optional[str] = None
    dns: Optional[str] = None
    dhcp: Optional[str] = None
    vlan: Optional[str] = None
    rssi: Optional[str] = None


class HwInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")
    cpu_full: Optional[str] = None
    arch: Optional[str] = None
    mem_full: Optional[str] = None
    chassis: Optional[str] = None
    bios: Optional[str] = None
    motherboard: Optional[str] = None
    gpu: Optional[List[str]] = None
    storage_drives: Optional[List[str]] = None


class Metrics(BaseModel):
    model_config = ConfigDict(extra="ignore")
    cpu_pct: Optional[float] = None
    cpu_series: Optional[List[float]] = None
    mem_pct: Optional[float] = None
    mem_series: Optional[List[float]] = None
    net_in: Optional[float] = None
    net_out: Optional[float] = None
    net_in_series: Optional[List[float]] = None
    temp: Optional[float] = None


class Service(BaseModel):
    model_config = ConfigDict(extra="ignore")
    port: int
    proto: str = "tcp"
    svc: str = ""
    banner: str = ""


class Drive(BaseModel):
    model_config = ConfigDict(extra="ignore")
    nm: str
    md: Optional[str] = None
    size: Optional[str] = None
    pct: float = 0


class StorageInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")
    drives: Optional[List[Drive]] = None
    pool: Optional[str] = None
    health: Optional[str] = None


class Ownership(BaseModel):
    model_config = ConfigDict(extra="ignore")
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    purchased: Optional[str] = None
    price: Optional[str] = None
    warranty: Optional[str] = None
    location: Optional[str] = None
    tags: Optional[List[str]] = None


class DeviceDetail(BaseModel):
    """Detail-view-only payload (spec §3.3). All fields optional / nullable."""

    model_config = ConfigDict(extra="ignore")
    net: Optional[NetInfo] = None
    hw: Optional[HwInfo] = None
    metrics: Optional[Metrics] = None
    services: Optional[List[Service]] = None
    storage: Optional[StorageInfo] = None
    hist7: Optional[List[float]] = None
    own: Optional[Ownership] = None


class DeviceBase(BaseModel):
    """Fields a client may set. `id` lives on Device / is taken from the path."""

    model_config = ConfigDict(extra="ignore")

    name: str
    host: str
    ip: str
    mac: str
    group: Group
    type: str
    online: bool = False

    # optional spec §3.2
    cpu: Optional[str] = None
    mem: Optional[str] = None
    storage: Optional[str] = None
    conn: Optional[Conn] = None
    ring: Optional[Literal[0, 1, 2]] = None
    idx: Optional[int] = None
    last: Optional[str] = None
    uptime: Optional[str] = None
    notes: Optional[str] = None
    # Admin / web UI of the device, opened in a new tab by the frontend.
    url: Optional[str] = None

    detail: Optional[DeviceDetail] = None

    @field_validator("ip")
    @classmethod
    def _valid_ipv4(cls, v: str) -> str:
        try:
            ipaddress.IPv4Address(v)
        except ipaddress.AddressValueError as exc:
            raise ValueError(f"invalid IPv4 address: {v!r}") from exc
        return v

    @field_validator("mac")
    @classmethod
    def _valid_mac(cls, v: str) -> str:
        if not MAC_RE.match(v):
            raise ValueError(f"invalid MAC address: {v!r} (expected XX:XX:XX:XX:XX:XX)")
        return v.upper()

    @field_validator("name", "host")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("must not be blank")
        return v

    @field_validator("url")
    @classmethod
    def _valid_url(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        if not v.startswith(("http://", "https://")):
            raise ValueError(
                f"invalid url: {v!r} (must start with http:// or https://)"
            )
        return v


class DeviceCreate(DeviceBase):
    """Body for POST /api/devices — id is supplied by the client (kebab-case)."""

    id: str

    @field_validator("id")
    @classmethod
    def _valid_id(cls, v: str) -> str:
        if not ID_RE.match(v):
            raise ValueError(
                f"invalid id: {v!r} (use kebab-case: lower-case letters, digits and hyphens)"
            )
        return v


class DeviceUpdate(DeviceBase):
    """Body for PUT /api/devices/{id} — id is immutable, taken from the path."""


class Device(DeviceCreate):
    """A stored device: create payload + its (immutable) id."""


class PortSlot(BaseModel):
    model_config = ConfigDict(extra="ignore")
    device: str
    cable: Optional[str] = None
    role: Optional[Literal["uplink", "downlink"]] = None


class Switch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    model: Optional[str] = None
    type: Literal["switch", "hub"] = "switch"
    location: Optional[str] = None
    portCount: Optional[int] = None
    speed: Optional[str] = None
    managed: Optional[bool] = None
    online: bool = True
    notes: Optional[str] = None
    radio: Optional[str] = None
    portMap: dict[str, Optional[PortSlot]] = {}


class Cable(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    cat: Optional[str] = None
    len: Optional[str] = None
    color: Optional[str] = None
    jacket: Optional[str] = None
    fromDev: str
    fromPort: Optional[str | int] = None
    toDev: str
    toPort: Optional[str | int] = None
    notes: Optional[str] = None


class Meta(BaseModel):
    total: int
    online: int
    offline: int
    updated_at: Optional[str] = None
