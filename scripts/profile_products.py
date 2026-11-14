"""Profile the Valio Aimo Junction 2026 challenge data.

Reports coverage of allergen, nutrition, ingredient, substitution, label,
delivery-reliability and carbon-footprint data, and lists lactose-free milk
products (the brief's example request).

Usage (scripts/fetch_raw.sh downloads the raw files into data/raw/):
    python3 scripts/profile_products.py \
        data/raw/product_data.json \
        data/raw/delivery_reliability.csv \
        data/raw/carbon_footprint.csv

"Free from" declarations live in the `nonAllergen` classification group, not
in `allergen`. Lactose-free milk is counted by the FREE_FROM_LACTOSE claim in
category 10400 (milk drinks), not by product name.
"""
import collections
import csv
import json
import sys


def fi_name(p):
    names = p["synkkaData"].get("names", [])
    for n in names:
        if n["language"] == "fi":
            return n["value"]
    return names[0]["value"] if names else ""


def main(products_path, reliability_path, carbon_path):
    d = json.load(open(products_path, encoding="utf-8"))
    n = len(d)
    pct = lambda x: f"{x} ({x / n * 100:.1f}%)"

    cats = collections.Counter(p["category"] for p in d)
    vendors = collections.Counter(p["vendorName"] for p in d)
    has = collections.Counter()
    allergen_ids = collections.Counter()
    allergen_units = collections.Counter()
    labels = collections.Counter()

    for p in d:
        s = p["synkkaData"]
        groups = {c["name"]: c for c in s.get("classifications", [])}
        allergen = groups.get("allergen", {}).get("values") or []
        free_from = groups.get("nonAllergen", {}).get("values") or []
        if allergen:
            has["allergen (contains/may/undeclared)"] += 1
            for v in allergen:
                allergen_ids[(v["id"], v.get("unit"))] += 1
                allergen_units[v.get("unit")] += 1
        if free_from:
            has["free from (nonAllergen)"] += 1
            allergen_units["FREE_FROM"] += len(free_from)
        if any(v.get("unit") in ("CONTAINS", "MAY_CONTAIN") for v in allergen) or free_from:
            has["any allergen declaration"] += 1
        for v in groups.get("packagingMarkedLabel", {}).get("values", []):
            labels[v["id"]] += 1
        if s.get("nutritionalContent"):
            has["nutrition"] += 1
        if s.get("ingredients") or s.get("keyIngredients"):
            has["ingredients"] += 1
        if p.get("substitutions"):
            has["substitution rules (incl. self)"] += 1
            if any(x.get("substituteProduct") != p["id"] for x in p["substitutions"]):
                has["substitution rules"] += 1

    print(f"products {n}, categories {len(cats)}, vendors {len(vendors)}")
    for k in ["any allergen declaration", "allergen (contains/may/undeclared)", "free from (nonAllergen)",
              "nutrition", "ingredients", "substitution rules", "substitution rules (incl. self)"]:
        print(f"{k}: {pct(has[k])}")
    print("allergen statement types:", dict(allergen_units))
    print("top allergen codes:", allergen_ids.most_common(15))
    print("top labels:", labels.most_common(15))
    print("top vendors:", vendors.most_common(10))

    ids = {p["id"] for p in d}
    rel = {r["productId"]: float(r["deliveryReliability"]) for r in csv.DictReader(open(reliability_path, encoding="utf-8"))}
    co2 = {r["productId"]: float(r["AVG kg CO2-eq/kg"]) for r in csv.DictReader(open(carbon_path, encoding="utf-8"))}
    rv = [v for k, v in rel.items() if k in ids]
    print(f"delivery reliability coverage: {pct(len(rv))}; <0.95: {sum(v < 0.95 for v in rv)}; "
          f"<0.8: {sum(v < 0.8 for v in rv)}; perfect: {sum(v == 1.0 for v in rv)}")
    print(f"carbon footprint coverage: {pct(sum(1 for k in co2 if k in ids))}")

    def claims(p):
        groups = {c["name"]: c for c in p["synkkaData"].get("classifications", [])}
        return {v["id"] for v in groups.get("nutritionalClaim", {}).get("values") or []}

    lf = [p for p in d if p["category"] == "10400" and "FREE_FROM_LACTOSE" in claims(p)]
    by_name = [p for p in d if "laktoositon" in fi_name(p).lower() and "maito" in fi_name(p).lower()]
    print(f"lactose-free drinking milks (cat 10400 + FREE_FROM_LACTOSE): {len(lf)}; "
          f"name match 'laktoositon'+'maito': {len(by_name)} (also coffee-milk drinks, quark, powder, cocoa)")
    for p in lf:
        print(" ", p["id"], fi_name(p), p["salesUnit"], p["vendorName"], rel.get(p["id"]), co2.get(p["id"]))


if __name__ == "__main__":
    main(*sys.argv[1:4])
