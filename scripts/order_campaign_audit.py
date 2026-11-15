"""Independent, conservative auditor for synthetic order-campaign JSONL evidence.

No application/parser imports. Expectations are supplied by a human/corpus author;
catalog facts are read independently. A pass certifies only listed checks, never an
unobserved checkout. Incomplete trailing JSONL is tolerated while a writer runs.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import json
import math
import re
from pathlib import Path

VERSION = "independent-audit-v4"
ROOT = Path(__file__).resolve().parents[1]
ORACLE_REVISION = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()[:16]
FAMILIES = {
    "AN": {"AN", "SA", "SC", "SH", "SM", "SP", "SR", "ST", "SW", "PN"},
    "AW": {"AW", "UW", "GB", "GO", "NR", "GS", "GK"},
    "AM": {"AM"}, "AP": {"AP"},
}


def rows(path):
    if not path.exists():
        return
    # Decode only complete records; a partial last line is not a failed attempt.
    with path.open(encoding="utf-8-sig") as f:
        for number, line in enumerate(f, 1):
            if not line.endswith("\n"):
                break
            if line.strip():
                yield number, json.loads(line)


def walk(value, path="$"):
    if isinstance(value, dict):
        yield path, value
        for k, v in value.items():
            yield from walk(v, f"{path}.{k}")
    elif isinstance(value, list):
        for i, v in enumerate(value):
            yield from walk(v, f"{path}[{i}]")


def same(a, b):
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return math.isclose(a, b, rel_tol=1e-8, abs_tol=1e-6)
    return a == b


def semantic_constraints(line):
    """Canonicalize two explicit representations of milk avoidance, not text."""
    c = dict(line.get("constraints", line))
    c["claims"] = list(c.get("claims", []))
    c["avoidAllergens"] = list(c.get("avoidAllergens", []))
    if "FREE_FROM_MILK" in c["claims"]:
        c["claims"].remove("FREE_FROM_MILK")
        c["avoidAllergens"].append("AM")
    return c


def product_tokens(text):
    # Independent small bilingual vocabulary for a partial identity check. It
    # cannot prove a full match and is reported as such, never a general parser.
    aliases = {"burgers": "burger", "cakes": "cake", "potatoes": "potato", "eggs": "egg",
               "strawberries": "strawberry", "blueberries": "blueberry", "carrots": "carrot",
               "tomatoes": "tomato", "nuggets": "nugget", "fillets": "fillet",
               "maito": "milk", "maitoa": "milk", "lohi": "salmon", "juusto": "cheese"}
    return [aliases.get(t, t) for t in re.findall(r"[\w]+", (text or "").lower())]


def candidate_identity(product, expected):
    name = product.get("en", product.get("name", ""))
    claims = expected.get("claims", [])
    target = expected.get("product", expected.get("query", ""))
    errors = []
    if expected.get("excludePlantAnalogue") or (target in ("chicken burger", "chicken nuggets", "beef burger", "cream cheese", "mozzarella") and "VEGAN" not in claims):
        if "VEGAN" in product.get("claims", []) or re.search(r"no[ -]?chicken|plant[- ]based|vegan|vegetarian", name, re.I):
            errors.append("animal product request offered a plant analogue")
    if target == "milk" and "VEGAN" not in claims:
        if re.search(r"chocolate|powder|fermented|buttermilk|sour milk|coffee milk|caf[eèé] milk|coconut|oat drink|soy drink", name, re.I):
            errors.append("plain milk request offered a different product type")
    excludes = expected.get("exclude", [])
    for excluded in [excludes] if isinstance(excludes, str) else excludes:
        if excluded.lower() in name.lower() or str(product.get("id")) == str(excluded):
            errors.append(f"explicit excluded identity {excluded}")
    return errors


def check_constraints(product, constraints):
    errors = []
    claims = set(product.get("claims", []))
    for claim in constraints.get("claims", []):
        if claim == "FREE_FROM_MILK":
            continue  # audited as allergen evidence below
        if claim not in claims:
            errors.append(f"required claim {claim} absent")
    avoid = list(constraints.get("avoidAllergens", []))
    if "FREE_FROM_MILK" in constraints.get("claims", []):
        avoid.append("AM")
    contains = set(product.get("contains", [])) | set(product.get("may_contain", product.get("mayContain", [])))
    declared = product.get("has_allergen_data", product.get("hasAllergenData", False))
    for allergen in avoid:
        family = FAMILIES.get(allergen, {allergen})
        if not declared:
            errors.append(f"allergen {allergen}: no declaration")
        if contains & family:
            errors.append(f"allergen {allergen}: contains/may contain {sorted(contains & family)}")
    origin = constraints.get("origin")
    if origin and (product.get("origin") or "").lower() != origin.lower():
        errors.append(f"required origin {origin}; catalog origin {product.get('origin')!r}")
    return errors


def parsed_request(response):
    if not isinstance(response, dict):
        return None
    if isinstance(response.get("request"), dict):
        return response["request"]
    for key in ("parse", "parsed", "interpretation", "result", "body"):
        got = response.get(key)
        if isinstance(got, dict):
            found = parsed_request(got)
            if found:
                return found
    return None


def audit(row, catalog, fixture=None):
    failures, checks, limitations = [], [], []
    response = row.get("response", row.get("output", {}))
    expected = row.get("auditExpected", row.get("expected", {})) or {}
    request = parsed_request(response)
    stage = row.get("stage", "unknown")
    http_status = row.get("status", 200)
    if row.get("error") or (isinstance(http_status, int) and http_status >= 500):
        return "inconclusive", [], [], ["execution/model/service error; semantic result unavailable"]
    if not isinstance(response, dict):
        return "unreviewed", [], [], ["response shape unsupported by oracle"]
    interpretation = response.get("interpretation")
    if isinstance(interpretation, dict) and expected.get("intent"):
        checks.append("independently specified interpreter intent")
        if interpretation.get("intent") != expected["intent"]:
            failures.append({"rule": "intent", "expected": expected["intent"], "observed": interpretation.get("intent")})
        limitations.append("interpreter evidence only; mutation behavior requires coordinator snapshots")
    # Expected lines are independently authored, never derived from returned parse.
    exp_lines = expected.get("lines")
    if exp_lines is None and expected.get("product") and "amount" in expected:
        exp_lines = [expected]
    expected_by_id = {}
    if request:
        actual_lines = request.get("lines", [])
        if "lineCount" in expected:
            checks.append("independently specified item count")
            if len(actual_lines) != expected["lineCount"]:
                failures.append({"rule": "line_count", "expected": expected["lineCount"], "observed": len(actual_lines)})
        for i, line in enumerate(actual_lines):
            exp = dict(exp_lines[i]) if exp_lines is not None and i < len(exp_lines) else {}
            for global_key, local_key in (("globalClaims", "claims"), ("globalAvoidAllergens", "avoidAllergens"), ("globalOrigin", "origin")):
                if global_key in expected:
                    exp[local_key] = expected[global_key]
            expected_by_id[line.get("id")] = exp
            got = semantic_constraints(line)
            for global_key, local_key in (("globalClaims", "claims"), ("globalAvoidAllergens", "avoidAllergens"), ("globalOrigin", "origin")):
                if global_key in expected:
                    checks.append("global constraint propagated to every line")
                    wanted = expected[global_key]
                    ok = same(got.get(local_key), wanted) if local_key == "origin" else set(wanted).issubset(got.get(local_key, []))
                    if not ok:
                        failures.append({"rule": global_key, "line": i, "expected": wanted, "observed": got.get(local_key)})
    if exp_lines is not None and request:
        actual = request.get("lines", [])
        checks.append("parsed item count and ordered line expectations")
        if len(actual) != len(exp_lines):
            failures.append({"rule": "line_count", "expected": len(exp_lines), "observed": len(actual)})
        for i, (exp, got) in enumerate(zip(exp_lines, actual)):
            for key in ("query", "productId"):
                if key in exp and not same(got.get(key), exp[key]):
                    failures.append({"rule": key, "line": i, "expected": exp[key], "observed": got.get(key)})
            if exp.get("product") and not set(product_tokens(exp["product"])).issubset(product_tokens(got.get("query"))):
                failures.append({"rule": "product_words_lost", "line": i, "expected": exp["product"], "observed": got.get("query")})
            for key in ("amount", "unit"):
                if key in exp and not same((got.get("quantity") or {}).get(key), exp[key]):
                    failures.append({"rule": f"quantity_{key}", "line": i, "expected": exp[key], "observed": got.get("quantity")})
            if exp.get("quantityUnspecified") and got.get("quantity"):
                failures.append({"rule": "invented_unspecified_quantity", "line": i, "observed": got["quantity"]})
            for key in ("claims", "avoidAllergens", "origin"):
                if key in exp or (expected.get("oracle") and exp.get("product")):
                    got_value = semantic_constraints(got).get(key, [] if key != "origin" else None)
                    exp_value = semantic_constraints(exp).get(key, [] if key != "origin" else None)
                    if key != "origin":
                        got_value, exp_value = sorted(got_value), sorted(exp_value)
                    if got_value != exp_value:
                        failures.append({"rule": f"constraint_{key}", "line": i, "expected": exp_value, "observed": got_value})
        if "neededBy" in expected and request.get("neededBy") != expected["neededBy"]:
            failures.append({"rule": "neededBy", "expected": expected["neededBy"], "observed": request.get("neededBy")})
    elif exp_lines is not None:
        limitations.append("expected semantic lines provided but no structured parse in evidence")
    # Candidate safety uses both actual need constraints and independent expected ones.
    candidate_count = 0
    evidence = {"response": response, "related": [r.get("response", {}) for r in row.get("related", [])], "snapshots": row.get("snapshots", {})}
    for related in row.get("related", []):
        if isinstance(related.get("status"), int) and related["status"] >= 400:
            limitations.append(f"{related.get('purpose', related.get('path'))}: HTTP {related['status']}; that downstream stage is not certified")
    if isinstance(response.get("planResponse"), dict) and response["planResponse"].get("status", 200) >= 400:
        limitations.append("probe planning failed; parse checks only, no plan certified")
    for path, obj in walk(evidence):
        if isinstance(obj.get("candidates"), list) and isinstance(obj.get("constraints"), dict):
            constraints = semantic_constraints(obj)
            authored = expected_by_id.get(obj.get("id"), {})
            for key in ("claims", "avoidAllergens"):
                constraints[key] = sorted(set(constraints.get(key, [])) | set(authored.get(key, [])))
            if authored.get("origin"):
                constraints["origin"] = authored["origin"]
            for c in obj["candidates"]:
                pid = str(c.get("productId", ""))
                p = catalog.get(pid)
                candidate_count += 1
                if not p:
                    limitations.append(f"{path}: missing catalog product {pid}")
                    continue
                for problem in check_constraints(p, constraints):
                    failures.append({"rule": "candidate_hard_constraint", "path": path, "productId": pid, "problem": problem})
                for problem in candidate_identity(p, authored):
                    failures.append({"rule": "candidate_identity", "path": path, "productId": pid, "problem": problem})
        # Arithmetic is checked independently of rule/verdict labels.
        if all(k in obj for k in ("quantity", "unitPrice", "lineTotal")):
            q, price, total = (obj[k] for k in ("quantity", "unitPrice", "lineTotal"))
            if all(isinstance(x, (int, float)) for x in (q, price, total)):
                checks.append("line arithmetic")
                if abs(round(q * price + 1e-9, 2) - total) > 0.011:
                    failures.append({"rule": "line_total", "path": path, "expected": round(q * price, 2), "observed": total})
                if q < 0 or abs(q - round(q)) > 1e-8:
                    failures.append({"rule": "whole_sales_units", "path": path, "observed": q})
        if isinstance(obj.get("needs"), list) and isinstance(obj.get("lines"), list):
            ids = [l.get("id") for l in obj["lines"] if l.get("id")]
            checks.append("unique plan line identity")
            if len(set(ids)) != len(ids):
                failures.append({"rule": "duplicate_plan_line_ids", "path": path, "observed": ids})
            # Shares describe how one selected product supplies each original
            # need; examine all original need IDs so merged lines cannot hide loss.
            referenced = set(nid for l in obj["lines"] for nid in l.get("needIds", []))
            original = {n.get("id") for n in obj["needs"]}
            if original - referenced and obj.get("status") not in ("needs_input", "blocked"):
                failures.append({"rule": "unrepresented_need", "path": path, "needIds": sorted(original - referenced)})
        if fixture and obj.get("productId") and obj.get("source") == "fixture" and "unitPrice" in obj:
            pid = str(obj["productId"])
            raw_price = fixture.get("price", {}).get(pid)
            raw_supply = fixture.get("availability", {}).get(pid)
            if raw_price and not raw_price.get("error") and obj.get("unitPrice") is not None:
                checks.append("fixed sell price against saved supplier fixture")
                expected_price = raw_price.get("catalogPrice", {}).get("value")
                if expected_price is not None and not same(obj["unitPrice"], expected_price):
                    failures.append({"rule": "fixed_sell_price", "path": path, "expected": expected_price, "observed": obj["unitPrice"]})
            if raw_supply and "candidates[" in path:
                checks.append("candidate supply evidence against saved fixture")
                schedule = raw_supply.get("scheduleLines", [])
                if raw_supply.get("salesBlock") or not schedule:
                    failures.append({"rule": "undeliverable_candidate", "path": path, "productId": pid})
                known_sentinel = False
                for supply in schedule:
                    qty = supply.get("availableAmount")
                    units = catalog.get(pid, {}).get("units", {})
                    scale = units.get(supply.get("salesUnit"), 1)
                    if isinstance(qty, (int, float)):
                        known_sentinel |= (raw_supply.get("logisticModel") == "Terminal" and qty == 999999)
                        known_sentinel |= math.isclose(qty * scale, 9999999999, rel_tol=1e-7)
                if known_sentinel and isinstance(obj.get("stock"), dict) and obj["stock"].get("kind") == "known":
                    failures.append({"rule": "sentinel_asserted_known", "path": path, "productId": pid, "observed": obj["stock"]})
        if isinstance(obj.get("stock"), dict) and obj["stock"].get("kind") == "unknown":
            checks.append("unknown stock preserved as unknown in evidence")
        if obj.get("closingTime") and obj.get("rank") and "candidates[" in path and row.get("scenario", {}).get("clock"):
            checks.append("candidate cutoff against recorded mock clock")
            close = dt.datetime.fromisoformat(obj["closingTime"].replace("Z", "+00:00"))
            clock = dt.datetime.fromisoformat(row["scenario"]["clock"].replace("Z", "+00:00"))
            if close <= clock:
                failures.append({"rule": "expired_candidate_cutoff", "path": path, "closingTime": obj["closingTime"], "clock": row["scenario"]["clock"]})
    if candidate_count:
        checks.append(f"all {candidate_count} primary/secondary candidate catalog constraints")
    limitations.append("identity checks cover explicit selected identity rules; remaining nuanced product identity needs manual review")
    if stage == "parse" or (request and not candidate_count):
        limitations.append("parse evidence only: no assertion about product selections, checkout, stock or replay")
    if not checks:
        return "unreviewed", failures, checks, limitations + ["no supported independent semantic oracle for this row"]
    return ("fail" if failures else "pass"), failures, sorted(set(checks)), sorted(set(limitations))


def atomic_json(path, value):
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(path)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("campaign", type=Path)
    p.add_argument("--input", action="append", default=[])
    args = p.parse_args()
    catalog = {r["id"]: r for _, r in rows(ROOT / "data/products_slim.jsonl")}
    fixture_path = ROOT / "data/fixtures/aimo/base.json"
    fixture = json.loads(fixture_path.read_text(encoding="utf-8")) if fixture_path.exists() else None
    output = args.campaign / "audit.jsonl"
    seen = {r.get("auditKey") for _, r in rows(output)}
    inputs = args.input or ["requests.jsonl", "audit-probes.jsonl"]
    with output.open("a", encoding="utf-8", newline="\n") as out:
        for name in inputs:
            path = args.campaign / name
            for line_number, row in rows(path):
                identity = f"{ORACLE_REVISION}:{name}:{line_number}:{row.get('attemptId')}"
                key = hashlib.sha256(identity.encode()).hexdigest()[:20]
                if key in seen:
                    continue
                try:
                    verdict, failures, checks, limits = audit(row, catalog, fixture)
                except (TypeError, ValueError, KeyError, AttributeError) as exc:
                    verdict, failures, checks, limits = "inconclusive", [], [], [f"unsupported evidence shape: {type(exc).__name__}: {exc}"]
                result = dict(auditKey=key, timestamp=dt.datetime.now(dt.timezone.utc).isoformat(), oracleVersion=VERSION,
                              oracleRevision=ORACLE_REVISION,
                              method="independent_rules", caseId=row.get("caseId"), attemptId=row.get("attemptId"),
                              channel=row.get("channel"), codeSha=row.get("codeSha", row.get("sha")),
                              evidence={"path": str(path), "line": line_number}, verdict=verdict,
                              failures=failures, checks=checks, limitations=limits)
                out.write(json.dumps(result, ensure_ascii=False) + "\n")
                out.flush()
                seen.add(key)
    ledger = list({(r["evidence"]["path"], r["evidence"]["line"], r["method"]): r for _, r in rows(output)}.values())
    automatic = [r for r in ledger if r["method"] == "independent_rules"]
    manual = [r for r in ledger if r["method"] == "manual_semantic"]
    counts = collections.Counter(r["verdict"] for r in automatic)
    atomic_json(args.campaign / "audit-status.json", dict(
        timestamp=dt.datetime.now(dt.timezone.utc).isoformat(), state="auditing", oracleVersion=VERSION,
        auditedRows=len(automatic), verdicts=dict(counts), methods=dict(collections.Counter(r["method"] for r in ledger)),
        manualVerdicts=dict(collections.Counter(r["verdict"] for r in manual)), oracleRevision=ORACLE_REVISION,
        limitation="Rule passes certify listed checks only. All automatic failures are provisional until reproduced in findings.jsonl. Revisions supersede older oracle records by evidence path+line+method. Manual samples are finite and separately counted. Generator still active."))
    print(json.dumps({"rows": len(automatic), "verdicts": counts, "manualReviews": len(manual)}))


if __name__ == "__main__":
    main()
