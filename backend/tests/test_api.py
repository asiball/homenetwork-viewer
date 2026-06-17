"""API tests for the homenet backend."""

from app import storage


def _sample_device(**overrides):
    d = {
        "id": "test-pi",
        "name": "Test Pi",
        "host": "pi.home.arpa",
        "ip": "192.168.1.99",
        "mac": "DE:AD:BE:EF:00:01",
        "group": "Computer",
        "type": "desktop",
        "online": True,
        "conn": "Wired 1G",
    }
    d.update(overrides)
    return d


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_seed_loaded(client):
    devices = client.get("/api/devices").json()
    assert len(devices) == 22
    ids = {d["id"] for d in devices}
    assert {"gw", "nas", "pix"} <= ids


def test_meta_counts(client):
    meta = client.get("/api/meta").json()
    assert meta["total"] == 22
    assert meta["online"] + meta["offline"] == 22
    assert meta["online"] == 15


def test_get_one_device_with_detail(client):
    nas = client.get("/api/devices/nas").json()
    assert nas["name"] == "NAS"
    assert nas["detail"]["metrics"]["cpu_pct"] == 18
    assert len(nas["detail"]["services"]) == 7


def test_get_missing_device_404(client):
    assert client.get("/api/devices/nope").status_code == 404


def test_switches_and_cables(client):
    assert len(client.get("/api/switches").json()) == 4
    assert len(client.get("/api/cables").json()) == 9


def test_create_device(client):
    r = client.post("/api/devices", json=_sample_device())
    assert r.status_code == 201
    assert r.json()["mac"] == "DE:AD:BE:EF:00:01"
    # persisted
    assert client.get("/api/devices/test-pi").status_code == 200
    assert len(client.get("/api/devices").json()) == 23


def test_create_duplicate_id_conflicts(client):
    assert client.post("/api/devices", json=_sample_device(id="nas")).status_code == 409


def test_create_rejects_bad_ip(client):
    r = client.post("/api/devices", json=_sample_device(ip="999.1.1.1"))
    assert r.status_code == 422


def test_create_rejects_bad_mac(client):
    r = client.post("/api/devices", json=_sample_device(mac="xyz"))
    assert r.status_code == 422


def test_create_rejects_bad_id(client):
    r = client.post("/api/devices", json=_sample_device(id="Not Kebab"))
    assert r.status_code == 422


def test_create_rejects_bad_group(client):
    r = client.post("/api/devices", json=_sample_device(group="Nonsense"))
    assert r.status_code == 422


def test_update_device(client):
    client.post("/api/devices", json=_sample_device())
    r = client.put("/api/devices/test-pi", json=_sample_device(name="Renamed", online=False))
    assert r.status_code == 200
    assert r.json()["name"] == "Renamed"
    assert client.get("/api/devices/test-pi").json()["online"] is False


def test_update_keeps_id_immutable(client):
    client.post("/api/devices", json=_sample_device())
    # try to sneak a different id in the body — path id wins
    r = client.put("/api/devices/test-pi", json=_sample_device(id="hacked", name="X"))
    assert r.status_code == 200
    assert r.json()["id"] == "test-pi"
    assert client.get("/api/devices/hacked").status_code == 404


def test_update_missing_404(client):
    assert client.put("/api/devices/ghost", json=_sample_device()).status_code == 404


def test_delete_device(client):
    client.post("/api/devices", json=_sample_device())
    assert client.delete("/api/devices/test-pi").status_code == 204
    assert client.get("/api/devices/test-pi").status_code == 404


def test_delete_missing_404(client):
    assert client.delete("/api/devices/ghost").status_code == 404


def test_persistence_across_reads(client):
    """Edits survive — they are written back to the data file."""
    client.post("/api/devices", json=_sample_device(notes="hello"))
    again = client.get("/api/devices/test-pi").json()
    assert again["notes"] == "hello"


def test_corrupt_data_file_returns_clear_error(client):
    """A hand-edited devices.json with bad JSON gives a clear 503, not a 500."""
    storage.DATA_FILE.write_text("{ not valid json", encoding="utf-8")
    r = client.get("/api/devices")
    assert r.status_code == 503
    assert "not valid JSON" in r.json()["detail"]
    # /api/health does not read the data file, so it stays up.
    assert client.get("/api/health").status_code == 200


def test_ready_ok_with_valid_data(client):
    """Readiness probe passes when the data file parses (#89)."""
    r = client.get("/api/ready")
    assert r.status_code == 200
    assert r.json()["status"] == "ready"


def test_ready_fails_on_corrupt_data(client):
    """Readiness reports 503 on a corrupt data file, while liveness stays 200."""
    storage.DATA_FILE.write_text("{ not valid json", encoding="utf-8")
    assert client.get("/api/ready").status_code == 503
    assert client.get("/api/health").status_code == 200


def test_wrong_shape_data_file_returns_clear_error(client):
    """Valid JSON of the wrong shape (e.g. a top-level array) also -> 503."""
    storage.DATA_FILE.write_text("[1, 2, 3]", encoding="utf-8")
    r = client.get("/api/devices")
    assert r.status_code == 503
    assert "JSON object" in r.json()["detail"]


def test_non_array_collection_returns_clear_error(client):
    """An object root whose 'devices' isn't an array -> 503, not a crash."""
    storage.DATA_FILE.write_text('{"devices": {}}', encoding="utf-8")
    r = client.get("/api/devices")
    assert r.status_code == 503
    assert "must be a JSON array" in r.json()["detail"]


# ─── whoami ─────────────────────────────────────────────────────────────────


def test_whoami_uses_real_ip_header(client):
    r = client.get("/api/whoami", headers={"X-Real-IP": "192.168.1.21"})
    assert r.status_code == 200
    assert r.json() == {"ip": "192.168.1.21"}


def test_whoami_falls_back_to_forwarded_for(client):
    r = client.get("/api/whoami", headers={"X-Forwarded-For": "192.168.1.30, 10.0.0.2"})
    assert r.json() == {"ip": "192.168.1.30"}


def test_whoami_without_proxy_headers(client):
    # TestClient still has a socket peer, so we just require the key.
    r = client.get("/api/whoami")
    assert r.status_code == 200
    assert "ip" in r.json()


# ─── url field ──────────────────────────────────────────────────────────────


def test_create_device_with_valid_url(client):
    r = client.post("/api/devices", json=_sample_device(url="http://192.168.1.99"))
    assert r.status_code == 201
    assert r.json()["url"] == "http://192.168.1.99"


def test_create_device_rejects_non_http_url(client):
    r = client.post("/api/devices", json=_sample_device(url="ftp://192.168.1.99"))
    assert r.status_code == 422


# ─── B1: PUT merge tests ───────────────────────────────────────────────────


def test_put_preserves_detail_when_not_in_payload(client):
    """PUT without `detail` in the body must not erase existing detail data."""
    # The seed NAS device already has rich detail data.
    nas_before = client.get("/api/devices/nas").json()
    assert nas_before["detail"] is not None

    # Send an update that changes only the name — no detail field at all.
    update = {
        "name": "NAS renamed",
        "host": nas_before["host"],
        "ip": nas_before["ip"],
        "mac": nas_before["mac"],
        "group": nas_before["group"],
        "type": nas_before["type"],
        "online": nas_before["online"],
    }
    r = client.put("/api/devices/nas", json=update)
    assert r.status_code == 200
    assert r.json()["name"] == "NAS renamed"
    # detail must be preserved
    assert r.json()["detail"] == nas_before["detail"]


def test_put_merges_fields_correctly(client):
    """PUT should deep-merge: update supplied keys, keep existing ones."""
    # Create a device with notes and detail
    dev = _sample_device(
        notes="original note",
        detail={
            "net": {"ipv4": "192.168.1.99/24", "gateway": "192.168.1.1"},
            "hw": {"cpu_full": "ARM Cortex-A53"},
        },
    )
    client.post("/api/devices", json=dev)

    # Update only some fields
    update = {
        "name": "Merged Pi",
        "host": "pi.home.arpa",
        "ip": "192.168.1.99",
        "mac": "DE:AD:BE:EF:00:01",
        "group": "Computer",
        "type": "desktop",
        "online": False,
    }
    r = client.put("/api/devices/test-pi", json=update)
    assert r.status_code == 200
    body = r.json()
    # Updated field
    assert body["name"] == "Merged Pi"
    assert body["online"] is False
    # Preserved fields (not in update payload)
    assert body["notes"] == "original note"
    assert body["detail"]["net"]["ipv4"] == "192.168.1.99/24"
    assert body["detail"]["hw"]["cpu_full"] == "ARM Cortex-A53"


# ─── C3: IP/MAC uniqueness ────────────────────────────────────────────────


def test_create_duplicate_ip_returns_409(client):
    """Creating a device whose IP matches an existing device should return 409."""
    # Use the gateway's IP (192.168.1.1) which exists in the seed data.
    dev = _sample_device(ip="192.168.1.1")
    r = client.post("/api/devices", json=dev)
    assert r.status_code == 409
    assert "ip already in use" in r.json()["detail"]


def test_create_duplicate_mac_returns_409(client):
    """Creating a device whose MAC matches an existing device should return 409."""
    # Use the gateway's MAC (AA:BB:CC:00:01:01) which exists in the seed data.
    dev = _sample_device(mac="AA:BB:CC:00:01:01")
    r = client.post("/api/devices", json=dev)
    assert r.status_code == 409
    assert "mac already in use" in r.json()["detail"]


def test_update_to_non_conflicting_ip_mac_works(client):
    """Updating a device's IP/MAC to unused values should succeed."""
    client.post("/api/devices", json=_sample_device())

    update = {
        "name": "Test Pi",
        "host": "pi.home.arpa",
        "ip": "192.168.1.200",
        "mac": "DE:AD:BE:EF:99:99",
        "group": "Computer",
        "type": "desktop",
        "online": True,
        "conn": "Wired 1G",
    }
    r = client.put("/api/devices/test-pi", json=update)
    assert r.status_code == 200
    assert r.json()["ip"] == "192.168.1.200"
    assert r.json()["mac"] == "DE:AD:BE:EF:99:99"


# ─── Clearing optional fields via PUT (null = clear, absent = keep) ─────────


def test_put_clears_optional_scalar_fields(client):
    """Sending an optional field as null erases it; omitted fields are kept."""
    client.post("/api/devices", json=_sample_device(notes="keep me", conn="Wired 1G"))

    update = {
        "name": "Test Pi",
        "host": "pi.home.arpa",
        "ip": "192.168.1.99",
        "mac": "DE:AD:BE:EF:00:01",
        "group": "Computer",
        "type": "desktop",
        "online": True,
        # explicitly clear both optional fields
        "notes": None,
        "conn": None,
    }
    r = client.put("/api/devices/test-pi", json=update)
    assert r.status_code == 200
    stored = client.get("/api/devices/test-pi").json()
    assert stored.get("notes") is None
    assert stored.get("conn") is None


def test_put_clears_ownership_but_keeps_other_detail(client):
    """Clearing detail.own must not wipe sibling detail blocks (e.g. metrics)."""
    dev = _sample_device(
        detail={
            "own": {"manufacturer": "Acme", "tags": ["critical"]},
            "metrics": {"cpu_pct": 42},
        },
    )
    client.post("/api/devices", json=dev)

    update = {
        "name": "Test Pi",
        "host": "pi.home.arpa",
        "ip": "192.168.1.99",
        "mac": "DE:AD:BE:EF:00:01",
        "group": "Computer",
        "type": "desktop",
        "online": True,
        # keep metrics, clear ownership
        "detail": {"metrics": {"cpu_pct": 42}, "own": None},
    }
    r = client.put("/api/devices/test-pi", json=update)
    assert r.status_code == 200
    detail = client.get("/api/devices/test-pi").json()["detail"]
    assert detail["own"] is None
    assert detail["metrics"]["cpu_pct"] == 42


# ─── /api/import hardening (issue #83) ──────────────────────────────────────


def _import(client, payload, headers=None):
    import io
    import json as _json

    blob = io.BytesIO(_json.dumps(payload).encode())
    return client.post(
        "/api/import",
        files={"file": ("catalog.json", blob, "application/json")},
        headers={"X-Requested-With": "XMLHttpRequest", **(headers or {})},
    )


def test_import_valid_catalog(client):
    payload = {
        "devices": [_sample_device()],
        "switches": [{"id": "sw1", "name": "Sw 1", "type": "switch"}],
        "cables": [{"id": "c1", "fromDev": "test-pi", "toDev": "sw1"}],
    }
    r = _import(client, payload)
    assert r.status_code == 200
    assert r.json() == {"devices": 1, "switches": 1, "cables": 1}
    assert client.get("/api/devices/test-pi").status_code == 200


def test_import_rejects_non_array_switches(client):
    r = _import(client, {"devices": [], "switches": {}, "cables": []})
    assert r.status_code == 422
    assert "'switches' must be an array" in r.json()["detail"]


def test_import_rejects_malformed_switch(client):
    # Missing the required `name` field.
    r = _import(client, {"devices": [], "switches": [{"id": "sw1"}], "cables": []})
    assert r.status_code == 422
    assert "switch[0]" in r.json()["detail"]


def test_import_rejects_malformed_cable(client):
    # Cable missing the required fromDev / toDev endpoints.
    r = _import(client, {"devices": [], "switches": [], "cables": [{"id": "c1"}]})
    assert r.status_code == 422
    assert "cable[0]" in r.json()["detail"]


def test_import_rejects_out_of_range_pct(client):
    """A percentage outside 0–100 is rejected at the import boundary (#88)."""
    dev = _sample_device(detail={"metrics": {"cpu_pct": 150}})
    r = _import(client, {"devices": [dev], "switches": [], "cables": []})
    assert r.status_code == 422


def test_import_rejects_out_of_range_port(client):
    """A service port outside 1–65535 is rejected (#88)."""
    dev = _sample_device(detail={"services": [{"port": 99999}]})
    r = _import(client, {"devices": [dev], "switches": [], "cables": []})
    assert r.status_code == 422


def test_import_rejects_oversized_upload(client):
    import io

    blob = b"x" * (5 * 1024 * 1024 + 1)
    r = client.post(
        "/api/import",
        files={"file": ("big.json", io.BytesIO(blob), "application/json")},
        headers={"X-Requested-With": "XMLHttpRequest"},
    )
    assert r.status_code == 413


def test_import_requires_csrf_header(client):
    """A multipart POST without X-Requested-With is rejected (CSRF guard)."""
    import io
    import json as _json

    blob = io.BytesIO(_json.dumps({"devices": [], "switches": [], "cables": []}).encode())
    r = client.post("/api/import", files={"file": ("c.json", blob, "application/json")})
    assert r.status_code == 403


def test_import_rejects_duplicate_id(client):
    dev2 = _sample_device(ip="192.168.50.2", mac="DE:AD:BE:EF:00:02")
    r = _import(client, {"devices": [_sample_device(), dev2], "switches": [], "cables": []})
    assert r.status_code == 422
    assert "duplicate id" in r.json()["detail"]


def test_import_rejects_duplicate_ip(client):
    dev2 = _sample_device(id="other", mac="DE:AD:BE:EF:00:02")  # same ip as sample
    r = _import(client, {"devices": [_sample_device(), dev2], "switches": [], "cables": []})
    assert r.status_code == 422
    assert "duplicate ip" in r.json()["detail"]


def test_import_normalizes_mac_to_uppercase(client):
    """An imported device is stored in the same shape as a form-created one."""
    r = _import(
        client,
        {"devices": [_sample_device(mac="de:ad:be:ef:00:01")], "switches": [], "cables": []},
    )
    assert r.status_code == 200
    assert client.get("/api/devices/test-pi").json()["mac"] == "DE:AD:BE:EF:00:01"


# ─── Wake-on-LAN ────────────────────────────────────────────────────────────


def test_wake_missing_device_404(client):
    assert client.post("/api/devices/ghost/wake").status_code == 404


def test_wake_sends_magic_packet(client):
    """A device with a MAC returns 200 and reports the MAC it targeted."""
    client.post("/api/devices", json=_sample_device(mac="AA:BB:CC:DD:EE:01"))
    r = client.post("/api/devices/test-pi/wake")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "sent"
    assert body["mac"] == "AA:BB:CC:DD:EE:01"


def test_wake_socket_failure_returns_503(client, monkeypatch):
    """If the UDP broadcast can't be sent, the endpoint surfaces a 503."""
    client.post("/api/devices", json=_sample_device())

    import socket as _socket

    def _boom(*_a, **_k):
        raise OSError("no broadcast route")

    monkeypatch.setattr(_socket, "socket", _boom)
    r = client.post("/api/devices/test-pi/wake")
    assert r.status_code == 503
    assert "failed to send magic packet" in r.json()["detail"]


def test_bulk_update_reachability_keeps_last_seen_when_offline(client):
    """Going offline must preserve the previous last-seen instant (issue #84).

    The collector sends last=None on an offline probe; storage must keep the
    timestamp from when the device was last reachable, not blank it out.
    """
    client.post("/api/devices", json=_sample_device(last="2026-06-17T02:00:00+00:00"))

    # Device goes offline: collector reports online=False, last=None.
    storage.bulk_update_reachability([{"id": "test-pi", "online": False, "last": None}])

    dev = storage.get_device("test-pi")
    assert dev["online"] is False
    assert dev["last"] == "2026-06-17T02:00:00+00:00"


def test_bulk_update_reachability_refreshes_last_when_online(client):
    """An online probe stamps the new last-seen instant."""
    client.post("/api/devices", json=_sample_device(last="2026-06-17T02:00:00+00:00"))

    storage.bulk_update_reachability(
        [{"id": "test-pi", "online": True, "last": "2026-06-17T03:30:00+00:00"}]
    )

    dev = storage.get_device("test-pi")
    assert dev["online"] is True
    assert dev["last"] == "2026-06-17T03:30:00+00:00"
