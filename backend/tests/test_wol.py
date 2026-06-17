"""Unit tests for the Wake-on-LAN helpers (issue #123)."""

import pytest

from app import wol


def test_normalize_mac_accepts_separator_variants():
    expected = bytes.fromhex("AABBCCDDEEFF")
    assert wol.normalize_mac("AA:BB:CC:DD:EE:FF") == expected
    assert wol.normalize_mac("aa-bb-cc-dd-ee-ff") == expected
    assert wol.normalize_mac("aabb.ccdd.eeff") == expected


def test_normalize_mac_rejects_wrong_length():
    with pytest.raises(wol.InvalidMacError):
        wol.normalize_mac("AA:BB:CC:DD:EE")


def test_normalize_mac_rejects_non_hex():
    with pytest.raises(wol.InvalidMacError):
        wol.normalize_mac("GG:BB:CC:DD:EE:FF")


def test_build_magic_packet_shape():
    packet = wol.build_magic_packet("AA:BB:CC:DD:EE:FF")
    assert len(packet) == 6 + 16 * 6  # 102 bytes
    assert packet[:6] == b"\xff" * 6
    assert packet[6:12] == bytes.fromhex("AABBCCDDEEFF")
    # The MAC repeats 16 times.
    assert packet[6:] == bytes.fromhex("AABBCCDDEEFF") * 16


def test_send_magic_packet_broadcasts(monkeypatch):
    """send_magic_packet enables broadcast and targets port 9 by default."""
    sent: dict = {}

    class _FakeSock:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def setsockopt(self, *a):
            sent["broadcast"] = a

        def sendto(self, packet, addr):
            sent["packet"] = packet
            sent["addr"] = addr

    monkeypatch.setattr(wol.socket, "socket", lambda *a, **k: _FakeSock())
    wol.send_magic_packet("AA:BB:CC:DD:EE:FF")

    assert sent["addr"] == ("255.255.255.255", 9)
    assert sent["packet"][:6] == b"\xff" * 6
    assert "broadcast" in sent
