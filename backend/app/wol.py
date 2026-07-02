"""Wake-on-LAN magic packet helpers.

Pure functions split out of the route handler so the MAC normalization and
packet assembly can be unit-tested without a FastAPI request or a live socket
(issue #123). The route is left to translate exceptions into HTTP status codes.
"""

from __future__ import annotations

import os
import socket

# Destination for the magic packet. The limited broadcast address
# (255.255.255.255) never leaves the docker bridge in the documented compose
# deployment, so the packet dies before it reaches the LAN and the API still
# reports 200 "sent". Point HOMENET_WOL_BROADCAST at a subnet-directed
# broadcast (e.g. 192.168.1.255) to make it routable off the bridge.
DEFAULT_BROADCAST = "255.255.255.255"


class InvalidMacError(ValueError):
    """Raised when a MAC string can't be parsed into 6 bytes."""


def normalize_mac(mac: str) -> bytes:
    """Strip separators (``:`` ``-`` ``.``) and return the 6 raw MAC bytes."""
    cleaned = mac.replace(":", "").replace("-", "").replace(".", "")
    if len(cleaned) != 12:
        raise InvalidMacError(f"invalid MAC address: {mac}")
    try:
        return bytes.fromhex(cleaned)
    except ValueError as exc:
        raise InvalidMacError(f"invalid MAC address: {mac}") from exc


def build_magic_packet(mac: str) -> bytes:
    """A WoL magic packet: 6×0xFF followed by 16 repetitions of the MAC."""
    return b"\xff" * 6 + normalize_mac(mac) * 16


def send_magic_packet(mac: str, *, broadcast: str | None = None, port: int = 9) -> None:
    """Broadcast a magic packet for *mac*.

    *broadcast* defaults to HOMENET_WOL_BROADCAST (read lazily, so tests and
    deployments can change it without re-importing this module), falling back
    to the limited broadcast address when unset.

    Raises InvalidMacError for a malformed MAC and OSError if the datagram
    can't be sent (no broadcast route, etc.).
    """
    if broadcast is None:
        broadcast = os.environ.get("HOMENET_WOL_BROADCAST", DEFAULT_BROADCAST)
    packet = build_magic_packet(mac)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.sendto(packet, (broadcast, port))
