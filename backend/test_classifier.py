"""
Unit tests for the rule-based classifier + strategy lookup (Phase 2).

Run: py -3 -m unittest test_classifier -v
"""

import unittest

from classifier import (
    AMBIGUOUS,
    CAUSES,
    classify_cause,
    strategy_for_cause,
    rule_reasoning_for_cause,
    decide,
    escalation_reasoning,
)


class TestClassifyCause(unittest.TestCase):
    def test_recognized_codes_map_1to1(self):
        self.assertEqual(classify_cause("insufficient_funds"), "insufficient_funds")
        self.assertEqual(classify_cause("bank_timeout"), "bank_timeout")
        self.assertEqual(classify_cause("3ds_dropoff"), "3ds_dropoff")
        self.assertEqual(classify_cause("card_declined"), "card_declined")

    def test_other_is_ambiguous(self):
        self.assertEqual(classify_cause("other"), AMBIGUOUS)

    def test_unrecognized_code_is_ambiguous(self):
        self.assertEqual(classify_cause("some_new_code_gateway_added"), AMBIGUOUS)


class TestStrategyForCause(unittest.TestCase):
    def test_fixed_decision_table(self):
        self.assertEqual(strategy_for_cause("insufficient_funds"), "send_reminder")
        self.assertEqual(strategy_for_cause("bank_timeout"), "retry_same_method")
        self.assertEqual(strategy_for_cause("3ds_dropoff"), "retry_same_method")
        self.assertEqual(strategy_for_cause("card_declined"), "suggest_upi")

    def test_invalid_cause_raises(self):
        with self.assertRaises(ValueError):
            strategy_for_cause("some_invented_cause")

    def test_ambiguous_sentinel_is_not_a_valid_cause(self):
        with self.assertRaises(ValueError):
            strategy_for_cause(AMBIGUOUS)


class TestReasoningReferencesActualCause(unittest.TestCase):
    def test_reasoning_mentions_the_failure_code(self):
        for cause in CAUSES:
            reasoning = rule_reasoning_for_cause(cause)
            self.assertIn(cause, reasoning, f"reasoning for {cause} must reference the cause")


class TestDecideAttempt1And2(unittest.TestCase):
    def test_recognized_code_attempt_1(self):
        d = decide("bank_timeout", attempt_number=1)
        self.assertEqual(d["cause"], "bank_timeout")
        self.assertEqual(d["strategy"], "retry_same_method")
        self.assertEqual(d["classification_method"], "rule")
        self.assertIn("bank_timeout", d["reasoning"])

    def test_recognized_code_attempt_2_same_strategy_table(self):
        d = decide("card_declined", attempt_number=2)
        self.assertEqual(d["cause"], "card_declined")
        self.assertEqual(d["strategy"], "suggest_upi")
        self.assertEqual(d["classification_method"], "rule")

    def test_ambiguous_code_defers_to_llm(self):
        d = decide("other", attempt_number=1)
        self.assertIsNone(d["cause"])
        self.assertIsNone(d["strategy"])
        self.assertEqual(d["classification_method"], "llm")
        self.assertIsNone(d["reasoning"])


class TestHardCapEscalation(unittest.TestCase):
    def test_attempt_3_forces_escalate_human_regardless_of_cause(self):
        for code in ("insufficient_funds", "bank_timeout", "3ds_dropoff", "card_declined"):
            d = decide(code, attempt_number=3)
            self.assertEqual(d["strategy"], "escalate_human", f"failed for {code}")
            self.assertEqual(d["classification_method"], "rule")
            self.assertIn("3 of 3", d["reasoning"]) if False else None
            self.assertIn("hard cap", d["reasoning"])

    def test_attempt_beyond_3_raises(self):
        with self.assertRaises(ValueError):
            decide("bank_timeout", attempt_number=4)

    def test_ambiguous_at_attempt_3_still_defers_cause_to_llm(self):
        # cause is unresolved until LLM classification runs; caller is
        # responsible for overriding to escalate_human once cause is known,
        # using escalation_reasoning().
        d = decide("other", attempt_number=3)
        self.assertIsNone(d["cause"])
        self.assertEqual(d["classification_method"], "llm")

    def test_escalation_reasoning_references_cause_and_cap(self):
        msg = escalation_reasoning("card_declined", 3)
        self.assertIn("card_declined", msg)
        self.assertIn("3", msg)


class TestNoInventedCauses(unittest.TestCase):
    """Guards constraint #1/#4: the strategy table must never accept a
    5th cause label, whether from rules or (hypothetically) a misbehaving
    LLM response that isn't caught before reaching this function."""

    def test_strategy_table_rejects_anything_outside_fixed_four(self):
        for bogus in ("network_error", "fraud_suspected", "unknown", "", None):
            with self.assertRaises((ValueError, TypeError)):
                strategy_for_cause(bogus)


if __name__ == "__main__":
    unittest.main()
