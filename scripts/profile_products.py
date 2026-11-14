"""Profile the Valio Aimo Junction 2026 challenge data.

Reports coverage of allergen, nutrition, ingredient, substitution, label,
delivery-reliability and carbon-footprint data, and lists lactose-free milk
products (the brief's example request).

Usage:
    python3 scripts/profile_products.py \
        data/valio_aimo_junction26_product_data.json \
        data/valio_aimo_junction26_delivery_reliability.csv \
        data/valio_aimo_junction26_carbon_footprint.csv
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
    d = json.load(open(products_path))
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
        if groups.get("allergen", {}).get("values"):
            has["allergen"] += 1
            for v in groups["allergen"]["values"]:
                allergen_ids[(v["id"], v.get("unit"))] += 1
                allergen_units[v.get("unit")] += 1
        for v in groups.get("packagingMarkedLabel", {}).get("values", []):
            labels[v["id"]] += 1
        if s.get("nutritionalContent"):
            has["nutrition"] += 1
        if s.get("ingredients") or s.get("keyIngredients"):
            has["ingredients"] += 1
        if p.get("substitutions"):
            has["substitution rules"] += 1

    print(f"products {n}, categories {len(cats)}, vendors {len(vendors)}")
    for k in ["allergen", "nutrition", "ingredients", "substitution rules"]:
        print(f"{k}: {pct(has[k])}")
    print("allergen statement types:", dict(allergen_units))
    print("top allergen codes:", allergen_ids.most_common(15))
    print("top labels:", labels.most_common(15))
    print("top vendors:", vendors.most_common(10))

    ids = {p["id"] for p in d}
    rel = {r["productId"]: float(r["deliveryReliability"]) for r in csv.DictReader(open(reliability_path))}
    co2 = {r["productId"]: float(r["AVG kg CO2-eq/kg"]) for r in csv.DictReader(open(carbon_path))}
    rv = [v for k, v in rel.items() if k in ids]
    print(f"delivery reliability coverage: {pct(len(rv))}; <0.95: {sum(v < 0.95 for v in rv)}; "
          f"<0.8: {sum(v < 0.8 for v in rv)}; perfect: {sum(v == 1.0 for v in rv)}")
    print(f"carbon footprint coverage: {pct(sum(1 for k in co2 if k in ids))}")

    lf = [p for p in d if "laktoositon" in fi_name(p).lower() and "maito" in fi_name(p).lower()]
    print(f"lactose-free milk-type products: {len(lf)}")
    for p in lf[:25]:
        print(" ", p["id"], fi_name(p), p["salesUnit"], p["vendorName"], rel.get(p["id"]), co2.get(p["id"]))


if __name__ == "__main__":
    main(*sys.argv[1:4])
