#!/usr/bin/env python3
"""Rebuild the slim dataset from the raw Valio Aimo Junction 2026 files.

Usage:
  python3 scripts/build_slim.py <product_data.json> <carbon_footprint.csv> <delivery_reliability.csv> <out_dir>

Outputs in <out_dir>:
  products_slim.jsonl   one product per line, structured fields only (see docs/data-dictionary.md)
  ingredients.jsonl     id + ingredient statement text (en, fi)
  products_core.csv     flat subset for quick filtering / spreadsheets
  categories.csv        category code -> size, dominant temperature label, example product names
"""
import collections
import csv
import json
import os
import re
import sys

NUTR = {"ENER-KJO": "kj", "ENER-E14": "kcal", "FAT": "fat", "FASAT": "sat", "CHOAVL": "carb",
        "SUGAR-": "sugar", "FIBTG": "fibre", "PRO-": "prot", "SALTEQ": "salt", "LACS": "lactose"}
TEMP_LABELS = {"warmTemperature": "warm", "coolTemperature": "cool", "freezeTemperature": "freeze"}
SIZE_RE = re.compile(r"(?:(\d+)\s*[x×*]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|g|l|dl|cl|ml)\b", re.I)
TO_KG = {"kg": 1.0, "g": 0.001}
TO_L = {"l": 1.0, "dl": 0.1, "cl": 0.01, "ml": 0.001}
SYNKKA_KG = {"GRM": 0.001, "KGM": 1.0}
SYNKKA_L = {"LTR": 1.0, "MLT": 0.001, "CLT": 0.01}


def load_csv(path):
    with open(path, newline="") as f:
        r = csv.reader(f)
        next(r)
        return {a: float(b) for a, b in r}


def lang(items, code):
    for x in items or []:
        if x.get("language") == code and x.get("value"):
            return " ".join(x["value"].split())
    return None


def size_from_name(name):
    """Parse '12 x 330 ml', '1 l', '400g' -> (net_kg, net_l) for one base unit. Last match wins."""
    if not name:
        return None, None
    m = None
    for m in SIZE_RE.finditer(name):
        pass
    if not m:
        return None, None
    mult = int(m.group(1)) if m.group(1) else 1
    val = float(m.group(2).replace(",", ".")) * mult
    u = m.group(3).lower()
    if u in TO_KG:
        return round(val * TO_KG[u], 4), None
    return None, round(val * TO_L[u], 4)


def r4(x):
    return round(x, 4)


def slim(p, co2, rel):
    s = p.get("synkkaData", {})
    en, fi = lang(s.get("names"), "en"), lang(s.get("names"), "fi")
    o = {"id": p["id"], "en": en, "fi": fi}
    if s.get("brand"):
        o["brand"] = s["brand"]
    o["vendor"] = p.get("vendorName")
    o["cat"] = p.get("category")
    o["su"] = p.get("salesUnit")
    o["bu"] = p.get("baseUnit")
    units = {u["unitId"]: u["sizeInBaseUnits"] for u in p.get("units", [])}
    o["units"] = units
    o["su_in_bu"] = units.get(p.get("salesUnit"))
    o["lot"] = p.get("allowedLotSize")
    o["temp"] = p.get("temperatureCondition")
    o["origin"] = p.get("countryOfOrigin")
    if s.get("vatCode"):
        o["vat"] = s["vatCode"]
    if s.get("variableUnit"):
        o["var_weight"] = True
    if p.get("salesUnitGtin"):
        o["gtin"] = p["salesUnitGtin"]

    contains, may, free, claims, labels, nutr = [], [], [], [], [], {}
    groups = {g["name"]: g["values"] for g in s.get("classifications", [])}
    undeclared = []
    for v in groups.get("allergen", []):
        {"CONTAINS": contains, "MAY_CONTAIN": may}.get(v.get("unit"), undeclared).append(v["id"])
    for v in groups.get("nonAllergen", []):
        free.append(v["id"])
    for v in groups.get("nutritionalClaim", []):
        claims.append(v["id"])
    for v in groups.get("packagingMarkedLabel", []):
        if v["id"] in TEMP_LABELS:
            o["temp_label"] = TEMP_LABELS[v["id"]]
        else:
            labels.append(v["id"])
    for gname in ("gda", "nutritionFact"):  # nutritionFact overrides gda
        for v in groups.get(gname, []):
            if v["id"] in NUTR and v.get("value") is not None:
                nutr[NUTR[v["id"]]] = v["value"]
    o["contains"], o["may_contain"], o["free_from"] = sorted(set(contains)), sorted(set(may)), sorted(set(free))
    o["claims"], o["labels"] = sorted(set(claims)), sorted(set(labels))
    if undeclared:
        o["allergen_undeclared"] = sorted(set(undeclared))
    o["has_allergen_data"] = bool(contains or may or free)
    if nutr:
        o["nutr100"] = nutr

    # net content of one base unit
    net_kg = net_l = None
    src = None
    for u in s.get("unitConversions", []):
        if u.get("synkkaPackagingType") != "BASE_UNIT_OR_EACH":
            continue
        vol, nw = u.get("volume"), u.get("netWeight")
        if vol and vol.get("unit") in SYNKKA_L:
            net_l = r4(vol["value"] * SYNKKA_L[vol["unit"]])
        if nw and nw.get("unit") in SYNKKA_KG:
            net_kg = r4(nw["value"] * SYNKKA_KG[nw["unit"]])
        elif vol and vol.get("unit") in SYNKKA_KG:
            net_kg = r4(vol["value"] * SYNKKA_KG[vol["unit"]])
        if net_kg is not None or net_l is not None:
            src = "synkka"
    if net_kg is None and net_l is None:
        net_kg, net_l = size_from_name(fi or en)
        if net_kg is not None or net_l is not None:
            src = "name"
    elif net_l is None:
        _, nl = size_from_name(fi or en)
        if nl is not None:
            net_l = nl
            src = "synkka+name"
    if net_kg is not None:
        o["net_kg"] = net_kg
    if net_l is not None:
        o["net_l"] = net_l
    if src:
        o["net_src"] = src

    subs = sorted({x["substituteProduct"] for x in p.get("substitutions") or [] if x.get("substituteProduct") != p["id"]})
    if subs:
        o["subs"] = subs
    if p.get("deposits"):
        o["deposits"] = p["deposits"]
    if p["id"] in co2:
        o["co2_kg_per_kg"] = r4(co2[p["id"]])
    if p["id"] in rel:
        o["reliability"] = rel[p["id"]]
    return o


def main():
    prod_path, co2_path, rel_path, out = sys.argv[1:5]
    os.makedirs(out, exist_ok=True)
    co2, rel = load_csv(co2_path), load_csv(rel_path)
    with open(prod_path) as f:
        P = json.load(f)

    rows = [slim(p, co2, rel) for p in P]
    with open(os.path.join(out, "products_slim.jsonl"), "w") as f:
        for o in rows:
            f.write(json.dumps(o, ensure_ascii=False, separators=(",", ":")) + "\n")

    with open(os.path.join(out, "ingredients.jsonl"), "w") as f:
        for p in P:
            ki = p.get("synkkaData", {}).get("keyIngredients")
            en, fi = lang(ki, "en"), lang(ki, "fi")
            if en or fi:
                rec = {"id": p["id"]}
                if en:
                    rec["en"] = en
                if fi and fi != en:
                    rec["fi"] = fi
                f.write(json.dumps(rec, ensure_ascii=False, separators=(",", ":")) + "\n")

    cols = ["id", "en", "fi", "brand", "vendor", "cat", "su", "bu", "su_in_bu", "temp", "temp_label", "origin",
            "net_kg", "net_l", "contains", "may_contain", "free_from", "claims", "labels", "subs",
            "co2_kg_per_kg", "reliability"]
    with open(os.path.join(out, "products_core.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for o in rows:
            w.writerow([" ".join(o[c]) if isinstance(o.get(c), list) else ("" if o.get(c) is None else o[c]) for c in cols])

    cats = collections.defaultdict(list)
    for o in rows:
        cats[o["cat"]].append(o)
    with open(os.path.join(out, "categories.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["cat", "n_products", "temp_label_mode", "top_vendor", "example_1", "example_2", "example_3"])
        for c in sorted(cats, key=lambda k: (k is None, k)):
            g = cats[c]
            tl = collections.Counter(o.get("temp_label") for o in g if o.get("temp_label")).most_common(1)
            tv = collections.Counter(o["vendor"] for o in g).most_common(1)
            step = max(1, len(g) // 3)
            ex = [(o.get("en") or o.get("fi") or "") for o in g[::step][:3]] + ["", "", ""]
            w.writerow([c, len(g), tl[0][0] if tl else "", tv[0][0] if tv else "", *ex[:3]])

    print("products", len(rows))


if __name__ == "__main__":
    main()
