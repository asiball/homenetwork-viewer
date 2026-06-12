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
