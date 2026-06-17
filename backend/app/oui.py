"""OUI (MAC address prefix) → manufacturer lookup.

The first 24–36 bits of a MAC address are an IEEE-assigned Organizationally
Unique Identifier that maps deterministically to the hardware vendor. We bundle
a generated lookup table (``app/data/oui-prefixes.txt``) so the lookup runs
entirely locally — no external request is ever made (spec §11; issue #107).

IEEE hands out blocks of three sizes: MA-L (/24, 6 hex digits), MA-M (/28, 7
hex digits) and MA-S (/36, 9 hex digits). A single /24 can be subdivided into
many smaller blocks owned by different vendors, so a lookup must try the
*longest* prefix first (9 → 7 → 6) and only fall back to the broad /24 when no
finer block matches.
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

APP_DIR = Path(__file__).resolve().parent
OUI_FILE = APP_DIR / "oui-prefixes.txt"

# Prefix lengths to probe, longest first (MA-S /36, MA-M /28, MA-L /24).
_PREFIX_LENS = (9, 7, 6)

# Loaded once at import: {hex-prefix: vendor}. Keys are upper-case hex with no
# separators. Empty if the data file is missing (lookup then returns None).
_TABLE: dict[str, str] = {}


def _load() -> dict[str, str]:
    table: dict[str, str] = {}
    try:
        with OUI_FILE.open(encoding="utf-8") as fh:
            for line in fh:
                if not line or line.startswith("#"):
                    continue
                prefix, _, vendor = line.partition("\t")
                prefix = prefix.strip().upper()
                vendor = vendor.strip()
                if prefix and vendor:
                    table[prefix] = vendor
    except FileNotFoundError:  # pragma: no cover - data file ships with the app
        logger.warning("oui.load action=missing file=%s", OUI_FILE)
    return table


_TABLE = _load()


def normalize(mac: str) -> str:
    """Return the upper-case hex digits of *mac*, stripped of separators.

    Accepts any common notation — ``AC:DE:48``, ``ac-de-48-00-11-22``,
    ``acde.4800.1122`` — and even a bare prefix. Non-hex characters are dropped.
    """
    return "".join(c for c in mac.upper() if c in "0123456789ABCDEF")


def lookup(mac: str) -> str | None:
    """Best-effort vendor for *mac* (full address or just a prefix).

    Returns the manufacturer name, or None when the prefix is too short, not
    registered, or belongs to a randomized / locally-administered address
    (phone privacy MACs simply won't be in the IEEE table → no suggestion).
    """
    hexmac = normalize(mac)
    for length in _PREFIX_LENS:
        if len(hexmac) >= length:
            vendor = _TABLE.get(hexmac[:length])
            if vendor:
                return vendor
    return None


def table_size() -> int:
    """Number of loaded OUI entries (0 if the data file is missing)."""
    return len(_TABLE)
