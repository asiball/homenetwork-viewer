"""Pydantic models for the homenet device catalog.

The data model follows spec/homenet-spec.md §3. Required device fields are
strict; everything else is optional because "detail data is normally absent"
(§3.3). Validation is intentionally lenient on nested detail blocks so that
hand-edited devices.json files keep working.
"""

from __future__ import annotations

import ipaddress
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

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
    ipv4: str | None = None
    ipv6: str | None = None
    gateway: str | None = None
    dns: str | None = None
    dhcp: str | None = None
    vlan: str | None = None
    rssi: str | None = None


class HwInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")
    cpu_full: str | None = None
    arch: str | None = None
    mem_full: str | None = None
    chassis: str | None = None
    bios: str | None = None
    motherboard: str | None = None
    gpu: list[str] | None = None
    storage_drives: list[str] | None = None


class Metrics(BaseModel):
    model_config = ConfigDict(extra="ignore")
    # Percentages are 0–100: reject absurd values (cpu_pct: 150) at the import
    # boundary so they never reach the UI bars (issue #88).
    cpu_pct: float | None = Field(default=None, ge=0, le=100)
    cpu_series: list[float] | None = None
    mem_pct: float | None = Field(default=None, ge=0, le=100)
    mem_series: list[float] | None = None
    net_in: float | None = None
    net_out: float | None = None
    net_in_series: list[float] | None = None
    temp: float | None = None


class Service(BaseModel):
    model_config = ConfigDict(extra="ignore")
    port: int = Field(ge=1, le=65535)
    proto: str = "tcp"
    svc: str = ""
    banner: str = ""


class Drive(BaseModel):
    model_config = ConfigDict(extra="ignore")
    nm: str
    md: str | None = None
    size: str | None = None
    pct: float = Field(default=0, ge=0, le=100)


class StorageInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")
    drives: list[Drive] | None = None
    pool: str | None = None
    health: str | None = None


class Ownership(BaseModel):
    model_config = ConfigDict(extra="ignore")
    manufacturer: str | None = None
    model: str | None = None
    purchased: str | None = None
    price: str | None = None
    warranty: str | None = None
    location: str | None = None
    tags: list[str] | None = None


class DeviceDetail(BaseModel):
    """Detail-view-only payload (spec §3.3). All fields optional / nullable."""

    model_config = ConfigDict(extra="ignore")
    net: NetInfo | None = None
    hw: HwInfo | None = None
    metrics: Metrics | None = None
    services: list[Service] | None = None
    storage: StorageInfo | None = None
    hist7: list[float] | None = None
    own: Ownership | None = None


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
    cpu: str | None = None
    mem: str | None = None
    storage: str | None = None
    conn: Conn | None = None
    ring: Literal[0, 1, 2] | None = None
    idx: int | None = None
    last: str | None = None
    uptime: str | None = None
    notes: str | None = None
    # Admin / web UI of the device, opened in a new tab by the frontend.
    url: str | None = None

    detail: DeviceDetail | None = None

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
    def _valid_url(cls, v: str | None) -> str | None:
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
    """Body for PUT /api/devices/{id} — id is immutable, taken from the path.

    `online` is overridden to Optional[bool] = None so that omitting it from
    the PUT body leaves None as the unset sentinel.  Combined with
    ``model_dump(exclude_unset=True)`` in the route handler, omitting `online`
    means "keep the stored value" rather than silently writing False.
    (Fixes issue #12.)
    """

    # DeviceBase defines `online: bool = False`.  That default is fine for
    # POST (DeviceCreate) but wrong for PUT: an omitted field should not
    # overwrite the stored value.  Declaring it Optional here makes the
    # distinction explicit and prevents future regressions.
    online: bool | None = None


class Device(DeviceCreate):
    """A stored device: create payload + its (immutable) id."""


class PortSlot(BaseModel):
    model_config = ConfigDict(extra="ignore")
    device: str
    cable: str | None = None
    role: Literal["uplink", "downlink"] | None = None


class Switch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    model: str | None = None
    type: Literal["switch", "hub"] = "switch"
    location: str | None = None
    portCount: int | None = None
    speed: str | None = None
    managed: bool | None = None
    online: bool = True
    notes: str | None = None
    radio: str | None = None
    portMap: dict[str, PortSlot | None] = {}


class Cable(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    cat: str | None = None
    len: str | None = None
    color: str | None = None
    jacket: str | None = None
    fromDev: str
    fromPort: str | int | None = None
    toDev: str
    toPort: str | int | None = None
    notes: str | None = None


class Meta(BaseModel):
    total: int
    online: int
    offline: int
    updated_at: str | None = None
