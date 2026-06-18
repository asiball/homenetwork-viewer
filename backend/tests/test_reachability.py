"""Tests for the reachability time series (issue #93).

Samples are appended by the collector and aggregated into per-day uptime,
state-transition events and a recent-outage list. These exercise the storage
layer directly (with the seeded throwaway DB) plus the read API endpoint.
"""

from datetime import UTC, datetime, timedelta

from app import storage


def _make_device(device_id: str = "pi", *, online: bool = False) -> None:
    storage.create_device(
        {
            "id": device_id,
            "name": "Test Pi",
            "ip": "192.168.50.50",
            "mac": "AA:BB:CC:00:50:50",
            "online": online,
        }
    )


def test_record_reachability_appends_samples_and_aggregates(client):
    _make_device(online=True)
    storage.record_reachability([{"id": "pi", "reachable": True, "rtt_ms": 5.0, "method": "tcp"}])
    storage.record_reachability([{"id": "pi", "reachable": True}])
    storage.record_reachability([{"id": "pi", "reachable": False}])

    h = storage.reachability_history("pi", days=7)
    assert h["device_id"] == "pi"
    assert len(h["history"]) == 7
    today = h["history"][-1]
    assert today["samples"] == 3
    assert today["uptime"] == 2 / 3
    assert h["uptime_pct"] == 2 / 3


def test_record_reachability_records_up_down_transitions(client):
    _make_device(online=False)  # device_state starts offline
    storage.record_reachability([{"id": "pi", "reachable": True}])  # off -> on : up
    storage.record_reachability([{"id": "pi", "reachable": True}])  # no change
    storage.record_reachability([{"id": "pi", "reachable": False}])  # on -> off : down

    events = storage.list_reachability_events("pi")
    assert [e["kind"] for e in events] == ["down", "up"]  # newest first


def test_record_reachability_keeps_last_seen_when_offline(client):
    _make_device(online=False)
    storage.record_reachability(
        [{"id": "pi", "reachable": True, "ts": "2026-06-17T02:00:00+00:00"}]
    )
    storage.record_reachability([{"id": "pi", "reachable": False}])

    dev = storage.get_device("pi")
    assert dev["online"] is False
    assert dev["last"] == "2026-06-17T02:00:00+00:00"


def test_record_reachability_skips_unknown_device(client):
    # Must not raise and must not create a phantom history row.
    storage.record_reachability([{"id": "ghost", "reachable": True}])
    h = storage.reachability_history("ghost", days=7)
    assert all(d["samples"] == 0 for d in h["history"])
    assert h["uptime_pct"] is None


def test_reachability_history_buckets_by_day(client):
    _make_device(online=True)
    now = datetime.now(UTC)
    yesterday = (now - timedelta(days=1)).isoformat()
    storage.record_reachability([{"id": "pi", "reachable": False, "ts": yesterday}])
    storage.record_reachability([{"id": "pi", "reachable": True, "ts": now.isoformat()}])

    h = storage.reachability_history("pi", days=2)
    assert h["history"][0]["uptime"] == 0.0  # yesterday: all offline
    assert h["history"][1]["uptime"] == 1.0  # today: all online


def test_reachability_history_no_samples_is_null_not_invented(client):
    _make_device()
    h = storage.reachability_history("pi", days=7)
    assert all(d["uptime"] is None and d["samples"] == 0 for d in h["history"])
    assert h["uptime_pct"] is None


def test_prune_reachability_drops_old_samples(client):
    _make_device(online=True)  # online start => no transition event from first sample
    old = (datetime.now(UTC) - timedelta(days=40)).isoformat()
    storage.record_reachability([{"id": "pi", "reachable": True, "ts": old}])
    storage.record_reachability([{"id": "pi", "reachable": True}])

    removed = storage.prune_reachability(30)
    assert removed == 1  # only the 40-day-old sample

    h = storage.reachability_history("pi", days=90)
    assert sum(d["samples"] for d in h["history"]) == 1


def test_delete_device_cascades_history(client):
    _make_device(online=True)
    storage.record_reachability([{"id": "pi", "reachable": True}])
    storage.delete_device("pi")
    # No orphaned samples remain (FK ON DELETE CASCADE).
    h = storage.reachability_history("pi", days=7)
    assert all(d["samples"] == 0 for d in h["history"])


def test_reachability_endpoint_returns_history(client):
    device_id = client.get("/api/devices").json()[0]["id"]
    storage.record_reachability([{"id": device_id, "reachable": True}])

    res = client.get(f"/api/devices/{device_id}/reachability?days=7")
    assert res.status_code == 200
    body = res.json()
    assert body["device_id"] == device_id
    assert len(body["history"]) == 7
    assert body["history"][-1]["samples"] >= 1
    assert 0.0 <= body["uptime_pct"] <= 1.0


def test_reachability_endpoint_unknown_device_404(client):
    assert client.get("/api/devices/does-not-exist/reachability").status_code == 404
