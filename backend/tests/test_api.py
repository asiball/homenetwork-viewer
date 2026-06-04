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
