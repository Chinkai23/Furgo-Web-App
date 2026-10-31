#!/usr/bin/env python3
"""Combine OSM and public-source Local Finder candidates into the admin CSV format."""

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent
INPUTS = [
    ROOT / "local_finder_malaysia_osm_pet_friendly_candidates.csv",
    ROOT / "local_finder_malaysia_public_web_candidates.csv",
]
OUTPUT = ROOT / "local_finder_malaysia_pet_friendly_candidates.csv"
FIELDS = [
    "name", "category", "address", "city", "state", "latitude", "longitude",
    "allowed_area", "pet_allowed", "pet_size", "conditions", "opening_hours",
    "phone", "website", "photo_url", "is_verified", "source_provider",
    "source_url", "source_license",
]


def key(row):
    return "|".join(" ".join(row.get(field, "").strip().lower().split()) for field in ("name", "address"))


rows = []
seen = set()
for path in INPUTS:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file):
            normalized = {field: (row.get(field) or "").strip() for field in FIELDS}
            row_key = key(normalized)
            if row_key in seen:
                continue
            seen.add(row_key)
            rows.append(normalized)

rows.sort(key=lambda row: (row["state"].lower(), row["city"].lower(), row["category"], row["name"].lower()))
with OUTPUT.open("w", encoding="utf-8", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=FIELDS, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)

print(f"Wrote {len(rows)} unique candidate places to {OUTPUT}")
