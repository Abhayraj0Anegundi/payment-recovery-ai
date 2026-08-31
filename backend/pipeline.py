"""
Full recovery pipeline — runs the seeded batch of failed transactions
through classify -> decide -> message -> payment link -> mock-send ->
simulate response -> retry/escalate, with a hard 3-attempt cap and a
complete audit_log trail.

Usage:
    py -3 pipeline.py [--db PATH] [--seed SEED] [--limit N]

Every decision/message/payment-link/outcome write is paired with an
audit_log row in the SAME sqlite transaction/commit (constraint #3).
The LLM never picks a strategy — classifier.decide() (rule-based) or the
LLM classification path (ambiguous only) resolves root_cause, and the
fixed decision table resolves strategy. The LLM only explains + writes
Hinglish copy for a strategy that was already chosen.
"""

import argparse
import random
import sqlite3
import sys
import time
import uuid
from pathlib import Path

from classifier import (
    decide, escalation_reasoning, classify_cause, strategy_for_cause,
    strategy_for_llm_classification, AMBIGUOUS,
)
from gemini_client import classify_ambiguous_cause, generate_hinglish_message, fallback_message, GeminiCallError
from razorpay_client import (
    create_payment_link, mock_payment_link, RazorpayCallError, RazorpayQuotaExhausted,
)
from adaptive import compute_adaptive_delay, MIN_SAMPLE_SIZE

BACKEND_DIR = Path(__file__).parent
DEFAULT_DB_PATH = BACKEND_DIR / "recovery.db"

# Unique per process invocation so re-running the pipeline against a
# freshly-reseeded DB (which restarts transaction ids from 1) never collides
# with reference_ids Razorpay already has on file from a prior run.
_RUN_ID = uuid.uuid4().hex[:8]

# Once we see RazorpayQuotaExhausted once in a run, stop hammering the real
# API for the rest of it (every subsequent call would fail identically) and
# switch straight to disclosed mock links. Tracked for the end-of-run summary.
_quota_exhausted = [False]
_link_stats = {"real": 0, "mocked": 0}

# Simulated customer response probabilities per root_cause, per the spec's
# guidance that e.g. bank_timeout retries recover more often than
# insufficient_funds reminders. Weights are for (paid, promise_to_pay, ignored)
# and are deliberately hand-picked to be realistic, not tuned to hit a target
# recovery rate — the recovery rate is computed live from what actually happens.
_OUTCOME_WEIGHTS = {
    # cause -> strategy -> (paid, promise_to_pay, ignored)
    "bank_timeout":         {"retry_same_method": (0.55, 0.10, 0.35)},
    "3ds_dropoff":          {"retry_same_method": (0.45, 0.15, 0.40)},
    "card_declined":        {"suggest_upi":        (0.40, 0.15, 0.45)},
    "insufficient_funds":   {"send_reminder":       (0.25, 0.30, 0.45)},
}
# escalate_human is terminal — no outcome simulation, handled separately.

# attempt_number 2+ generally recovers a bit less than attempt 1 (diminishing
# returns on a customer who already ignored one nudge).
_ATTEMPT_DECAY = {1: 1.0, 2: 0.75, 3: 0.5}


def _weighted_choice(rng: random.Random, weights: dict) -> str:
    keys = list(weights.keys())
    vals = list(weights.values())
    return rng.choices(keys, weights=vals, k=1)[0]


def _simulate_outcome(rng: random.Random, cause: str, strategy: str, attempt_number: int) -> str:
    base = _OUTCOME_WEIGHTS.get(cause, {}).get(strategy)
    if base is None:
        base = (0.30, 0.15, 0.55)
    paid, promise, ignored = base
    decay = _ATTEMPT_DECAY.get(attempt_number, 0.5)
    paid *= decay
    promise *= decay
    ignored = 1.0 - paid - promise
    return _weighted_choice(rng, {"paid": paid, "promise_to_pay": promise, "ignored": ignored})


def _live_recovery_rate_for_cause(conn, cause: str) -> tuple[float | None, int]:
    """
    Returns (recovery_rate_pct, sample_size) for `cause`, computed live from
    every transaction whose MOST RECENT decision resolved to that cause and
    has already reached a terminal status (recovered / promise_to_pay /
    needs_human). This is the same live-aggregate pattern api.py's
    /api/metrics/by-cause and /api/metrics/adaptive-insight use — genuinely
    recomputed on every call, not cached or precomputed offline, so the
    adaptive delay below actually shifts as more transactions resolve.
    """
    row = conn.execute(
        """
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN t.status = 'recovered' THEN 1 ELSE 0 END) AS recovered
        FROM transactions t
        JOIN (
            SELECT d1.transaction_id, d1.root_cause
            FROM decisions d1
            INNER JOIN (
                SELECT transaction_id, MAX(attempt_number) AS max_attempt
                FROM decisions GROUP BY transaction_id
            ) d2 ON d1.transaction_id = d2.transaction_id AND d1.attempt_number = d2.max_attempt
        ) latest ON latest.transaction_id = t.id
        WHERE latest.root_cause = ? AND t.status IN ('recovered', 'promise_to_pay', 'needs_human')
        """,
        (cause,),
    ).fetchone()
    total = row[0] or 0
    recovered = row[1] or 0
    if total == 0:
        return None, 0
    return (recovered / total * 100.0), total


def _live_recovery_rates_all_causes(conn, min_sample_size: int) -> dict[str, float]:
    """
    Returns {cause: recovery_rate_pct} for every cause that currently has at
    least `min_sample_size` resolved transactions — the live dataset
    adaptive.compute_adaptive_delay ranks a single cause's rate against to
    derive this run's quartile boundaries. One grouped query instead of
    calling _live_recovery_rate_for_cause once per cause.
    """
    rows = conn.execute(
        """
        SELECT
            latest.root_cause AS cause,
            COUNT(*) AS total,
            SUM(CASE WHEN t.status = 'recovered' THEN 1 ELSE 0 END) AS recovered
        FROM transactions t
        JOIN (
            SELECT d1.transaction_id, d1.root_cause
            FROM decisions d1
            INNER JOIN (
                SELECT transaction_id, MAX(attempt_number) AS max_attempt
                FROM decisions GROUP BY transaction_id
            ) d2 ON d1.transaction_id = d2.transaction_id AND d1.attempt_number = d2.max_attempt
        ) latest ON latest.transaction_id = t.id
        WHERE t.status IN ('recovered', 'promise_to_pay', 'needs_human')
        GROUP BY latest.root_cause
        """
    ).fetchall()
    return {
        r[0]: (r[2] or 0) / r[1] * 100.0
        for r in rows
        if r[1] >= min_sample_size
    }


def _audit(conn, transaction_id: int, actor: str, action: str, reasoning: str):
    conn.execute(
        "INSERT INTO audit_log (transaction_id, actor, action, reasoning_string) VALUES (?, ?, ?, ?)",
        (transaction_id, actor, action, reasoning),
    )


def _resolve_decision(conn, txn: dict, attempt_number: int) -> dict:
    """
    Returns a fully-resolved decision dict {cause, strategy, classification_method,
    reasoning, confidence}, running LLM classification only if the rule-based
    path is AMBIGUOUS. Applies the attempt-3 hard-cap override after cause
    resolution. Logs every classification/decision step to audit_log (same
    transaction, caller commits).

    Confidence-driven escalation: when the LLM classifies with "low"
    confidence, strategy is forced to escalate_human regardless of
    attempt_number — an honest "I'm essentially guessing" from the model
    routes straight to a human instead of a nudge being sent on a guess.
    This is a real behavior change (see gemini_client.py's confidence
    field), not a cosmetic label — a low-confidence classification never
    reaches strategy_for_cause().
    """
    txn_id = txn["id"]
    failure_code = txn["razorpay_failure_code"]

    d = decide(failure_code, attempt_number)

    if d["classification_method"] == "llm" or d["cause"] is None:
        # Ambiguous rule-based result -> must classify via LLM.
        confidence = None
        try:
            llm_result = classify_ambiguous_cause(
                txn["failure_note"], txn["amount"], txn["original_payment_method"]
            )
            cause = llm_result["cause"]
            confidence = llm_result["confidence"]
            justification = llm_result["justification"]
            _audit(
                conn, txn_id, "llm", "classify_root_cause",
                f"LLM classified ambiguous failure_code='other' as '{cause}' "
                f"(confidence={confidence}): {justification}",
            )
        except (GeminiCallError, ValueError) as e:
            # Deterministic fallback: cannot leave root_cause unresolved, so
            # fall back to the most common ambiguous-cause bucket and log it
            # explicitly as a fallback, per audit requirements. Treated as
            # "low" confidence -- a fallback IS the system being uncertain,
            # by definition, so it gets the same escalation treatment.
            cause = "card_declined"
            confidence = "low"
            justification = "LLM classification failed twice; defaulted to card_declined as the most common ambiguous cause."
            _audit(conn, txn_id, "system", "llm_fallback_used", f"Classification fallback: {e}")
            _audit(conn, txn_id, "system", "classify_root_cause", justification)

        # Pure decision-table function (classifier.py) — attempt-3 cap and
        # low-confidence override are checked there, in one place, so this
        # logic can't drift out of sync between pipeline.py and its tests.
        strategy = strategy_for_llm_classification(cause, confidence, attempt_number)

        if attempt_number == 3:
            reasoning = escalation_reasoning(cause, attempt_number)
        elif strategy == "escalate_human":  # must be the low-confidence override
            reasoning = (
                f"LLM classified this as '{cause}' but self-reported LOW confidence: "
                f"{justification} Escalating to a human instead of nudging on a guess, "
                "regardless of attempt number."
            )
            _audit(
                conn, txn_id, "system", "escalate_low_confidence",
                f"Attempt {attempt_number}: low-confidence classification ('{cause}') "
                "routed to needs_human instead of proceeding with a nudge.",
            )
        else:
            reasoning = justification

        return {
            "cause": cause,
            "strategy": strategy,
            "classification_method": "llm",
            "reasoning": reasoning,
            "confidence": confidence,
        }

    # Rule-based path — already fully resolved by decide().
    _audit(
        conn, txn_id, "system", "classify_root_cause",
        f"Rule-based classification: failure_code='{failure_code}' -> cause='{d['cause']}'",
    )
    return d


def _generate_message_text(txn: dict, decision: dict, attempt_number: int, payment_link: str) -> tuple[str, bool]:
    """Returns (message_text, used_fallback)."""
    try:
        result = generate_hinglish_message(
            customer_name=txn["customer_name"],
            amount=txn["amount"],
            root_cause=decision["cause"],
            strategy_chosen=decision["strategy"],
            attempt_number=attempt_number,
            payment_link=payment_link,
        )
        return result["message"], result["reasoning"], False
    except (GeminiCallError, ValueError) as e:
        text = fallback_message(txn["customer_name"], decision["cause"], decision["strategy"], payment_link)
        reasoning = f"LLM message generation failed twice, used deterministic fallback template: {e}"
        return text, reasoning, True


def process_one_attempt(conn, txn: dict, attempt_number: int) -> bool:
    """
    Runs exactly ONE attempt for a transaction: classify -> decide -> link ->
    message -> update status to 'contacted'. Does NOT simulate or record a
    customer response — call record_customer_response() separately for that
    (see below). Same atomic-commit-with-audit-row contract throughout.

    This is the unit both the batch pipeline (which pairs it with a
    simulated response, 3x in a row) and the live webhook demo (one real
    event at a time, response recorded on a separate action) share — there
    is only one code path that ever produces a decision/message, whether
    triggered by seed data or a real Razorpay webhook.

    Returns True if the transaction reached a terminal state without even
    sending a message (only happens via the attempt-3 forced escalation —
    see classifier.decide()), False if a message was sent and a customer
    response is now awaited.
    """
    txn_id = txn["id"]
    with conn:  # BEGIN...COMMIT per attempt — atomic decision+message+link+audit
        decision = _resolve_decision(conn, txn, attempt_number)

        # Adaptive retry timing (backend/adaptive.py): computed live from
        # this cause's actual recovery rate so far in THIS database — never
        # influences decision["strategy"] above, which stays exactly as
        # fixed/auditable as before. No further retry is scheduled once
        # escalated, so this is left NULL for escalate_human.
        if decision["strategy"] == "escalate_human":
            delay_hours, delay_reasoning = None, None
        else:
            recovery_rate, sample_size = _live_recovery_rate_for_cause(conn, decision["cause"])
            all_cause_rates = _live_recovery_rates_all_causes(conn, MIN_SAMPLE_SIZE)
            delay_result = compute_adaptive_delay(recovery_rate, sample_size, all_cause_rates)
            delay_hours = delay_result["delay_hours"]
            delay_reasoning = delay_result["reasoning"]

        confidence = decision.get("confidence")  # None for rule-based decisions

        cur = conn.execute(
            """INSERT INTO decisions
               (transaction_id, attempt_number, root_cause, classification_method,
                strategy_chosen, reasoning_string, suggested_retry_delay_hours,
                retry_delay_reasoning, classification_confidence)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (txn_id, attempt_number, decision["cause"], decision["classification_method"],
             decision["strategy"], decision["reasoning"], delay_hours, delay_reasoning, confidence),
        )
        decision_id = cur.lastrowid
        _audit(
            conn, txn_id, "system", "log_decision",
            f"Attempt {attempt_number}: strategy='{decision['strategy']}' for cause='{decision['cause']}' "
            f"(method={decision['classification_method']})",
        )
        if delay_reasoning:
            _audit(conn, txn_id, "system", "compute_adaptive_delay", delay_reasoning)

        if decision["strategy"] == "escalate_human":
            conn.execute(
                "UPDATE transactions SET status = 'needs_human', attempt_count = ? WHERE id = ?",
                (attempt_number, txn_id),
            )
            # Two distinct reasons a transaction escalates: the hard 3-attempt
            # cap, or (new) an honest low-confidence LLM classification. The
            # audit reasoning distinguishes which, rather than always
            # claiming the attempt cap.
            if confidence == "low":
                escalation_note = (
                    f"Escalated on attempt {attempt_number} due to LOW-confidence LLM "
                    "classification, not the attempt cap — see 'escalate_low_confidence' above."
                )
            else:
                escalation_note = (
                    f"Hard 3-attempt cap reached on attempt {attempt_number}; escalated to needs_human queue."
                )
            _audit(conn, txn_id, "system", "escalate_to_needs_human", escalation_note)
            return True  # terminal — commit happens on `with conn:` exit

        # Real Razorpay test-mode payment link for this attempt, falling
        # back to a clearly-disclosed mock link once the account's fixed
        # test-mode quota (30 links/business, does not reset) is hit.
        # This is a deliberate, audited deviation — never silent.
        reference_id = f"{_RUN_ID}-txn{txn_id}-attempt{attempt_number}"
        if _quota_exhausted[0]:
            link_result = mock_payment_link(reference_id)
            payment_link = link_result["short_url"]
            _link_stats["mocked"] += 1
            _audit(
                conn, txn_id, "system", "payment_link_mocked",
                f"Razorpay test-mode link quota (30/business, fixed) already exhausted this run; "
                f"used mock link {link_result['id']} for attempt {attempt_number} instead of a real one.",
            )
        else:
            try:
                link_result = create_payment_link(
                    amount=txn["amount"],
                    currency=txn["currency"],
                    customer_name=txn["customer_name"],
                    customer_phone=txn["customer_phone"],
                    description=f"Payment recovery attempt {attempt_number} ({decision['cause']})",
                    reference_id=reference_id,
                )
                payment_link = link_result["short_url"]
                _link_stats["real"] += 1
                _audit(
                    conn, txn_id, "system", "create_payment_link",
                    f"Created Razorpay test payment link {link_result['id']} for attempt {attempt_number}.",
                )
            except RazorpayQuotaExhausted as e:
                _quota_exhausted[0] = True
                _audit(
                    conn, txn_id, "system", "razorpay_quota_exhausted",
                    f"Razorpay test-mode Payment Link quota (fixed cap of 30/business) reached: {e}. "
                    "Switching to disclosed mock links for the remainder of this run.",
                )
                link_result = mock_payment_link(reference_id)
                payment_link = link_result["short_url"]
                _link_stats["mocked"] += 1
                _audit(
                    conn, txn_id, "system", "payment_link_mocked",
                    f"Used mock link {link_result['id']} for attempt {attempt_number} instead of a real one.",
                )
            except RazorpayCallError as e:
                _audit(conn, txn_id, "system", "payment_link_creation_failed", str(e))
                raise

        message_text, msg_reasoning, used_fallback = _generate_message_text(
            txn, decision, attempt_number, payment_link
        )
        if used_fallback:
            _audit(conn, txn_id, "system", "llm_fallback_used", msg_reasoning)
        else:
            _audit(conn, txn_id, "llm", "generate_message", msg_reasoning)

        conn.execute(
            """INSERT INTO messages (transaction_id, decision_id, channel, message_text, payment_link)
               VALUES (?, ?, 'whatsapp_mock', ?, ?)""",
            (txn_id, decision_id, message_text, payment_link),
        )
        _audit(
            conn, txn_id, "system", "send_message",
            f"Mock-sent WhatsApp message for attempt {attempt_number} via strategy '{decision['strategy']}'.",
        )

        conn.execute(
            "UPDATE transactions SET status = 'contacted', attempt_count = ? WHERE id = ?",
            (attempt_number, txn_id),
        )
        return False  # not terminal — message sent, awaiting a customer response


def process_transaction(conn, txn: dict, rng: random.Random):
    """
    Batch-pipeline entry point: runs a transaction through up to 3 attempts,
    pairing each process_one_attempt() with an immediately-simulated
    customer response via record_customer_response(). This is exactly the
    behavior the original single-function version had — unchanged for the
    existing seed-based batch runs (recovery.db, recovery_real.db).

    For a live, one-event-at-a-time flow (e.g. a real Razorpay webhook),
    call process_one_attempt() and record_customer_response() separately
    instead of calling this function.
    """
    txn_id = txn["id"]
    for attempt_number in (1, 2, 3):
        terminal = process_one_attempt(conn, txn, attempt_number)
        if terminal:
            return  # escalate_human path — no message was sent this attempt

        decision_row = conn.execute(
            "SELECT root_cause, strategy_chosen FROM decisions "
            "WHERE transaction_id = ? AND attempt_number = ?",
            (txn_id, attempt_number),
        ).fetchone()
        cause, strategy = decision_row[0], decision_row[1]

        response = _simulate_outcome(rng, cause, strategy, attempt_number)
        resolved = record_customer_response(conn, txn_id, attempt_number, response)
        if resolved:
            return
        # else: ignored -> loop continues to next attempt (if any remain)

    # Loop exhausted all 3 attempts without a terminal branch being hit
    # (shouldn't happen given decide() forces escalate at attempt 3, but
    # guard defensively so no transaction is silently left in 'contacted').
    with conn:
        conn.execute("UPDATE transactions SET status = 'needs_human' WHERE id = ?", (txn_id,))
        _audit(conn, txn_id, "system", "escalate_to_needs_human", "Attempt loop exhausted without terminal state; safety escalation.")


def record_customer_response(
    conn, txn_id: int, attempt_number: int, response: str, actor: str = "customer", verified_real: bool = False,
) -> bool:
    """
    Applies a customer response (paid / ignored / promise_to_pay) to a
    transaction that has just had a message sent for `attempt_number`, and
    updates status accordingly. Same function whether the response came
    from the batch pipeline's weighted simulation, a live "customer
    responded" demo button click, or a real cryptographically-verified
    Razorpay webhook — one code path either way, but the audit trail
    distinguishes which.

    `verified_real=True` is set ONLY by api.py's real /api/webhook/razorpay
    handler, after HMAC-SHA256 signature verification against the actual
    Razorpay webhook secret has already succeeded — it changes the
    audit_log action/reasoning from "simulated_response" to
    "verified_real_response" so a reviewer can tell, from the audit trail
    alone, which transactions were resolved by an actual payment
    confirmation vs. a presenter clicking a demo button. The `outcomes`
    table's `simulated_response` column name predates this distinction and
    is shared by both paths (schema-level rename would be a larger
    migration than this fix warrants) — the audit_log is the source of
    truth for "was this real."

    Returns True if this response resolved the transaction to a terminal
    state (recovered / promise_to_pay / needs_human via cap), False if it
    was 'ignored' and a further attempt is still allowed (attempt < 3).
    """
    if response not in ("paid", "ignored", "promise_to_pay"):
        raise ValueError(f"response must be one of paid/ignored/promise_to_pay, got {response!r}")

    action = "verified_real_response" if verified_real else (
        "simulated_response" if actor == "customer" else "customer_response"
    )
    prefix = "Cryptographically-verified real" if verified_real else "Customer"

    with conn:
        conn.execute(
            "INSERT INTO outcomes (transaction_id, simulated_response) VALUES (?, ?)",
            (txn_id, response),
        )
        _audit(
            conn, txn_id, actor, action,
            f"{prefix} response to attempt {attempt_number}: '{response}'.",
        )

        if response == "paid":
            conn.execute("UPDATE transactions SET status = 'recovered' WHERE id = ?", (txn_id,))
            _audit(conn, txn_id, "system", "mark_recovered", f"Transaction recovered on attempt {attempt_number}.")
            return True
        elif response == "promise_to_pay":
            conn.execute("UPDATE transactions SET status = 'promise_to_pay' WHERE id = ?", (txn_id,))
            _audit(
                conn, txn_id, "system", "hold_promise_to_pay",
                "Customer promised to pay; holding in promise_to_pay column, no auto-retry.",
            )
            return True
        # ignored -> not terminal; caller decides whether to run another
        # attempt (batch loop does so automatically up to 3; a live demo
        # can do so on the next webhook/button click instead).
        return False


def run_pipeline(db_path: Path, seed: int, limit: int | None = None):
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    rng = random.Random(seed)

    rows = conn.execute(
        "SELECT id, customer_name, customer_phone, amount, currency, razorpay_failure_code, "
        "failure_note, original_payment_method FROM transactions WHERE status = 'failed' ORDER BY id"
    ).fetchall()
    cols = ["id", "customer_name", "customer_phone", "amount", "currency",
            "razorpay_failure_code", "failure_note", "original_payment_method"]
    txns = [dict(zip(cols, row)) for row in rows]
    if limit:
        txns = txns[:limit]

    total = len(txns)
    start = time.monotonic()
    for i, txn in enumerate(txns, 1):
        elapsed = time.monotonic() - start
        print(f"[{i}/{total}] txn {txn['id']} ({txn['customer_name']}, {txn['razorpay_failure_code']}) "
              f"— {elapsed:.0f}s elapsed", flush=True)
        try:
            process_transaction(conn, txn, rng)
        except Exception as e:
            print(f"  !! FAILED txn {txn['id']}: {e}", flush=True)
            with conn:
                _audit(conn, txn["id"], "system", "pipeline_error", str(e))

    conn.close()
    print(f"\nDone. Processed {total} transactions in {time.monotonic() - start:.0f}s.")
    print(
        f"Payment links: {_link_stats['real']} real (Razorpay test-mode API) + "
        f"{_link_stats['mocked']} mocked (quota exhausted mid-run, see audit_log "
        f"action='payment_link_mocked' / 'razorpay_quota_exhausted' for exact rows)."
    )


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Run the full recovery pipeline")
    parser.add_argument("--db", type=str, default=str(DEFAULT_DB_PATH))
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--limit", type=int, default=None, help="only process first N transactions (for testing)")
    args = parser.parse_args()
    run_pipeline(Path(args.db), args.seed, args.limit)


if __name__ == "__main__":
    main()
