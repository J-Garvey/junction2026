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
    for label in constraints.get("labels", []):
        if label not in product.get("labels", []):
            errors.append(f"required certification label {label} absent")
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


def basket_state(detail):
    """Compare observable staged content, excluding proposals and UI timestamps."""
    staged = []
    for request in detail.get("requests", []):
        if not request.get("basketedAt") and not request.get("orderIds"):
            continue
        for line in request.get("lines", []):
            if not line.get("removed"):
                staged.append((line.get("productId"), line.get("quantity"), line.get("salesUnit"), line.get("outletId")))
    receipts = sorted(o.get("id", "") for o in detail.get("orders", []))
    return sorted(staged, key=str), receipts


def channel_checks(row, catalog):
    response = row.get("response", {})
    messages = response.get("messages", [])
    reply = next((m["reply"] for m in reversed(messages) if isinstance(m, dict) and m.get("reply")), None)
    snapshots = row.get("snapshots", {})
    before = snapshots.get("draftDetailsBefore")
    after = snapshots.get("draftDetailsAfter")
    if not reply or not isinstance(before, list) or not isinstance(after, list):
        return [], [], ["channel snapshots or structured reply unavailable; no scope/mutation certification"]
    checks, failures, limits = ["channel before/after staged baskets and structured reply"], [], []
    expected = row.get("auditExpected", row.get("expected", {}))
    before_by_id = {d["event"]["id"]: d for d in before if d.get("event")}
    after_by_id = {d["event"]["id"]: d for d in after if d.get("event")}
    changes = {key for key, d in after_by_id.items() if key not in before_by_id or basket_state(d) != basket_state(before_by_id[key])}
    scope = expected.get("scope")
    names = {key: d["event"]["name"] for key, d in after_by_id.items()}
    allowed = {key for key, name in names.items() if isinstance(scope, list) and name in scope}
    conversation = response.get("conversation", {})
    pending = conversation.get("pending") or {}
    if isinstance(scope, list):
        checks.append("named-order scope against actual event IDs")
        if changes - allowed:
            failures.append({"rule": "wrong_order_mutation", "expected": scope, "observed": [names[k] for k in changes - allowed]})
        if pending.get("orderId") and pending["orderId"] not in allowed:
            failures.append({"rule": "wrong_order_proposal", "expected": scope, "observed": names.get(pending["orderId"], pending["orderId"])})
    if expected.get("mustNotMutate") and changes:
        failures.append({"rule": "forbidden_mutation", "observed": [names[k] for k in changes]})
    if expected.get("mustNotSilentlySelectOne"):
        checks.append("unsupported multi-order request safely clarifies or covers complete scope")
        if pending.get("orderId") or (len(changes) == 1):
            failures.append({"rule": "silently_selected_one_order", "observed": pending.get("orderId") or list(changes)})
    if reply.get("status") in ("clarification", "blocked"):
        checks.append("safe clarification/block without staged mutation")
        if changes:
            failures.append({"rule": "mutation_during_clarification", "observed": [names[k] for k in changes]})
    for key, d in after_by_id.items():
        original_ids = {r.get("id") for r in before_by_id.get(key, {}).get("requests", [])}
        for request in d.get("requests", []):
            if request.get("id") in original_ids:
                continue
            if reply.get("status") not in ("proposal", "updated", "ordered", "approval_required"):
                continue
            for line in request.get("lines", []):
                product = catalog.get(str(line.get("productId")))
                if product:
                    checks.append("new channel selection against independently authored hard constraints")
                    for problem in check_constraints(product, expected):
                        failures.append({"rule": "channel_selection_hard_constraint", "productId": product["id"], "problem": problem})
                    for problem in candidate_identity(product, expected):
                        failures.append({"rule": "channel_selection_identity", "productId": product["id"], "problem": problem})
    orders = snapshots.get("orders", {}).get("orders", [])
    if expected.get("mustNotOrder"):
        checks.append("no receipt for explicitly non-orderable request")
        if orders:
            failures.append({"rule": "unexpected_receipt", "orderIds": [o.get("id") for o in orders]})
    if expected.get("noDuplicateOrders"):
        checks.append("single-order sequence receipt count")
        if len(orders) > 1:
            failures.append({"rule": "duplicate_receipts", "orderIds": [o.get("id") for o in orders]})
    limits.append("channel rules verify observable scope and selected catalog facts; precise conversation meaning/confirmation sequence still requires manual sample")
    return failures, checks, limits


def confirmation_checks(row):
    """An acknowledged UI preview must name the plan actually staged next."""
    expected = row.get("auditExpected", row.get("expected", {}))
    if not expected.get("previewMustMatchAppliedChange"):
        return [], []
    response = row.get("response", {})
    previous = response.get("initial", {})
    shown = None
    failures = []
    for index, step in enumerate(response.get("observations", [])):
        output = step.get("output", {}).get("response", {})
        reply = next((m["reply"] for m in reversed(output.get("messages", [])) if m.get("reply")), {})
        current = step.get("baskets", {})
        if reply.get("status") == "updated" and shown and shown.get("planId"):
            added = []
            for name, basket in current.items():
                old_ids = {r["id"] for r in previous.get(name, {}).get("response", {}).get("requests", []) if r.get("basketedAt")}
                added.extend(r["id"] for r in basket.get("response", {}).get("requests", []) if r.get("basketedAt") and r["id"] not in old_ids)
            if added != [shown["planId"]]:
                failures.append({"rule": "confirmation_preview_mismatch", "step": index, "expectedPlanId": shown["planId"], "stagedPlanIds": added})
        shown = output.get("conversation", {}).get("pending")
        previous = current
    return failures, ["applied staged plan equals last preview exposed by channel response"]


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
    if isinstance(http_status, int) and http_status >= 400:
        return "inconclusive", [], ["request explicitly rejected"], [f"HTTP {http_status}: {response.get('message', response.get('error'))}; no semantic parse or downstream capability certified"]
    interpretation = response.get("interpretation")
    if isinstance(interpretation, dict) and (expected.get("intent") or expected.get("allowedIntents")):
        checks.append("independently specified interpreter intent")
        allowed = expected.get("allowedIntents", [expected.get("intent")])
        if interpretation.get("intent") not in allowed:
            failures.append({"rule": "intent", "expected": allowed, "observed": interpretation.get("intent")})
        limitations.append("interpreter evidence only; mutation behavior requires coordinator snapshots")
    if row.get("channel") == "whatsapp":
        channel_failures, channel_done, channel_limits = channel_checks(row, catalog)
        failures.extend(channel_failures)
        checks.extend(channel_done)
        limitations.extend(channel_limits)
    if row.get("channel") == "whatsapp_coordinator":
        confirm_failures, confirm_done = confirmation_checks(row)
        failures.extend(confirm_failures)
        checks.extend(confirm_done)
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
            exp = expected_by_id.get(got.get("id"), exp)
            for key in ("query", "productId"):
                if key in exp and not same(got.get(key), exp[key]):
                    failures.append({"rule": key, "line": i, "expected": exp[key], "observed": got.get(key)})
            if exp.get("product") and not (exp.get("productId") and exp.get("productId") == got.get("productId")) and not set(product_tokens(exp["product"])).issubset(product_tokens(got.get("query"))):
                failures.append({"rule": "product_words_lost", "line": i, "expected": exp["product"], "observed": got.get("query")})
            for key in ("amount", "unit"):
                if not got.get("quantity") and exp.get("amount", 1) <= 0:
                    checks.append("invalid quantity safely left unresolved")
                    continue
                if not got.get("quantity") and key in exp:
                    limitations.append("explicit quantity unresolved; safe clarification may be appropriate, exact parse not certified")
                    continue
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
    line_requirements = {}
    for path, obj in walk(evidence):
        if isinstance(obj.get("candidates"), list) and isinstance(obj.get("constraints"), dict):
            constraints = semantic_constraints(obj)
            authored = expected_by_id.get(obj.get("id"), {})
            for key in ("claims", "avoidAllergens"):
                constraints[key] = sorted(set(constraints.get(key, [])) | set(authored.get(key, [])))
            if authored.get("origin"):
                constraints["origin"] = authored["origin"]
            if isinstance(authored.get("amount"), (int, float)) and authored.get("unit") and isinstance(obj.get("amount"), dict):
                unit = authored["unit"]
                factor, base_unit = {"g": (.001, "kg"), "kg": (1, "kg"), "ml": (.001, "l"), "dl": (.1, "l"), "l": (1, "l"), "pcs": (1, "pcs")}.get(unit, (None, None))
                if factor is not None:
                    checks.append("need quantity conversion against authored per-item amount")
                    if obj["amount"].get("unit") != base_unit or not same(obj["amount"].get("value"), authored["amount"] * factor):
                        failures.append({"rule": "need_quantity", "path": path, "expected": {"value": authored["amount"] * factor, "unit": base_unit}, "observed": obj["amount"]})
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
            if obj.get("deliveryDate"):
                try:
                    dt.date.fromisoformat(obj["deliveryDate"])
                    checks.append("proposed delivery calendar date exists")
                except ValueError:
                    if obj.get("proposal") or obj.get("orderIds"):
                        failures.append({"rule": "invalid_calendar_delivery", "path": path, "observed": obj["deliveryDate"]})
                    else:
                        limitations.append("invalid calendar date retained in a non-actionable plan; no valid date certified")
            if len(set(ids)) != len(ids):
                failures.append({"rule": "duplicate_plan_line_ids", "path": path, "observed": ids})
            # Shares describe how one selected product supplies each original
            # need; examine all original need IDs so merged lines cannot hide loss.
            referenced = set(nid for l in obj["lines"] for nid in l.get("needIds", []))
            original = {n.get("id") for n in obj["needs"]}
            if original - referenced and obj.get("status") not in ("needs_input", "blocked"):
                failures.append({"rule": "unrepresented_need", "path": path, "needIds": sorted(original - referenced)})
            by_need = {n.get("id"): semantic_constraints(n) for n in obj["needs"]}
            allocations = collections.defaultdict(list)
            for line in obj["lines"]:
                if line.get("removed"):
                    continue
                line_requirements[line.get("id")] = [by_need[n] for n in line.get("needIds", []) if n in by_need]
                if isinstance(line.get("stock"), dict) and line["stock"].get("kind") == "known":
                    allocations[(line.get("productId"), line.get("availableDate"))].append(line)
                pack, need = line.get("packContent"), line.get("needAmount")
                if pack and need and pack.get("verified") and pack.get("value", 0) > 0 and pack.get("unit") == need.get("unit") and not obj.get("shortfall"):
                    checks.append("whole-pack coverage and rounding")
                    if line.get("allocation") == "primary" and len(line.get("needIds", [])) == 1 and line.get("status") == "covered":
                        minimum = math.ceil(need["value"] / pack["value"] - 1e-9)
                        if line.get("quantity") < minimum:
                            failures.append({"rule": "pack_underfill", "path": path, "expectedMinimumSalesUnits": minimum, "observed": line.get("quantity")})
            if obj.get("urgent"):
                checks.append("shared confirmed stock across repeated SKU allocations")
                for (pid, date), lines in allocations.items():
                    total = sum(l.get("quantity", 0) for l in lines)
                    stock = min(l["stock"]["amount"] for l in lines)
                    if total > stock + 1e-6:
                        failures.append({"rule": "confirmed_stock_overallocation", "path": path, "productId": pid, "date": date, "allocated": total, "knownStock": stock})
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
    for quote in row.get("gatewayQuoteRequests", []):
        for line in quote.get("body", {}).get("lines", []):
            requirements = semantic_constraints(line.get("requires", {}))
            for expected_constraints in line_requirements.get(line.get("ref"), []):
                checks.append("requirements retained in actual gateway quote HTTP body")
                for field in ("claims", "avoidAllergens", "labels", "origin"):
                    wanted = expected_constraints.get(field)
                    if not wanted:
                        continue
                    matches = requirements.get(field) == wanted if field == "origin" else set(wanted).issubset(requirements.get(field, []))
                    if not matches:
                        failures.append({"rule": "quote_constraint_lost", "ref": line.get("ref"), "field": field, "expected": wanted, "observed": requirements.get(field)})
    if candidate_count:
        checks.append(f"all {candidate_count} primary/secondary candidate catalog constraints")
    limitations.append("identity checks cover explicit selected identity rules; remaining nuanced product identity needs manual review")
    if stage == "parse" or (request and not candidate_count):
        limitations.append("parse evidence only: no assertion about product selections, checkout, stock or replay")
    if not checks:
        return "unreviewed", failures, checks, limitations + ["no supported independent semantic oracle for this row"]
    disposition = "fail" if failures else "inconclusive" if any("quantity unresolved" in s for s in limitations) else "pass"
    return disposition, failures, sorted(set(checks)), sorted(set(limitations))


def atomic_json(path, value):
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(path)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("campaign", type=Path)
    p.add_argument("--input", action="append", default=[])
    p.add_argument("--finish", action="store_true", help="Write completion only after generator.done.json exists and every complete input row has a verdict")
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
    findings = {r["findingId"]: r for _, r in rows(args.campaign / "findings.jsonl")}
    generator_path = args.campaign / "generator-status.json"
    generator = json.loads(generator_path.read_text(encoding="utf-8-sig")) if generator_path.exists() else {}
    atomic_json(args.campaign / "audit-status.json", dict(
        timestamp=dt.datetime.now(dt.timezone.utc).isoformat(), state="auditing", role="independent_auditor", oracleVersion=VERSION,
        auditedRows=len(automatic), verdicts=dict(counts), methods=dict(collections.Counter(r["method"] for r in ledger)),
        manualVerdicts=dict(collections.Counter(r["verdict"] for r in manual)), oracleRevision=ORACLE_REVISION,
        findingStates={k: v["state"] for k, v in findings.items()}, worktree=str(ROOT),
        generatorState={k: generator.get(k) for k in ("state", "phase", "uniqueExecuted", "executedRows", "sha", "modelMode")},
        limitation="Rule passes certify listed checks only. All automatic failures are provisional until reproduced in findings.jsonl. Revisions supersede older oracle records by evidence path+line+method. Manual samples are finite and separately counted. Generator still active."))
    print(json.dumps({"rows": len(automatic), "verdicts": counts, "manualReviews": len(manual)}))
    if args.finish:
        done_path = args.campaign / "generator.done.json"
        if not done_path.exists():
            raise SystemExit("Generator has not published generator.done.json; audit remains active")
        covered = {(r["evidence"]["path"], r["evidence"]["line"]) for r in automatic}
        channel_counts, modes, sha_counts = collections.Counter(), collections.Counter(), collections.Counter()
        source_counts, latest_cases = {}, {}
        plans, candidates = set(), set()
        unresolved = {key: value["state"] for key, value in findings.items() if not value["state"].startswith("verified")}
        for name in inputs:
            path = args.campaign / name
            source_counts[name] = 0
            if path.exists() and path.stat().st_size and not path.read_bytes().endswith(b"\n"):
                raise SystemExit(f"Incomplete final input line in {path}; audit remains active")
            for number, row in rows(path):
                if (str(path), number) not in covered:
                    raise SystemExit(f"Missing verdict for {path}:{number}")
                source_counts[name] += 1
                channel_counts[row.get("channel", "unknown")] += 1
                modes[row.get("modelMode", row.get("parserModelMode", "unknown"))] += 1
                sha_counts[row.get("sha", row.get("codeSha", "unknown"))] += 1
                latest_cases[(name, row.get("caseId"), row.get("channel"))] = (str(path), number)
                response = {"response": row.get("response"), "related": [r.get("response") for r in row.get("related", [])], "snapshots": row.get("snapshots")}
                for _, obj in walk(response):
                    if isinstance(obj.get("needs"), list) and isinstance(obj.get("lines"), list) and obj.get("id"):
                        plans.add((row.get("attemptId"), obj["id"]))
                        for need in obj["needs"]:
                            for candidate in need.get("candidates", []):
                                candidates.add((row.get("attemptId"), obj["id"], need.get("id"), candidate.get("productId")))
        current = {(r["evidence"]["path"], r["evidence"]["line"]): r for r in automatic}
        completion = dict(
            completedAt=dt.datetime.now(dt.timezone.utc).isoformat(), state="drained", oracleVersion=VERSION, oracleRevision=ORACLE_REVISION,
            sourceRows=source_counts, auditedRows=len(automatic), automaticVerdictsAllAttempts=dict(counts),
            latestAttemptVerdictsByCaseChannel=dict(collections.Counter(current[key]["verdict"] for key in latest_cases.values())),
            manualReviewedAttempts=len(manual), manualVerdicts=dict(collections.Counter(r["verdict"] for r in manual)),
            channels=dict(channel_counts), modelModes=dict(modes), codeShas=dict(sha_counts),
            uniquePlansInspected=len(plans), uniqueNeedCandidatesInspected=len(candidates),
            findingStates={key: value["state"] for key, value in findings.items()}, unresolvedConfirmedFindings=unresolved,
            worktree=str(ROOT), generatorCompletion=str(done_path),
            limitations=["Drained means every available row has an explicit scoped verdict; it does not mean every outcome is correct.",
                         "Automatic failures are provisional review flags. Confirmed reproducible defects and repair verification live in findings.jsonl.",
                         "Missing-fixture interception, explicit input-length rejection and model/service errors do not certify downstream execution.",
                         "Manual reviews are finite semantic samples; all other rows were reviewed by independent rules or explicitly left inconclusive/unreviewed.",
                         "Verified model-disabled repairs certify the exact tested replay, not untested model outputs or real WhatsApp transport."])
        atomic_json(args.campaign / "audit.done.json", completion)
        atomic_json(args.campaign / "audit-status.json", completion)
        print(json.dumps({"state": "drained", "sourceRows": source_counts, "unresolvedConfirmedFindings": unresolved}))


if __name__ == "__main__":
    main()
