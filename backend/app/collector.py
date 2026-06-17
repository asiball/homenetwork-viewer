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
from datetime import UTC, datetime

logger = logging.getLogger(__name__)

INTERVAL = 120  # seconds between full sweeps
CONNECT_TIMEOUT = 2  # seconds per TCP connect attempt
TCP_PROBE_PORTS = [22, 80, 443, 8080, 8443]  # try these in order

async def _tcp_reachable(ip: str) -> bool:
    """Return True if any common TCP port responds on the given IP."""
    for port in TCP_PROBE_PORTS:
        try:
            _, writer = await asyncio.wait_for(
                asyncio.open_connection(ip, port),
                timeout=CONNECT_TIMEOUT,
            )
            writer.close()
            with contextlib.suppress(Exception):
                await writer.wait_closed()
            return True
        except (TimeoutError, OSError):
            continue
    return False


async def _ping_reachable(ip: str) -> bool:
    """ICMP ping fallback — works without raw-socket privileges via setuid ping.

    Used when all TCP probes fail (e.g. IoT devices with no open ports).
    A missing or non-functional ping binary is silently treated as unreachable.
    """
    try:
        proc = await asyncio.wait_for(
            asyncio.create_subprocess_exec(
                "ping", "-c", "1", "-W", "1", str(ip),
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            ),
            timeout=3.0,
        )
        await proc.wait()
        return proc.returncode == 0
    except Exception:
        return False


async def _is_reachable(ip: str) -> bool:
    """Return True if the device is reachable via TCP or ICMP ping."""
    if await _tcp_reachable(ip):
        return True
    return await _ping_reachable(ip)


async def _probe_device(device: dict) -> tuple[str, bool]:
    """Probe a single device; returns (id, reachable)."""
    ip = device.get("ip", "")
    if not ip:
        return device["id"], False
    reachable = await _is_reachable(ip)
    return device["id"], reachable


async def run_collector(storage_module) -> None:
    """Continuously probe all devices and update online/last in storage."""
    logger.info("collector.start interval=%ds", INTERVAL)
    while True:
        try:
            # storage reads/writes are blocking (and fsync on write) — run them
            # off the event loop so a sweep never stalls API request handling.
            devices = await asyncio.to_thread(storage_module.list_devices)
            if devices:
                results = await asyncio.gather(
                    *[_probe_device(d) for d in devices],
                    return_exceptions=True,
                )
                # Store an ISO8601 instant, not a frozen human string like
                # "just now" (which never ages — see issue #84). The frontend
                # renders it as a relative time. On offline we send last=None so
                # storage keeps the previous value = the real last-seen instant.
                now_iso = datetime.now(UTC).isoformat(timespec="seconds")
                updates: list[dict] = []
                for r in results:
                    if isinstance(r, Exception):
                        logger.warning("collector.probe error=%s", r)
                        continue
                    dev_id, reachable = r
                    updates.append({
                        "id": dev_id,
                        "online": reachable,
                        "last": now_iso if reachable else None,
                    })
                if updates:
                    await asyncio.to_thread(storage_module.bulk_update_reachability, updates)
                    online = sum(1 for u in updates if u["online"])
                    logger.info(
                        "collector.sweep devices=%d online=%d offline=%d",
                        len(updates), online, len(updates) - online,
                    )
        except Exception as exc:
            logger.error("collector.error %s", exc, exc_info=True)
        await asyncio.sleep(INTERVAL)
