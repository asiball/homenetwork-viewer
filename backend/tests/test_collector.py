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
