"""Unit tests for the reachability collector (issue #90).

The collector coroutines are exercised with asyncio.run() so we don't need a
pytest-asyncio plugin, and _is_reachable is monkeypatched so nothing touches
the real network.
"""

import asyncio

from app import collector


def test_probe_device_without_ip_is_offline():
    """A device with no IP can't be probed — report offline, never crash."""
    dev_id, reachable = asyncio.run(collector._probe_device({"id": "noip", "ip": ""}))
    assert dev_id == "noip"
    assert reachable is False


def test_probe_device_reports_reachable(monkeypatch):
    async def _ok(_ip):
        return True

    monkeypatch.setattr(collector, "_is_reachable", _ok)
    dev_id, reachable = asyncio.run(collector._probe_device({"id": "pi", "ip": "192.168.1.2"}))
    assert (dev_id, reachable) == ("pi", True)


def test_probe_device_honours_semaphore(monkeypatch):
    """With a semaphore passed, the probe still resolves correctly."""

    async def _down(_ip):
        return False

    monkeypatch.setattr(collector, "_is_reachable", _down)

    async def _run():
        sem = asyncio.Semaphore(2)
        return await collector._probe_device({"id": "x", "ip": "10.0.0.9"}, sem)

    assert asyncio.run(_run()) == ("x", False)


def test_tcp_reachable_false_when_all_ports_refuse(monkeypatch):
    """If every TCP connect raises, the host reads as TCP-unreachable."""

    async def _refuse(*_a, **_k):
        raise OSError("connection refused")

    monkeypatch.setattr(collector.asyncio, "open_connection", _refuse)
    assert asyncio.run(collector._tcp_reachable("192.168.1.123")) is False


def test_ping_reachable_true_on_zero_exit(monkeypatch):
    """ping exit code 0 => reachable; non-zero => not."""

    class _Proc:
        returncode = 0

        async def wait(self):
            return 0

    async def _spawn(*_a, **_k):
        return _Proc()

    monkeypatch.setattr(collector.asyncio, "create_subprocess_exec", _spawn)
    assert asyncio.run(collector._ping_reachable("192.168.1.1")) is True
