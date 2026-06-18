"""Tests for custom-PC Part / BuildEvent models (issue #97)."""

import pytest
from pydantic import ValidationError

from app.models import BuildEvent, Device, Part


def _device_with(detail: dict) -> dict:
    # Identity kept off the seeded ranges so the create round-trip can't 409.
    return {
        "id": "test-rig",
        "name": "Rig",
        "host": "rig.home.arpa",
        "ip": "192.168.1.231",
        "mac": "DE:AD:BE:EF:97:01",
        "group": "Computer",
        "type": "desktop",
        "detail": detail,
    }


def test_part_valid():
    p = Part(
        id="cpu-1",
        category="cpu",
        model="Ryzen 7 7800X3D",
        purchased="2024-03-01",
        price_jpy=58000,
        warranty_until="2026-03-01",
        status="active",
    )
    assert p.price_jpy == 58000
    assert p.status == "active"


def test_part_defaults_status_active():
    assert Part(id="g1", category="gpu", model="RTX 4070").status == "active"


def test_part_rejects_bad_category():
    with pytest.raises(ValidationError):
        Part(id="x", category="motherboardd", model="oops")


def test_part_rejects_negative_price():
    with pytest.raises(ValidationError):
        Part(id="x", category="psu", model="Corsair", price_jpy=-1)


def test_part_rejects_bad_date():
    with pytest.raises(ValidationError):
        Part(id="x", category="cpu", model="c", purchased="2024/03/01")


def test_part_blank_model_rejected():
    with pytest.raises(ValidationError):
        Part(id="x", category="cpu", model="  ")


def test_build_event_valid():
    e = BuildEvent(
        date="2024-06-01", action="replace", part_id="ssd-2", note="swapped failing drive"
    )
    assert e.action == "replace"


def test_build_event_requires_date():
    with pytest.raises(ValidationError):
        BuildEvent(date="", action="add", part_id="p1")


def test_build_event_rejects_bad_action():
    with pytest.raises(ValidationError):
        BuildEvent(date="2024-06-01", action="upgrade", part_id="p1")


def test_device_roundtrips_parts_and_events():
    d = Device(
        **_device_with(
            {
                "parts": [
                    {"id": "cpu-1", "category": "cpu", "model": "N100", "price_jpy": 20000},
                    {"id": "ssd-1", "category": "storage", "model": "990 Pro", "status": "failing"},
                ],
                "build_events": [
                    {"date": "2024-01-02", "action": "add", "part_id": "cpu-1"},
                ],
            }
        )
    )
    dumped = d.model_dump(exclude_none=True)
    assert len(dumped["detail"]["parts"]) == 2
    assert dumped["detail"]["parts"][1]["status"] == "failing"
    assert dumped["detail"]["build_events"][0]["action"] == "add"


def test_api_create_with_parts(client):
    payload = _device_with(
        {"parts": [{"id": "gpu-1", "category": "gpu", "model": "RTX 4070", "price_jpy": 90000}]}
    )
    r = client.post("/api/devices", json=payload)
    assert r.status_code == 201
    got = client.get("/api/devices/test-rig").json()
    assert got["detail"]["parts"][0]["model"] == "RTX 4070"


def test_api_create_rejects_bad_part(client):
    payload = _device_with(
        {"parts": [{"id": "x", "category": "cpu", "model": "c", "price_jpy": -5}]}
    )
    r = client.post("/api/devices", json=payload)
    assert r.status_code == 422
