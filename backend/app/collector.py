"""Background reachability collector (spec §4 T1).

Pings each device every INTERVAL seconds using a TCP-connect probe first,
then an ICMP ping fallback for devices with no open TCP ports (e.g. IoT
sensors, smart plugs). No raw socket / CAP_NET_RAW required — the system
ping binary is typically setuid on Linux.
"""

from __future__ import annotations

import asyncio
import contextlib
import ipaddress
import logging
import os
from time import perf_counter

logger = logging.getLogger(__name__)

# Seconds between full sweeps. Spec §4.1 calls for 5 minutes; configurable via
# HOMENET_SWEEP_INTERVAL so a household with a slower/faster LAN can tune it
# without a rebuild (mention it next to the other backend env vars in
# docker-compose.yml).
INTERVAL = int(os.environ.get("HOMENET_SWEEP_INTERVAL", "300"))
CONNECT_TIMEOUT = 2  # seconds per TCP connect attempt
TCP_PROBE_PORTS = [22, 80, 443, 8080, 8443]  # try these in order
# Cap simultaneous probes so a large or offline-heavy sweep can't exhaust file
# descriptors / ping subprocesses on a small host like a Raspberry Pi (#89).
MAX_CONCURRENT_PROBES = 16
# Prune old reachability samples roughly hourly rather than every sweep, so the
# indexed DELETE isn't paid on each sweep (#93).
PRUNE_EVERY_SWEEPS = max(1, 3600 // INTERVAL)
# Back up the catalog roughly once a day from the collector loop too (backups
# otherwise only happened right before /api/import, so a household that never
# imports never got one).
BACKUPS_EVERY_SWEEPS = max(1, 86400 // INTERVAL)

# Set (by request_sweep(), called from POST /api/scan) to wake the loop for an
# immediate sweep instead of waiting out the rest of INTERVAL. Created fresh
# each time run_collector() starts — None while the collector isn't running
# (e.g. HOMENET_DISABLE_COLLECTOR=1 in tests), in which case request_sweep()
# is a harmless no-op.
_sweep_requested: asyncio.Event | None = None


def request_sweep() -> bool:
    """Ask the running collector loop for an immediate sweep (spec §5.6 ⟳
    scan). Returns True if a running collector picked it up, False if there
    is none to wake (nothing to do, not an error — the caller still reports
    success since a sweep will happen once the collector does start)."""
    if _sweep_requested is None:
        return False
    _sweep_requested.set()
    return True


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
    try:
        ipaddress.IPv4Address(ip)
    except ValueError:
        # A non-IPv4 value would otherwise reach the `ping` argv unvalidated
        # (e.g. "-f" is read as a flag rather than a target) — normally
        # unreachable via the Pydantic-validated API, but a pre-fix legacy
        # import could still poison the catalog with one. Treat it as simply
        # unreachable instead of probing.
        logger.warning("collector.probe id=%s error=invalid_ip ip=%r", device.get("id"), ip)
        return device["id"], False, None, None
    if sem is not None:
        async with sem:
            reachable, rtt, method = await _probe(ip)
    else:
        reachable, rtt, method = await _probe(ip)
    return device["id"], reachable, rtt, method


async def _sweep_once(storage_module, sweep_index: int) -> None:
    """Run one probe sweep: probe every device, append reachability samples,
    prune / back up on their own (much coarser) schedules, and stamp
    ``last_sweep`` — all the work one iteration of run_collector's loop does,
    pulled out so it can be driven directly (and repeatedly, without waiting
    out INTERVAL) from tests.

    ``sweep_index`` is the 1-based count of sweeps run since the collector
    started; it only decides whether *this* sweep also prunes / backs up.
    """
    # storage reads/writes are blocking (and fsync on write) — run them off
    # the event loop so a sweep never stalls API request handling.
    devices = await asyncio.to_thread(storage_module.list_devices)
    # Stamp the sweep instant once, up front, and reuse it both for every
    # sample in this batch and as the last_sweep meta value, so the two never
    # drift apart (spec §4.3 "next scan").
    sweep_ts = await asyncio.to_thread(storage_module.now_iso)
    if devices:
        sem = asyncio.Semaphore(MAX_CONCURRENT_PROBES)
        results = await asyncio.gather(
            *[_probe_device(d, sem) for d in devices],
            return_exceptions=True,
        )
        # record_reachability derives last-seen / events from the samples (the
        # frozen "just now" string is gone — issue #84).
        samples: list[dict] = []
        for r in results:
            if isinstance(r, Exception):
                logger.warning("collector.probe error=%s", r)
                continue
            dev_id, reachable, rtt, method = r
            samples.append({"id": dev_id, "reachable": reachable, "rtt_ms": rtt, "method": method})
        if samples:
            await asyncio.to_thread(storage_module.record_reachability, samples, sweep_ts)
            online = sum(1 for s in samples if s["reachable"])
            logger.info(
                "collector.sweep devices=%d online=%d offline=%d",
                len(samples),
                online,
                len(samples) - online,
            )
    if sweep_index % PRUNE_EVERY_SWEEPS == 0:
        await asyncio.to_thread(storage_module.prune_reachability)
    if sweep_index % BACKUPS_EVERY_SWEEPS == 0:
        try:
            await asyncio.to_thread(storage_module.backup_catalog)
        except Exception as exc:
            # A backup failure (disk full, permissions...) must never take the
            # sweep loop down with it — reachability probing is the collector's
            # primary job.
            logger.warning("collector.backup_failed error=%s", exc)
    await asyncio.to_thread(storage_module.set_meta, "last_sweep", sweep_ts)


async def run_collector(storage_module) -> None:
    """Continuously probe all devices, append a reachability sample per device and
    refresh the online/last cache (#84, #93).

    Normally waits out INTERVAL between sweeps, but POST /api/scan can wake it
    early via request_sweep() (spec §5.6 ⟳ scan): the loop waits on an
    asyncio.Event with a timeout instead of a plain sleep, so a set event
    returns immediately while a timeout behaves exactly like the old
    asyncio.sleep(INTERVAL).
    """
    global _sweep_requested
    _sweep_requested = asyncio.Event()
    logger.info("collector.start interval=%ds", INTERVAL)
    sweep = 0
    try:
        while True:
            try:
                sweep += 1
                await _sweep_once(storage_module, sweep)
            except Exception as exc:
                logger.error("collector.error %s", exc, exc_info=True)
            _sweep_requested.clear()
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(_sweep_requested.wait(), timeout=INTERVAL)
    finally:
        _sweep_requested = None
