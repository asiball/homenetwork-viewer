"""Unit tests for OUI → manufacturer lookup and the /api/oui endpoint (#107)."""

from app import oui


def test_normalize_strips_separators_and_uppercases():
    assert oui.normalize("ac:de:48:00:11:22") == "ACDE48001122"
    assert oui.normalize("ac-de-48-00-11-22") == "ACDE48001122"
    assert oui.normalize("acde.4800.1122") == "ACDE48001122"
    assert oui.normalize("acde48") == "ACDE48"


def test_normalize_drops_non_hex():
    assert oui.normalize("zz!! 00:2B:F5") == "002BF5"


def test_lookup_known_ma_l_vendor():
    # 00:2B:F5 is a /24 (MA-L) block; the full MAC and the bare prefix agree.
    assert oui.lookup("00:2B:F5:12:34:56") == "BUFFALO.INC"
    assert oui.lookup("002BF5") == "BUFFALO.INC"


def test_lookup_prefers_longest_prefix():
    # 00:55:DA is a subdivided /24 (placeholder, omitted from the table); the
    # real vendor lives on the finer MA-M block 0055DA0. Longest match wins.
    assert oui.lookup("00:55:DA:00:11:22") == "Shinko Technos"


def test_lookup_unknown_returns_none():
    # FF:FF:FF is the broadcast prefix — not a registered vendor.
    assert oui.lookup("FF:FF:FF:FF:FF:FF") is None


def test_lookup_too_short_returns_none():
    assert oui.lookup("00:2B") is None
    assert oui.lookup("") is None


def test_lookup_junk_returns_none():
    assert oui.lookup("not-a-mac") is None


def test_table_is_loaded():
    assert oui.table_size() > 1000


def test_api_oui_known(client):
    r = client.get("/api/oui/002BF5123456")
    assert r.status_code == 200
    assert r.json() == {"manufacturer": "BUFFALO.INC"}


def test_api_oui_unknown_is_200_with_null(client):
    # A randomized / unregistered prefix is a quiet non-suggestion, not a 404.
    r = client.get("/api/oui/FFFFFFFFFFFF")
    assert r.status_code == 200
    assert r.json() == {"manufacturer": None}
