"""
Multi-seed stability check for the outcome-simulation weights.

Addresses a specific criticism: the dashboard's "insufficient_funds recovers
at 38.1% vs bank_timeout at 76.9%" claim comes from ONE run of the seeded
batch, driven by hand-picked probabilities in pipeline.py's _OUTCOME_WEIGHTS.
A single run could plausibly be a lucky/unlucky sample rather than a
reproducible pattern.

This script does NOT touch recovery.db, does NOT call Gemini or Razorpay —
it isolates just the randomized-outcome step (pipeline._simulate_outcome,
pipeline._ATTEMPT_DECAY) and replays it many times across different RNG
seeds, at the same per-cause attempt volumes as the real 91-transaction
batch, to check whether the recovery-rate ORDERING (not the exact numbers)
holds up. Ordering holding up across seeds is what would let a judge trust
"this cause structurally recovers worse than that one" rather than "this
run happened to roll badly."

Usage:
    py -3 stability_check.py [--seeds 20] [--per-cause 22]
"""

import argparse
import random
from collections import defaultdict

from pipeline import _simulate_outcome
from classifier import CAUSES, strategy_for_cause


def run_one_seed(seed: int, per_cause: int) -> dict:
    """
    Simulates `per_cause` independent transactions for each of the 4 fixed
    causes, each running up to 3 attempts through the same
    ignored -> retry -> ... -> recovered/promise/needs_human logic the real
    pipeline uses, and returns {cause: recovery_rate_pct}.
    """
    rng = random.Random(seed)
    recovered = defaultdict(int)
    total = defaultdict(int)

    for cause in CAUSES:
        strategy = strategy_for_cause(cause)
        for _ in range(per_cause):
            total[cause] += 1
            for attempt_number in (1, 2, 3):
                response = _simulate_outcome(rng, cause, strategy, attempt_number)
                if response == "paid":
                    recovered[cause] += 1
                    break
                elif response == "promise_to_pay":
                    break  # counted as resolved-but-not-recovered, matches pipeline.py
                # else "ignored" -> next attempt

    return {cause: round(recovered[cause] / total[cause] * 100.0, 1) for cause in CAUSES}


def main():
    parser = argparse.ArgumentParser(description="Check outcome-weight stability across RNG seeds")
    parser.add_argument("--seeds", type=int, default=20, help="number of independent seeds to run")
    parser.add_argument("--per-cause", type=int, default=22, help="transactions per cause per seed (~91/4)")
    args = parser.parse_args()

    print(f"Running {args.seeds} independent seeds, {args.per_cause} transactions/cause each "
          f"({args.per_cause * 4} total per seed)...\n")

    per_seed_results = []
    for seed in range(1, args.seeds + 1):
        result = run_one_seed(seed, args.per_cause)
        per_seed_results.append(result)

    print(f"{'Seed':<6}" + "".join(f"{c:<20}" for c in CAUSES))
    for i, result in enumerate(per_seed_results, 1):
        print(f"{i:<6}" + "".join(f"{result[c]:<20}" for c in CAUSES))

    print("\n--- Summary across all seeds ---")
    for cause in CAUSES:
        rates = [r[cause] for r in per_seed_results]
        print(f"{cause:<20} min={min(rates):>5.1f}%  max={max(rates):>5.1f}%  "
              f"mean={sum(rates)/len(rates):>5.1f}%  range={max(rates)-min(rates):>5.1f}pp")

    # The specific claim under test: does insufficient_funds recover worse
    # than bank_timeout in EVERY seed, not just the one shown on the
    # dashboard? This is the actual thing "stability" needs to mean here.
    if_rates = [r["insufficient_funds"] for r in per_seed_results]
    bt_rates = [r["bank_timeout"] for r in per_seed_results]
    always_lower = all(a < b for a, b in zip(if_rates, bt_rates))
    print(f"\ninsufficient_funds < bank_timeout in ALL {args.seeds} seeds: {always_lower}")
    if not always_lower:
        n_violations = sum(1 for a, b in zip(if_rates, bt_rates) if a >= b)
        print(f"  ({n_violations}/{args.seeds} seeds violated the ordering — the gap is NOT reliably stable)")


if __name__ == "__main__":
    main()
