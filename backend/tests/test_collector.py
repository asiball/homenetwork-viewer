"""Unit tests for the reachability collector (issues #90, #93).

The collector coroutines are exercised with asyncio.run() so we don't need a
pytest-asyncio plugin, and the probe layer is monkeypatched so nothing touches
the real network.
"""

import asyncio

from app import collector


def test_probe_device_without_ip_is_offline():
    """A device with no IP can't be probed — report offline, never crash."""
    dev_id, reachable, rtt, method = asyncio.run(collector._probe_device({"id": "noip", "ip": ""}))
    assert dev_id == "noip"
    assert reachable is False
    assert rtt is None
    assert method is None


def test_probe_device_reports_reachable(monkeypatch):
    async def _ok(_ip):
        return True, 4.2, "tcp"

    monkeypatch.setattr(collector, "_probe", _ok)
    dev_id, reachable, rtt, method = asyncio.run(
        collector._probe_device({"id": "pi", "ip": "192.168.1.2"})
    )
    assert (dev_id, reachable, method) == ("pi", True, "tcp")
    assert rtt == 4.2


def test_probe_device_rejects_non_ipv4(monkeypatch):
    """A device whose ip isn't valid IPv4 (e.g. leaked in via a pre-fix legacy
    import) must never reach the `ping` argv — it's reported unreachable
    instead of probed, so a value like "-f" can't be read as a flag (#123)."""

    def _boom(_ip):
        raise AssertionError("must not probe an unparseable ip")

    monkeypatch.setattr(collector, "_probe", _boom)
    dev_id, reachable, rtt, method = asyncio.run(collector._probe_device({"id": "bad", "ip": "-f"}))
    assert (dev_id, reachable, rtt, method) == ("bad", False, None, None)


def test_probe_device_honours_semaphore(monkeypatch):
    """With a semaphore passed, the probe still resolves correctly."""

    async def _down(_ip):
        return False, None, None

    monkeypatch.setattr(collector, "_probe", _down)

    async def _run():
        sem = asyncio.Semaphore(2)
        return await collector._probe_device({"id": "x", "ip": "10.0.0.9"}, sem)

    assert asyncio.run(_run()) == ("x", False, None, None)


def test_tcp_reachable_none_when_all_ports_refuse(monkeypatch):
    """If every TCP connect raises, the host reads as TCP-unreachable (None)."""

    async def _refuse(*_a, **_k):
        raise OSError("connection refused")

    monkeypatch.setattr(collector.asyncio, "open_connection", _refuse)
    assert asyncio.run(collector._tcp_reachable("192.168.1.123")) is None


def test_ping_reachable_returns_rtt_on_zero_exit(monkeypatch):
    """ping exit code 0 => an rtt in ms; non-zero => None."""

    class _Proc:
        returncode = 0

        async def wait(self):
            return 0

    async def _spawn(*_a, **_k):
        return _Proc()

    monkeypatch.setattr(collector.asyncio, "create_subprocess_exec", _spawn)
    rtt = asyncio.run(collector._ping_reachable("192.168.1.1"))
    assert rtt is not None and rtt >= 0


def test_probe_prefers_tcp_then_falls_back_to_icmp(monkeypatch):
    """TCP wins when it answers; otherwise ICMP rtt is reported as 'icmp'."""

    async def _tcp_down(_ip):
        return None

    async def _ping_up(_ip):
        return 9.0

    monkeypatch.setattr(collector, "_tcp_reachable", _tcp_down)
    monkeypatch.setattr(collector, "_ping_reachable", _ping_up)
    assert asyncio.run(collector._probe("10.0.0.5")) == (True, 9.0, "icmp")


# ─── _sweep_once / request_sweep (items 5, 6, 8) ───────────────────────────


class _FakeStorage:
    """A stand-in for app.storage exposing just the sync functions
    _sweep_once calls via asyncio.to_thread, so a sweep can be driven
    repeatedly without a real database or waiting out INTERVAL."""

    def __init__(self, devices=None):
        self.devices = devices or []
        self.recorded: list[tuple[list[dict], str | None]] = []
        self.pruned = 0
        self.backed_up = 0
        self.backup_should_fail = False
        self.meta: dict[str, str] = {}

    def list_devices(self):
        return self.devices

    def now_iso(self):
        return "2026-07-02T00:00:00+00:00"

    def record_reachability(self, samples, ts=None):
        self.recorded.append((samples, ts))

    def prune_reachability(self):
        self.pruned += 1

    def backup_catalog(self):
        if self.backup_should_fail:
            raise OSError("disk full")
        self.backed_up += 1

    def set_meta(self, key, value):
        self.meta[key] = value


def test_sweep_once_records_samples_and_stamps_last_sweep(monkeypatch):
    async def _up(_ip):
        return True, 1.0, "tcp"

    monkeypatch.setattr(collector, "_probe", _up)
    fake = _FakeStorage(devices=[{"id": "pi", "ip": "192.168.1.2"}])

    asyncio.run(collector._sweep_once(fake, 1))

    assert len(fake.recorded) == 1
    samples, ts = fake.recorded[0]
    assert samples == [{"id": "pi", "reachable": True, "rtt_ms": 1.0, "method": "tcp"}]
    assert ts == "2026-07-02T00:00:00+00:00"
    assert fake.meta["last_sweep"] == "2026-07-02T00:00:00+00:00"


def test_sweep_once_prunes_only_on_schedule(monkeypatch):
    monkeypatch.setattr(collector, "PRUNE_EVERY_SWEEPS", 3)
    fake = _FakeStorage()

    for i in range(1, 7):
        asyncio.run(collector._sweep_once(fake, i))

    assert fake.pruned == 2  # sweeps 3 and 6


def test_sweep_once_backs_up_daily_on_schedule(monkeypatch):
    """Item 8: the collector loop backs up the catalog roughly once a day,
    derived from BACKUPS_EVERY_SWEEPS (analogous to PRUNE_EVERY_SWEEPS)."""
    monkeypatch.setattr(collector, "BACKUPS_EVERY_SWEEPS", 3)
    fake = _FakeStorage()

    for i in range(1, 7):
        asyncio.run(collector._sweep_once(fake, i))

    assert fake.backed_up == 2  # sweeps 3 and 6


def test_sweep_once_backup_failure_does_not_raise(monkeypatch):
    """A backup failure (disk full, permissions...) must never take the sweep
    loop down with it — reachability probing is the collector's real job."""
    monkeypatch.setattr(collector, "BACKUPS_EVERY_SWEEPS", 1)
    fake = _FakeStorage()
    fake.backup_should_fail = True

    asyncio.run(collector._sweep_once(fake, 1))  # must not raise

    assert fake.backed_up == 0
    assert fake.meta["last_sweep"] == "2026-07-02T00:00:00+00:00"  # sweep still completes


def test_request_sweep_without_running_collector_is_a_noop(monkeypatch):
    monkeypatch.setattr(collector, "_sweep_requested", None)
    assert collector.request_sweep() is False


def test_request_sweep_sets_the_running_collectors_event(monkeypatch):
    event = asyncio.Event()
    monkeypatch.setattr(collector, "_sweep_requested", event)
    assert collector.request_sweep() is True
    assert event.is_set()
