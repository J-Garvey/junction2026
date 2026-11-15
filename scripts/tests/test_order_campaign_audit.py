"""Regression tests for the independent oracle's evidence boundaries."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("order_audit", Path(__file__).resolve().parents[1] / "order_campaign_audit.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def line(**changes):
    return dict(id="a", query="milk", quantity={"amount": 10, "unit": "l"}, constraints={"claims": [], "avoidAllergens": [], "labels": []}, **changes)


class EvidenceBoundaries(unittest.TestCase):
    def test_http_success_alone_is_not_a_pass(self):
        self.assertEqual(audit.audit({"status": 200, "response": {"ok": True}}, {})[0], "unreviewed")

    def test_missing_stock_or_model_result_not_certified(self):
        self.assertEqual(audit.audit({"error": "model timeout", "response": {}}, {})[0], "inconclusive")

    def test_incomplete_jsonl_tail_is_deferred(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "rows.jsonl"
            p.write_text('{"caseId":"complete"}\n{"caseId":', encoding="utf-8")
            self.assertEqual(list(audit.rows(p)), [(1, {"caseId": "complete"})])

    def test_unknown_origin_cannot_match_finnish(self):
        self.assertTrue(audit.check_constraints({"origin": None}, {"origin": "fi"}))

    def test_unknown_certification_is_not_verified(self):
        self.assertTrue(audit.check_constraints({"labels": []}, {"labels": ["MARINE_STEWARDSHIP_COUNCIL_LABEL"]}))

    def test_missing_allergen_declaration_is_not_safe(self):
        self.assertIn("no declaration", " ".join(audit.check_constraints({"has_allergen_data": False}, {"avoidAllergens": ["AN"]})))

    def test_child_nut_allergen_and_may_contain_are_checked(self):
        self.assertTrue(audit.check_constraints({"has_allergen_data": True, "may_contain": ["SA"]}, {"avoidAllergens": ["AN"]}))

    def test_milk_free_claim_representation_is_equivalent(self):
        self.assertEqual(audit.semantic_constraints({"claims": ["FREE_FROM_MILK"]})["avoidAllergens"], ["AM"])

    def test_independent_expectation_survives_lost_parse_constraint(self):
        row = {"expected": {"lines": [{"amount": 10, "origin": "fi"}]}, "response": {"request": {"lines": [line()]}, "plan": {"needs": [{"id": "a", "constraints": {}, "candidates": [{"productId": "p"}]}]}}}
        verdict, failures, _, _ = audit.audit(row, {"p": {"origin": "no"}})
        self.assertEqual(verdict, "fail")
        self.assertTrue(any(f["rule"] == "candidate_hard_constraint" for f in failures))

    def test_secondary_candidate_is_checked(self):
        row = {"response": {"plan": {"needs": [{"constraints": {"claims": ["VEGAN"]}, "candidates": [{"productId": "safe"}, {"productId": "unsafe"}]}]}}}
        verdict, failures, _, _ = audit.audit(row, {"safe": {"claims": ["VEGAN"]}, "unsafe": {"claims": []}})
        self.assertEqual(verdict, "fail")
        self.assertEqual(failures[0]["productId"], "unsafe")

    def test_negative_quantity_must_not_become_positive(self):
        row = {"expected": {"lines": [{"amount": -5}]}, "response": {"request": {"lines": [line()]}}}
        self.assertEqual(audit.audit(row, {})[0], "fail")

    def test_plain_milk_cannot_use_coffee_milk_as_backup(self):
        self.assertTrue(audit.candidate_identity({"en": "Coffee milk"}, {"product": "milk"}))

    def test_string_exclusion_is_one_phrase(self):
        self.assertFalse(audit.candidate_identity({"en": "Salmon fillet"}, {"exclude": "trout"}))

    def test_related_plan_failure_is_reported_as_limitation(self):
        row = {"expected": {"lines": [{"amount": 10}]}, "response": {"request": {"lines": [line()]}}, "related": [{"status": 500, "purpose": "planning"}]}
        verdict, _, _, limitations = audit.audit(row, {})
        self.assertEqual(verdict, "pass")
        self.assertTrue(any("not certified" in s for s in limitations))

    def test_unsafe_line_arithmetic_is_detected(self):
        row = {"response": {"lines": [{"quantity": 10, "unitPrice": 14.11, "lineTotal": 70.55}]}}
        self.assertTrue(any(f["rule"] == "line_total" for f in audit.audit(row, {})[1]))

    def test_duplicate_plan_line_identity_is_detected(self):
        row = {"response": {"plan": {"needs": [], "lines": [{"id": "same"}, {"id": "same"}]}}}
        self.assertTrue(any(f["rule"] == "duplicate_plan_line_ids" for f in audit.audit(row, {})[1]))

    def test_invalid_negative_can_safely_require_input(self):
        unresolved = line()
        unresolved["quantity"] = None
        row = {"expected": {"lines": [{"amount": -5, "unit": "kg"}]}, "response": {"request": {"lines": [unresolved]}}}
        self.assertEqual(audit.audit(row, {})[0], "pass")

    def test_explicit_length_rejection_is_not_semantic_success(self):
        row = {"status": 422, "response": {"error": "invalid", "message": "too long"}}
        self.assertEqual(audit.audit(row, {})[0], "inconclusive")

    def test_shared_stock_cannot_be_used_twice(self):
        lines = [{"id": "a", "productId": "p", "quantity": 300, "stock": {"kind": "known", "amount": 384}}, {"id": "b", "productId": "p", "quantity": 300, "stock": {"kind": "known", "amount": 384}}]
        row = {"response": {"plan": {"urgent": True, "needs": [], "lines": lines}}}
        self.assertTrue(any(f["rule"] == "confirmed_stock_overallocation" for f in audit.audit(row, {})[1]))

    def test_quote_must_retain_origin(self):
        row = {"response": {"plan": {"needs": [{"id": "a", "constraints": {"origin": "fi"}}], "lines": [{"id": "ref", "needIds": ["a"]}]}}, "gatewayQuoteRequests": [{"body": {"lines": [{"ref": "ref", "requires": {}}]}}]}
        self.assertTrue(any(f["rule"] == "quote_constraint_lost" for f in audit.audit(row, {})[1]))

    def test_wrong_named_order_proposal_fails_without_mutation(self):
        row = {"expected": {"scope": ["Darragh"]}, "response": {"messages": [{"reply": {"status": "proposal"}}], "conversation": {"pending": {"orderId": "p"}}}, "snapshots": {"draftDetailsBefore": [], "draftDetailsAfter": [{"event": {"id": "p", "name": "Pavit"}, "requests": []}]}}
        self.assertTrue(any(f["rule"] == "wrong_order_proposal" for f in audit.channel_checks(row, {})[0]))

    def test_unsupported_multi_order_can_safely_clarify(self):
        row = {"expected": {"scope": "all", "mustNotSilentlySelectOne": True}, "response": {"messages": [{"reply": {"status": "clarification"}}], "conversation": {"pending": None}}, "snapshots": {"draftDetailsBefore": [], "draftDetailsAfter": []}}
        self.assertEqual(audit.channel_checks(row, {})[0], [])

    def test_global_constraints_merge_with_per_item_expectations(self):
        actual = line()
        actual["constraints"]["claims"] = ["VEGAN"]
        row = {"expected": {"oracle": "independent", "globalClaims": ["VEGAN"], "lines": [{"product": "milk", "amount": 10, "unit": "l"}]}, "response": {"request": {"lines": [actual]}}}
        self.assertEqual(audit.audit(row, {})[0], "pass")

    def test_explicit_sku_can_establish_identity_without_name_in_query(self):
        actual = line()
        actual.update(query="469363", productId="469363")
        row = {"expected": {"lines": [{"product": "milk", "productId": "469363"}]}, "response": {"request": {"lines": [actual]}}}
        self.assertEqual(audit.audit(row, {})[0], "pass")


if __name__ == "__main__":
    unittest.main()
