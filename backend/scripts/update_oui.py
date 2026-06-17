#!/usr/bin/env python3
"""Regenerate the bundled OUI lookup table (app/data/oui-prefixes.txt).

The authoritative source is the IEEE Registration Authority public registry:
    https://standards.ieee.org/products-programs/regauth/

IEEE's own CSV (https://standards-oui.ieee.org/oui/oui.csv) is the canonical
download, but it is sometimes rate-limited / blocked. By default we pull the
IEEE-derived, actively maintained list shipped with nmap, which is small and
easy to parse. Override the source with --url if you prefer the IEEE CSV.

Run a few times a year — OUI assignments change slowly:

    python backend/scripts/update_oui.py

This only rewrites the data file; commit the result separately.
"""

from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

DEFAULT_URL = "https://raw.githubusercontent.com/nmap/nmap/master/nmap-mac-prefixes"
OUT_FILE = Path(__file__).resolve().parent.parent / "app" / "oui-prefixes.txt"

# Placeholder vendor names that carry no useful manufacturer (a subdivided /24
# block, or a vendor that asked IEEE to keep the name private).
_PLACEHOLDERS = {"ieee registration authority", "private"}

_HEADER = """\
# OUI (MAC address prefix) → manufacturer lookup table.
# Maps an IEEE Organizationally Unique Identifier to a vendor name.
#
# Source of truth: IEEE Registration Authority public registry
#   https://standards.ieee.org/products-programs/regauth/
# Generated from the IEEE-derived nmap-mac-prefixes list via
#   backend/scripts/update_oui.py  (re-run a few times a year to refresh).
#
# Format: <hex-prefix><TAB><vendor>. Prefixes are 6/7/9 hex digits
# (IEEE MA-L /24, MA-M /28, MA-S /36 blocks). Longest match wins.
# Placeholder rows (IEEE Registration Authority / Private) are omitted.
"""


def parse_nmap(text: str) -> dict[str, str]:
    table: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        prefix, _, vendor = line.partition(" ")
        prefix = prefix.strip().upper()
        # nmap uses irregular runs of spaces for alignment; collapse them so
        # the bundled file has clean single-spaced vendor names.
        vendor = " ".join(vendor.split())
        if not prefix or not vendor:
            continue
        if vendor.lower() in _PLACEHOLDERS:
            continue
        table[prefix] = vendor
    return table


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--url", default=DEFAULT_URL, help="source list URL")
    args = ap.parse_args()

    print(f"fetching {args.url} …", file=sys.stderr)
    with urllib.request.urlopen(args.url, timeout=60) as resp:  # noqa: S310
        text = resp.read().decode("utf-8", "replace")

    table = parse_nmap(text)
    if len(table) < 1000:
        print(f"refusing to write: only {len(table)} entries parsed", file=sys.stderr)
        return 1

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with OUT_FILE.open("w", encoding="utf-8") as fh:
        fh.write(_HEADER)
        for prefix in sorted(table):
            fh.write(f"{prefix}\t{table[prefix]}\n")

    print(f"wrote {len(table)} entries to {OUT_FILE}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
