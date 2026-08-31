"""
Rule-based root-cause classification and strategy lookup.

These are pure functions — no I/O, no LLM calls. The LLM is only invoked
(elsewhere) when classify_cause() returns AMBIGUOUS, i.e. failure_code is
"other" or unrecognized. The strategy table itself is fixed and never
touched by the LLM.
"""

AMBIGUOUS = "AMBIGUOUS"

# The four fixed cause labels. Nothing outside this set is ever valid,
# whether from the rule table or from the LLM classification path.
CAUSES = ("insufficient_funds", "bank_timeout", "3ds_dropoff", "card_declined")

STRATEGIES = ("retry_same_method", "suggest_upi", "send_reminder", "escalate_human")

# Deterministic failure_code -> cause mapping. Every recognized code maps
# 1:1 to a cause; only "other" (or anything unrecognized) is ambiguous.
_CODE_TO_CAUSE = {
    "insufficient_funds": "insufficient_funds",
    "bank_timeout": "bank_timeout",
    "3ds_dropoff": "3ds_dropoff",
    "card_declined": "card_declined",
}

# Deterministic cause -> strategy mapping. This is the fixed decision table;
# the LLM never chooses a strategy, only explains it / writes copy for it.
_CAUSE_TO_STRATEGY = {
    "insufficient_funds": "send_reminder",
    "bank_timeout": "retry_same_method",
    "3ds_dropoff": "retry_same_method",
    "card_declined": "suggest_upi",
}

# Short, specific reasoning templates for the rule-based path. These feed
# decisions.reasoning_string directly when classification_method == "rule".
_CAUSE_REASONING = {
    "insufficient_funds": (
        "Failure code 'insufficient_funds' indicates the customer's account lacked "
        "sufficient balance at the time of the attempt; immediate retry would likely "
        "fail again, so a delayed reminder is used instead."
    ),
    "bank_timeout": (
        "Failure code 'bank_timeout' indicates a transient bank-side timeout, not a "
        "hard decline; retrying the same payment method is likely to succeed."
    ),
    "3ds_dropoff": (
        "Failure code '3ds_dropoff' indicates the customer abandoned the OTP/3DS "
        "verification screen; retrying the same method gives them another chance to "
        "complete authentication."
    ),
    "card_declined": (
        "Failure code 'card_declined' indicates an issuer-side decline on the card; "
        "suggesting UPI avoids repeating the same failure mode."
    ),
}


def classify_cause(failure_code: str) -> str:
    """
    Deterministic rule-based classification.

    Returns one of the 4 fixed cause labels for recognized codes, or the
    AMBIGUOUS sentinel for "other" / any unrecognized code — signaling that
    the caller must invoke the LLM classification path instead.
    """
    return _CODE_TO_CAUSE.get(failure_code, AMBIGUOUS)


def strategy_for_cause(cause: str) -> str:
    """
    Deterministic cause -> strategy lookup. Raises ValueError for any cause
    outside the 4 fixed labels — this table is never extended at runtime,
    by the LLM or otherwise.
    """
    if cause not in _CAUSE_TO_STRATEGY:
        raise ValueError(
            f"Unknown cause '{cause}' — must be one of {CAUSES}. "
            "Strategies are only defined for the 4 fixed cause labels."
        )
    return _CAUSE_TO_STRATEGY[cause]


def rule_reasoning_for_cause(cause: str) -> str:
    """Reasoning string for the rule-based classification path (no LLM)."""
    if cause not in _CAUSE_REASONING:
        raise ValueError(f"Unknown cause '{cause}' — must be one of {CAUSES}.")
    return _CAUSE_REASONING[cause]


def decide(failure_code: str, attempt_number: int):
    """
    Full deterministic decision for a given attempt.

    attempt_number is 1-indexed (the attempt about to be made). The hard cap
    is enforced here: on attempt_number 3, the strategy is forced to
    "escalate_human" regardless of cause, per the non-negotiable 3-attempt
    cap — cause is still classified/recorded for audit purposes, but the
    outreach strategy is escalation, not a retry/reminder/UPI nudge.

    Returns a dict: {cause_or_ambiguous, strategy, classification_method,
    reasoning} where classification_method is "rule" and reasoning is set
    only when cause is resolved without the LLM. When the code is ambiguous,
    cause/strategy/reasoning are None and the caller must run LLM
    classification, then call strategy_for_cause() + build its own
    LLM-sourced reasoning (still subject to the same attempt_number==3
    escalation override).
    """
    if attempt_number > 3:
        raise ValueError(
            f"attempt_number={attempt_number} exceeds the hard cap of 3 — "
            "no transaction may be decided past 3 attempts."
        )

    cause = classify_cause(failure_code)

    if cause == AMBIGUOUS:
        return {
            "cause": None,
            "strategy": None,
            "classification_method": "llm",
            "reasoning": None,
        }

    if attempt_number == 3:
        return {
            "cause": cause,
            "strategy": "escalate_human",
            "classification_method": "rule",
            "reasoning": (
                f"Attempt {attempt_number} of 3 for cause '{cause}' failed to recover "
                "the payment; hard cap of 3 attempts reached, escalating to human queue "
                "regardless of cause."
            ),
        }

    return {
        "cause": cause,
        "strategy": strategy_for_cause(cause),
        "classification_method": "rule",
        "reasoning": rule_reasoning_for_cause(cause),
    }


def escalation_reasoning(cause: str, attempt_number: int) -> str:
    """Reasoning string used when overriding to escalate_human at attempt 3,
    for callers that resolved `cause` via the LLM path (attempt_number==3,
    cause was AMBIGUOUS before LLM classification)."""
    return (
        f"Attempt {attempt_number} of 3 for cause '{cause}' failed to recover "
        "the payment; hard cap of 3 attempts reached, escalating to human queue "
        "regardless of cause."
    )


VALID_CONFIDENCE = ("high", "medium", "low")


def strategy_for_llm_classification(cause: str, confidence: str, attempt_number: int) -> str:
    """
    Pure decision-table function for the LLM classification path: given a
    resolved cause, the LLM's self-reported confidence in that
    classification, and the attempt number, returns which strategy applies.

    Two independent overrides to the normal strategy_for_cause() lookup,
    checked in this order:
      1. attempt_number == 3 -> escalate_human (the existing hard cap,
         unconditional, takes priority regardless of confidence).
      2. confidence == "low" -> escalate_human, even on attempt 1 or 2. An
         honest "I'm essentially guessing" from the model routes straight
         to a human instead of a nudge being sent on a guess. This is a
         real behavior change driven by the LLM's own self-assessment, not
         a second LLM decision about strategy — the LLM still never picks
         WHICH strategy to use for a confident classification, only
         whether it's confident enough to let the normal table apply.

    Raises ValueError for an invalid confidence level, same defensive
    posture as strategy_for_cause() rejecting invalid causes.
    """
    if confidence not in VALID_CONFIDENCE:
        raise ValueError(f"confidence must be one of {VALID_CONFIDENCE}, got {confidence!r}")

    if attempt_number == 3:
        return "escalate_human"
    if confidence == "low":
        return "escalate_human"
    return strategy_for_cause(cause)
