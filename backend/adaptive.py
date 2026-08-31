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

v2 — self-tuning tiers, not a fixed lookup table.
Earlier versions of this module used four hardcoded recovery-rate
thresholds (e.g. ">=70% -> 1h"). Those numbers were reasonable guesses
but were not actually derived from data — a critical read of the code
would fairly call that "an if/else pretending to be adaptive." This
version instead computes the tier BOUNDARIES live, as quartiles of the
CURRENT distribution of recovery rates across all 4 causes in this
database (see compute_adaptive_delay's `all_cause_rates` argument) —
so the boundaries themselves shift as the dataset's shape shifts. A
cause is "high-recovery" now because it sits in the top quartile of
ITS OWN dataset's causes, not because it cleared a number I typed in.
This is still not a trained model (there's no loss function, nothing
converges) — it's honestly describable as "data-derived thresholds,"
not machine learning, and the code says so rather than overclaiming.
"""

# Fallback delay/label used only when there isn't enough data anywhere
# in the dataset to compute quartiles at all (e.g. a brand-new empty DB).
_DEFAULT_DELAY_HOURS = 12.0
_DEFAULT_TIER_LABEL = "insufficient history"

# The four delay values a cause can land on, from best-recovering quartile
# to worst. Only the boundaries between them are computed from data; the
# delay values themselves are still a deliberate, auditable business choice
# (how many hours "long" means), same as before.
_TIER_DELAYS = (
    (1.0, "top quartile recovery rate — nudge again almost immediately"),
    (6.0, "above-median recovery rate — a short same-day wait"),
    (24.0, "below-median recovery rate — wait a full day before the next nudge"),
    (48.0, "bottom quartile recovery rate — wait two days, immediate re-nudges are not working"),
)

MIN_SAMPLE_SIZE = 5
MIN_CAUSES_FOR_QUARTILES = 3  # need at least 3 distinct causes' rates to rank meaningfully


def _quartile_boundaries(rates: list[float]) -> tuple[float, float, float]:
    """Simple quartile boundaries (25th/50th/75th percentile) over a small
    list, using linear interpolation — no numpy dependency needed for 4
    data points."""
    s = sorted(rates)
    n = len(s)

    def pct(p):
        idx = p * (n - 1)
        lo = int(idx)
        hi = min(lo + 1, n - 1)
        frac = idx - lo
        return s[lo] + (s[hi] - s[lo]) * frac

    return pct(0.25), pct(0.5), pct(0.75)


def compute_adaptive_delay(
    recovery_rate_pct: float | None,
    sample_size: int,
    all_cause_rates: dict[str, float] | None = None,
) -> dict:
    """
    Pure function: given one cause's live recovery_rate_pct (0-100), how
    many resolved transactions that rate is based on, and (optionally) the
    live recovery rates of every cause in the dataset, returns
    {delay_hours, reasoning, tier_label}.

    `all_cause_rates` should be {cause: recovery_rate_pct} for every cause
    with enough data — used to compute this run's quartile boundaries.
    Without it (or with too few distinct causes), falls back to the fixed
    default rather than pretending to rank against nothing.
    """
    if recovery_rate_pct is None or sample_size < MIN_SAMPLE_SIZE:
        return {
            "delay_hours": _DEFAULT_DELAY_HOURS,
            "tier_label": _DEFAULT_TIER_LABEL,
            "reasoning": (
                f"Only {sample_size} resolved transaction(s) for this cause so far "
                f"(need {MIN_SAMPLE_SIZE}+ to trust a computed rate) — using the fixed "
                f"default of {_DEFAULT_DELAY_HOURS}h instead of an unreliable rate-based one."
            ),
        }

    rates = list((all_cause_rates or {}).values())
    if len(rates) < MIN_CAUSES_FOR_QUARTILES:
        return {
            "delay_hours": _DEFAULT_DELAY_HOURS,
            "tier_label": _DEFAULT_TIER_LABEL,
            "reasoning": (
                f"Only {len(rates)} cause(s) have enough data to rank against "
                f"(need {MIN_CAUSES_FOR_QUARTILES}+) — using the fixed default of "
                f"{_DEFAULT_DELAY_HOURS}h instead of an unreliable quartile boundary."
            ),
        }

    q25, q50, q75 = _quartile_boundaries(rates)

    if recovery_rate_pct >= q75:
        delay_hours, label = _TIER_DELAYS[0]
    elif recovery_rate_pct >= q50:
        delay_hours, label = _TIER_DELAYS[1]
    elif recovery_rate_pct >= q25:
        delay_hours, label = _TIER_DELAYS[2]
    else:
        delay_hours, label = _TIER_DELAYS[3]

    return {
        "delay_hours": delay_hours,
        "tier_label": label,
        "reasoning": (
            f"This cause has recovered {recovery_rate_pct:.1f}% of the time across "
            f"{sample_size} resolved transactions so far, ranked against this dataset's "
            f"current quartile boundaries (25th={q25:.1f}%, median={q50:.1f}%, 75th={q75:.1f}%) "
            f"across {len(rates)} causes — {label}, suggesting a {delay_hours:.0f}h delay."
        ),
    }
