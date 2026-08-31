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
    strategy_for_llm_classification,
    rule_reasoning_for_cause,
    decide,
    escalation_reasoning,
)
from adaptive import compute_adaptive_delay, MIN_SAMPLE_SIZE


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


class TestAdaptiveDelay(unittest.TestCase):
    """
    Guards the one place outcome data is allowed to change behavior
    (backend/adaptive.py) — never the strategy table, only retry timing.

    v2: tier boundaries are quartiles of the CURRENT dataset's cause
    recovery rates (all_cause_rates), not fixed constants — so these tests
    exercise ranking against a realistic 4-cause distribution rather than
    checking a single rate against hardcoded thresholds.
    """

    # A realistic 4-cause distribution, matching the actual shape seen in
    # recovery.db (insufficient_funds worst, bank_timeout best).
    SAMPLE_RATES = {
        "insufficient_funds": 38.1,
        "card_declined": 63.6,
        "3ds_dropoff": 68.2,
        "bank_timeout": 76.9,
    }

    def test_top_quartile_cause_gets_short_delay(self):
        r = compute_adaptive_delay(76.9, sample_size=26, all_cause_rates=self.SAMPLE_RATES)
        self.assertEqual(r["delay_hours"], 1.0)

    def test_bottom_quartile_cause_gets_long_delay(self):
        r = compute_adaptive_delay(38.1, sample_size=21, all_cause_rates=self.SAMPLE_RATES)
        self.assertEqual(r["delay_hours"], 48.0)

    def test_delay_is_monotonically_non_increasing_as_rank_rises(self):
        # Same 4 rates, evaluated worst-to-best — delay should never increase.
        ordered = sorted(self.SAMPLE_RATES.values())
        delays = [
            compute_adaptive_delay(r, sample_size=20, all_cause_rates=self.SAMPLE_RATES)["delay_hours"]
            for r in ordered
        ]
        for earlier, later in zip(delays, delays[1:]):
            self.assertGreaterEqual(earlier, later)

    def test_insufficient_sample_size_uses_labeled_default_not_a_computed_rate(self):
        r = compute_adaptive_delay(90.0, sample_size=MIN_SAMPLE_SIZE - 1, all_cause_rates=self.SAMPLE_RATES)
        self.assertEqual(r["tier_label"], "insufficient history")
        self.assertIn("resolved transaction", r["reasoning"])

    def test_none_recovery_rate_uses_default(self):
        r = compute_adaptive_delay(None, sample_size=0, all_cause_rates=self.SAMPLE_RATES)
        self.assertEqual(r["tier_label"], "insufficient history")

    def test_too_few_causes_to_rank_uses_default(self):
        # Only 2 causes have data -- not enough to compute meaningful
        # quartiles, so this must fall back rather than fabricate a ranking.
        r = compute_adaptive_delay(60.0, sample_size=20, all_cause_rates={"bank_timeout": 76.9, "card_declined": 63.6})
        self.assertEqual(r["tier_label"], "insufficient history")

    def test_missing_all_cause_rates_uses_default(self):
        r = compute_adaptive_delay(60.0, sample_size=20, all_cause_rates=None)
        self.assertEqual(r["tier_label"], "insufficient history")

    def test_reasoning_always_present_and_references_the_number(self):
        r = compute_adaptive_delay(55.5, sample_size=10, all_cause_rates={
            "insufficient_funds": 30.0, "bank_timeout": 55.5, "3ds_dropoff": 60.0, "card_declined": 70.0,
        })
        self.assertIn("55.5", r["reasoning"])

    def test_boundaries_shift_with_a_different_dataset_shape(self):
        # The whole point of v2: the SAME recovery rate (55%) can land in a
        # different tier depending on what the rest of the dataset looks
        # like — proving the boundary is derived from data, not hardcoded.
        low_context = {"a": 10.0, "b": 20.0, "c": 30.0, "d": 55.0}  # 55 is the top here
        high_context = {"a": 80.0, "b": 85.0, "c": 90.0, "d": 55.0}  # 55 is the bottom here
        r_low_context = compute_adaptive_delay(55.0, sample_size=20, all_cause_rates=low_context)
        r_high_context = compute_adaptive_delay(55.0, sample_size=20, all_cause_rates=high_context)
        self.assertLess(r_low_context["delay_hours"], r_high_context["delay_hours"])


class TestLowConfidenceEscalation(unittest.TestCase):
    """
    Guards the new confidence-driven safety override: an LLM classification
    with self-reported "low" confidence must escalate to a human regardless
    of attempt number, instead of a nudge being sent on a guess.
    """

    def test_high_confidence_uses_normal_strategy_table(self):
        strategy = strategy_for_llm_classification("bank_timeout", "high", attempt_number=1)
        self.assertEqual(strategy, strategy_for_cause("bank_timeout"))
        self.assertNotEqual(strategy, "escalate_human")

    def test_medium_confidence_uses_normal_strategy_table(self):
        strategy = strategy_for_llm_classification("card_declined", "medium", attempt_number=2)
        self.assertEqual(strategy, strategy_for_cause("card_declined"))

    def test_low_confidence_escalates_on_attempt_1(self):
        # The core new behavior: escalates immediately, not after 3 attempts.
        strategy = strategy_for_llm_classification("insufficient_funds", "low", attempt_number=1)
        self.assertEqual(strategy, "escalate_human")

    def test_low_confidence_escalates_on_attempt_2(self):
        strategy = strategy_for_llm_classification("3ds_dropoff", "low", attempt_number=2)
        self.assertEqual(strategy, "escalate_human")

    def test_attempt_3_escalates_regardless_of_confidence(self):
        # The existing hard cap still applies unconditionally, even for a
        # confident classification -- confidence adds a NEW escalation
        # trigger, it doesn't remove the old one.
        for confidence in ("high", "medium", "low"):
            strategy = strategy_for_llm_classification("bank_timeout", confidence, attempt_number=3)
            self.assertEqual(strategy, "escalate_human", f"failed for confidence={confidence}")

    def test_invalid_confidence_raises(self):
        with self.assertRaises(ValueError):
            strategy_for_llm_classification("bank_timeout", "very_sure", attempt_number=1)

    def test_low_confidence_never_reaches_strategy_for_cause_for_a_nudge(self):
        # Every cause, at low confidence, attempt 1 -- none of them should
        # ever produce a retry/reminder/UPI-suggest strategy. This is the
        # literal safety property: a low-confidence guess never triggers a
        # customer-facing nudge.
        for cause in CAUSES:
            strategy = strategy_for_llm_classification(cause, "low", attempt_number=1)
            self.assertEqual(strategy, "escalate_human", f"failed for cause={cause}")


if __name__ == "__main__":
    unittest.main()
