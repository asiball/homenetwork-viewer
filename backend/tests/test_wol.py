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


def test_send_magic_packet_honours_broadcast_env_override(monkeypatch):
    """HOMENET_WOL_BROADCAST overrides the default destination (#123): the
    limited broadcast never escapes the docker bridge in the documented
    compose deployment, so a subnet-directed broadcast must be settable."""
    sent: dict = {}

    class _FakeSock:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def setsockopt(self, *a):
            pass

        def sendto(self, packet, addr):
            sent["addr"] = addr

    monkeypatch.setattr(wol.socket, "socket", lambda *a, **k: _FakeSock())
    monkeypatch.setenv("HOMENET_WOL_BROADCAST", "192.168.1.255")
    wol.send_magic_packet("AA:BB:CC:DD:EE:FF")

    assert sent["addr"] == ("192.168.1.255", 9)


def test_send_magic_packet_warns_on_default_broadcast(monkeypatch, caplog):
    """Sending to the limited broadcast (255.255.255.255) is the exact
    misconfiguration the compose file's comments warn about — it never leaves
    the docker bridge, but the send still "succeeds" from this process's
    point of view, so it must be logged."""

    class _FakeSock:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def setsockopt(self, *a):
            pass

        def sendto(self, *a):
            pass

    monkeypatch.setattr(wol.socket, "socket", lambda *a, **k: _FakeSock())
    monkeypatch.delenv("HOMENET_WOL_BROADCAST", raising=False)

    with caplog.at_level("WARNING", logger="app.wol"):
        wol.send_magic_packet("AA:BB:CC:DD:EE:FF")

    assert any("limited broadcast" in r.message for r in caplog.records)
    assert any("HOMENET_WOL_BROADCAST" in r.message for r in caplog.records)


def test_send_magic_packet_no_warning_with_configured_broadcast(monkeypatch, caplog):
    """A subnet-directed broadcast (the documented fix) must not warn."""

    class _FakeSock:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def setsockopt(self, *a):
            pass

        def sendto(self, *a):
            pass

    monkeypatch.setattr(wol.socket, "socket", lambda *a, **k: _FakeSock())

    with caplog.at_level("WARNING", logger="app.wol"):
        wol.send_magic_packet("AA:BB:CC:DD:EE:FF", broadcast="192.168.1.255")

    assert not any("limited broadcast" in r.message for r in caplog.records)


def test_send_magic_packet_explicit_broadcast_wins_over_env(monkeypatch):
    """An explicit `broadcast=` argument still overrides the env var."""
    sent: dict = {}

    class _FakeSock:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def setsockopt(self, *a):
            pass

        def sendto(self, packet, addr):
            sent["addr"] = addr

    monkeypatch.setattr(wol.socket, "socket", lambda *a, **k: _FakeSock())
    monkeypatch.setenv("HOMENET_WOL_BROADCAST", "192.168.1.255")
    wol.send_magic_packet("AA:BB:CC:DD:EE:FF", broadcast="10.0.0.255")

    assert sent["addr"] == ("10.0.0.255", 9)
