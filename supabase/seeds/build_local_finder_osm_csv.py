"""Convert a saved Malaysia Overpass JSON response into the Local Finder CSV.

Keep only named Malaysian veterinary clinics or venues with positive OSM pet
access tags. Rows without a useful OSM address are excluded for manual lookup.
"""

import csv
import json
import sys


FIELDS = [
    "name", "category", "address", "city", "state", "latitude", "longitude",
    "allowed_area", "pet_allowed", "pet_size", "conditions", "opening_hours",
    "phone", "website", "photo_url", "is_verified", "source_provider",
    "source_url", "source_license",
]
PET_POSITIVE = {"yes", "allowed", "leashed", "designated", "permissive"}
REVERSE_GEOCODED = {
    13971770063: {
        "address": "Jalan Lanchang, Taman Sri Bahtera, Cheras, Kuala Lumpur, 56100",
        "city": "Kuala Lumpur", "state": "Kuala Lumpur",
    },
    691389056: {
        "address": "Kampung Sungai Karang Darat, Kuantan, Pahang, 26100",
        "city": "Kampung Sungai Karang Darat", "state": "Pahang",
    },
    1567926945: {
        "address": "Jalan Permai 2, Taman Sri Permai, Kluang, Johor, 86000",
        "city": "Kluang", "state": "Johor",
    },
}


def address_from(tags):
    if tags.get("addr:full"):
        return tags["addr:full"].strip()
    street = " ".join(filter(None, [tags.get("addr:housenumber"), tags.get("addr:street")])).strip()
    pieces = [street, tags.get("addr:place"), tags.get("addr:suburb"), tags.get("addr:city"), tags.get("addr:postcode"), tags.get("addr:state")]
    address = ", ".join(dict.fromkeys(value.strip() for value in pieces if value and value.strip()))
    return address if len(address) >= 3 else ""


def category_and_policy(tags):
    amenity = tags.get("amenity", "")
    leisure = tags.get("leisure", "")
    policy_tag = next(((key, tags.get(key, "").lower()) for key in ("pets", "pet", "dogs", "dog") if tags.get(key, "").lower() in PET_POSITIVE), None)
    if amenity == "veterinary":
        return "clinic", "Veterinary clinic; confirm species and current services with the venue.", "Mapped as a veterinary clinic in OpenStreetMap. Confirm current services and hours before visiting."
    if policy_tag:
        key, value = policy_tag
        if leisure == "dog_park":
            return "park", "Dogs allowed in a designated dog park.", "OpenStreetMap pet-access tag: {}={}. Confirm current access rules before visiting.".format(key, value)
        if key == "dog" and value == "leashed":
            allowed = "Dogs allowed on leash."
        elif key == "dog" and value == "designated":
            allowed = "Dogs allowed in designated areas."
        elif key in {"pets", "pet"}:
            allowed = "Pets allowed."
        else:
            allowed = "Dogs allowed."
        category = "park" if leisure in {"park", "playground"} else "cafe"
        return category, allowed, "OpenStreetMap pet-access tag: {}={}. Confirm current access rules before visiting.".format(key, value)
    if leisure == "dog_park":
        return "park", "Dogs allowed in a designated dog park.", "Mapped as a dog park in OpenStreetMap. Confirm current access rules before visiting."
    return None


def main(source_path, output_path):
    payload = json.load(open(source_path, encoding="utf-8"))
    output = []
    seen = set()
    for element in payload.get("elements", []):
        tags = element.get("tags", {})
        name = tags.get("name", "").strip()
        if not name:
            continue
        categorized = category_and_policy(tags)
        if not categorized:
            continue
        override = REVERSE_GEOCODED.get(element.get("id"), {})
        address = override.get("address") or address_from(tags)
        if not address:
            continue
        category, pet_allowed, conditions = categorized
        center = element.get("center", element)
        latitude, longitude = center.get("lat"), center.get("lon")
        if latitude is None or longitude is None:
            continue
        key = (name.casefold(), address.casefold())
        if key in seen:
            continue
        seen.add(key)
        osm_type = element.get("type", "node")
        osm_id = element.get("id")
        output.append({
            "name": name,
            "category": category,
            "address": address,
            "city": override.get("city", tags.get("addr:city", "")),
            "state": override.get("state", tags.get("addr:state", "")),
            "latitude": latitude,
            "longitude": longitude,
            "allowed_area": "",
            "pet_allowed": pet_allowed,
            "pet_size": "",
            "conditions": conditions,
            "opening_hours": tags.get("opening_hours", ""),
            "phone": tags.get("phone", tags.get("contact:phone", "")),
            "website": tags.get("website", tags.get("contact:website", "")),
            "photo_url": "",
            "is_verified": "false",
            "source_provider": "OpenStreetMap",
            "source_url": "https://www.openstreetmap.org/{}/{}".format(osm_type, osm_id),
            "source_license": "ODbL-1.0",
        })
    with open(output_path, "w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(output)
    print("Wrote {} candidate rows to {}".format(len(output), output_path))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python3 build_local_finder_osm_csv.py <overpass.json> <output.csv>")
    main(sys.argv[1], sys.argv[2])
