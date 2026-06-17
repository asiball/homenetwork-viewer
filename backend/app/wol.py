"""Wake-on-LAN magic packet helpers.

Pure functions split out of the route handler so the MAC normalization and
packet assembly can be unit-tested without a FastAPI request or a live socket
(issue #123). The route is left to translate exceptions into HTTP status codes.
"""

from __future__ import annotations

import socket


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


def send_magic_packet(mac: str, *, broadcast: str = "255.255.255.255", port: int = 9) -> None:
    """Broadcast a magic packet for *mac*.

    Raises InvalidMacError for a malformed MAC and OSError if the datagram
    can't be sent (no broadcast route, etc.).
    """
    packet = build_magic_packet(mac)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.sendto(packet, (broadcast, port))
