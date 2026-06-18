"""Background reachability collector (spec §4 T1).

Pings each device every INTERVAL seconds using a TCP-connect probe first,
then an ICMP ping fallback for devices with no open TCP ports (e.g. IoT
sensors, smart plugs). No raw socket / CAP_NET_RAW required — the system
ping binary is typically setuid on Linux.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from time import perf_counter

logger = logging.getLogger(__name__)

INTERVAL = 120  # seconds between full sweeps
CONNECT_TIMEOUT = 2  # seconds per TCP connect attempt
TCP_PROBE_PORTS = [22, 80, 443, 8080, 8443]  # try these in order
# Cap simultaneous probes so a large or offline-heavy sweep can't exhaust file
# descriptors / ping subprocesses on a small host like a Raspberry Pi (#89).
MAX_CONCURRENT_PROBES = 16
# Prune old reachability samples roughly hourly rather than every sweep, so the
# indexed DELETE isn't paid on each 2-minute cycle (#93).
PRUNE_EVERY_SWEEPS = max(1, 3600 // INTERVAL)


async def _tcp_reachable(ip: str) -> float | None:
    """Return the connect RTT in ms if any common TCP port responds, else None."""
    for port in TCP_PROBE_PORTS:
        start = perf_counter()
        try:
            _, writer = await asyncio.wait_for(
                asyncio.open_connection(ip, port),
                timeout=CONNECT_TIMEOUT,
            )
            rtt_ms = (perf_counter() - start) * 1000
            writer.close()
            with contextlib.suppress(Exception):
                await writer.wait_closed()
            return rtt_ms
        except (TimeoutError, OSError):
            continue
    return None


async def _ping_reachable(ip: str) -> float | None:
    """ICMP ping fallback — works without raw-socket privileges via setuid ping.

    Used when all TCP probes fail (e.g. IoT devices with no open ports). Returns
    the round-trip time in ms on success, else None (a missing or non-functional
    ping binary is silently treated as unreachable).
    """
    try:
        start = perf_counter()
        proc = await asyncio.wait_for(
            asyncio.create_subprocess_exec(
                "ping",
                "-c",
                "1",
                "-W",
                "1",
                str(ip),
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            ),
            timeout=3.0,
        )
        await proc.wait()
        if proc.returncode == 0:
            return (perf_counter() - start) * 1000
        return None
    except Exception:
        return None


async def _probe(ip: str) -> tuple[bool, float | None, str | None]:
    """Probe an IP; return (reachable, rtt_ms, method) where method is the probe
    that confirmed reachability ('tcp' / 'icmp') or None when unreachable."""
    rtt = await _tcp_reachable(ip)
    if rtt is not None:
        return True, rtt, "tcp"
    rtt = await _ping_reachable(ip)
    if rtt is not None:
        return True, rtt, "icmp"
    return False, None, None


async def _probe_device(
    device: dict, sem: asyncio.Semaphore | None = None
) -> tuple[str, bool, float | None, str | None]:
    """Probe a single device; returns (id, reachable, rtt_ms, method).

    An optional semaphore bounds how many probes run at once (see
    MAX_CONCURRENT_PROBES); omit it to probe immediately (used in tests).
    """
    ip = device.get("ip", "")
    if not ip:
        return device["id"], False, None, None
    if sem is not None:
        async with sem:
            reachable, rtt, method = await _probe(ip)
    else:
        reachable, rtt, method = await _probe(ip)
    return device["id"], reachable, rtt, method


async def run_collector(storage_module) -> None:
    """Continuously probe all devices, append a reachability sample per device and
    refresh the online/last cache (#84, #93)."""
    logger.info("collector.start interval=%ds", INTERVAL)
    sweep = 0
    while True:
        try:
            # storage reads/writes are blocking (and fsync on write) — run them
            # off the event loop so a sweep never stalls API request handling.
            devices = await asyncio.to_thread(storage_module.list_devices)
            if devices:
                sem = asyncio.Semaphore(MAX_CONCURRENT_PROBES)
                results = await asyncio.gather(
                    *[_probe_device(d, sem) for d in devices],
                    return_exceptions=True,
                )
                # record_reachability stamps one ISO8601 sweep instant for the
                # batch and appends each result as a sample (the frozen "just now"
                # string is gone — issue #84), deriving last-seen / events from it.
                samples: list[dict] = []
                for r in results:
                    if isinstance(r, Exception):
                        logger.warning("collector.probe error=%s", r)
                        continue
                    dev_id, reachable, rtt, method = r
                    samples.append(
                        {"id": dev_id, "reachable": reachable, "rtt_ms": rtt, "method": method}
                    )
                if samples:
                    await asyncio.to_thread(storage_module.record_reachability, samples)
                    online = sum(1 for s in samples if s["reachable"])
                    logger.info(
                        "collector.sweep devices=%d online=%d offline=%d",
                        len(samples),
                        online,
                        len(samples) - online,
                    )
                sweep += 1
                if sweep % PRUNE_EVERY_SWEEPS == 0:
                    await asyncio.to_thread(storage_module.prune_reachability)
        except Exception as exc:
            logger.error("collector.error %s", exc, exc_info=True)
        await asyncio.sleep(INTERVAL)
