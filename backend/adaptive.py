"""
Adaptive retry timing — the one place this pipeline lets logged outcome
data change behavior, without ever touching the fixed strategy table.

Design constraint (non-negotiable, matches the rest of this system):
this module NEVER chooses or changes which of the 4 fixed strategies
applies to a cause — classifier.py's decision table stays exactly as
fixed and auditable as before. All this module does is suggest HOW LONG
to wait before the next nudge, based on that cause's actual observed
recovery rate so far in this same database — a real, computed number,
not an LLM guess and not a hardcoded constant per cause.

Why this is safe to call "adaptive": recovery.py's suggested delay for
a given cause literally changes as more transactions resolve, because
it's recomputed live from SQL each time (see pipeline.py's
_compute_adaptive_delay). Run the pipeline against a fresh DB with
different outcomes and the delays for the same cause will differ too —
this is genuinely driven by outcome data, not a fixed table wearing an
"adaptive" label.
"""

# (min_hours, max_hours) delay window, chosen from the cause's live
# recovery rate. Lower recovery rate -> longer suggested delay (an
# immediate re-nudge is unlikely to help; give the customer more time,
# e.g. to top up funds). Higher recovery rate -> short delay (retrying
# soon is working, don't lose momentum). Boundaries are deliberately
# coarse/explainable rather than a continuous formula, so the reasoning
# stays auditable in one sentence.
_TIERS = (
    # (min_recovery_rate_pct_inclusive, delay_hours, label)
    (70.0, 1.0,  "high-recovery cause — nudge again almost immediately"),
    (50.0, 6.0,  "moderate-recovery cause — a short same-day wait"),
    (30.0, 24.0, "low-recovery cause — wait a full day before the next nudge"),
    (0.0,  48.0, "very-low-recovery cause — wait two days, immediate re-nudges are not working"),
)

# Used when there isn't yet enough outcome history for a cause to trust
# a computed rate (see MIN_SAMPLE_SIZE) — a conservative, clearly-labeled
# default rather than pretending to have adapted from nothing.
_DEFAULT_DELAY_HOURS = 12.0
MIN_SAMPLE_SIZE = 5


def compute_adaptive_delay(recovery_rate_pct: float | None, sample_size: int) -> dict:
    """
    Pure function: given a cause's live recovery_rate_pct (0-100) and how
    many resolved transactions that rate is based on, returns
    {delay_hours, reasoning, tier_label}.

    Falls back to a fixed, clearly-labeled default when sample_size is
    below MIN_SAMPLE_SIZE — with too little data a "computed" number would
    be noise dressed up as insight, so this says so explicitly instead.
    """
    if recovery_rate_pct is None or sample_size < MIN_SAMPLE_SIZE:
        return {
            "delay_hours": _DEFAULT_DELAY_HOURS,
            "tier_label": "insufficient history",
            "reasoning": (
                f"Only {sample_size} resolved transaction(s) for this cause so far "
                f"(need {MIN_SAMPLE_SIZE}+ to trust a computed rate) — using the fixed "
                f"default of {_DEFAULT_DELAY_HOURS}h instead of an unreliable rate-based one."
            ),
        }

    for threshold, delay_hours, label in _TIERS:
        if recovery_rate_pct >= threshold:
            return {
                "delay_hours": delay_hours,
                "tier_label": label,
                "reasoning": (
                    f"This cause has recovered {recovery_rate_pct:.1f}% of the time across "
                    f"{sample_size} resolved transactions so far — {label}, "
                    f"suggesting a {delay_hours:.0f}h delay before the next attempt."
                ),
            }

    # Unreachable given _TIERS' 0.0 floor, but keeps the function total.
    return {
        "delay_hours": _DEFAULT_DELAY_HOURS,
        "tier_label": "unclassified",
        "reasoning": f"Recovery rate {recovery_rate_pct} did not match any tier; used the default.",
    }
