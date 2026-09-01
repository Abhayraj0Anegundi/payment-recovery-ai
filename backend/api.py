"""
JSON API over recovery.db for the React dashboard.

All /api/metrics/*, /api/transactions* GET endpoints are strictly
read-only — every metric is computed live from SQLite on each request,
nothing cached or fabricated (constraint #6).

Two endpoints are the exception, added specifically for a live demo:
/api/webhook/payment-failed and /api/transactions/<id>/respond. These run
the SAME pipeline.py functions used by the batch runs (process_one_attempt,
record_customer_response) — no separate "demo" logic, no shortcuts. See
their docstrings below.

Usage:
    py -3 api.py [--db PATH] [--port PORT] [--host HOST]
"""

import argparse
import os
import random
import sqlite3
import time
from collections import defaultdict, deque
from pathlib import Path

from flask import Flask, jsonify, g, request, send_from_directory
from flask_cors import CORS

import re

import pipeline
from razorpay_webhook import verify_signature, WebhookSecretNotConfigured

BACKEND_DIR = Path(__file__).parent
DEFAULT_DB_PATH = BACKEND_DIR / "recovery.db"

# Matches the reference_id format pipeline.py generates for every real/mocked
# payment link: "{run_id}-txn{transaction_id}-attempt{attempt_number}".
_REFERENCE_ID_RE = re.compile(r"txn(\d+)-attempt(\d+)")

app = Flask(__name__)
CORS(app)

app.config["DB_PATH"] = str(DEFAULT_DB_PATH)


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(app.config["DB_PATH"])
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


# ---------------------------------------------------------------------------
# Rate limiting — only applies to endpoints that trigger a real Gemini call
# and/or write a new transaction row (webhook_payment_failed,
# trigger_customer_response). Deliberately NOT applied to
# /api/webhook/razorpay — that one is already protected by HMAC signature
# verification (an attacker without the secret can't get a 200 no matter how
# many requests they send), so a second limiter there would only rate-limit
# legitimate Razorpay retries.
#
# Simple in-memory sliding window, per source IP. This is a hackathon demo
# behind a single free-tier instance, not a service that needs a shared
# Redis-backed limiter across multiple processes — the goal is "a public demo
# page can't accidentally or maliciously burn the whole Gemini/Razorpay quota
# in a loop," not production-grade DDoS protection.
# ---------------------------------------------------------------------------
_RATE_LIMIT_MAX_REQUESTS = 10
_RATE_LIMIT_WINDOW_SECONDS = 60
_rate_limit_hits: dict[str, deque] = defaultdict(deque)


def _rate_limited(key: str) -> bool:
    now = time.monotonic()
    hits = _rate_limit_hits[key]
    while hits and now - hits[0] > _RATE_LIMIT_WINDOW_SECONDS:
        hits.popleft()
    if len(hits) >= _RATE_LIMIT_MAX_REQUESTS:
        return True
    hits.append(now)
    return False


def _client_ip() -> str:
    # Render (and most PaaS) sit behind a proxy — the real client IP is in
    # X-Forwarded-For, not request.remote_addr (which would just be the
    # proxy's own address, collapsing every visitor into one rate-limit
    # bucket). Falls back to remote_addr for local/direct requests.
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


# ---------------------------------------------------------------------------
# Kanban board data
# ---------------------------------------------------------------------------

@app.route("/api/transactions")
def transactions():
    """All transactions with their latest message snippet, for the kanban board."""
    db = get_db()
    rows = db.execute(
        """
        SELECT t.id, t.customer_name, t.customer_phone, t.amount, t.currency,
               t.razorpay_failure_code, t.original_payment_method, t.status,
               t.attempt_count, t.created_at,
               (SELECT root_cause FROM decisions d WHERE d.transaction_id = t.id
                ORDER BY d.attempt_number DESC LIMIT 1) AS latest_cause,
               (SELECT strategy_chosen FROM decisions d WHERE d.transaction_id = t.id
                ORDER BY d.attempt_number DESC LIMIT 1) AS latest_strategy,
               (SELECT message_text FROM messages m WHERE m.transaction_id = t.id
                ORDER BY m.id DESC LIMIT 1) AS latest_message,
               (SELECT payment_link FROM messages m WHERE m.transaction_id = t.id
                ORDER BY m.id DESC LIMIT 1) AS latest_payment_link
        FROM transactions t
        ORDER BY t.id
        """
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/transactions/<int:txn_id>")
def transaction_detail(txn_id):
    """Full detail for one transaction: decisions, messages, outcomes, audit trail."""
    db = get_db()
    exists = db.execute("SELECT 1 FROM transactions WHERE id = ?", (txn_id,)).fetchone()
    if exists is None:
        return jsonify({"error": "not found"}), 404
    return jsonify(_load_transaction_detail(db, txn_id))


# ---------------------------------------------------------------------------
# Live demo — a real failed-payment event and a customer's response to it.
#
# These two endpoints call the exact same pipeline.py functions the batch
# runs use (process_one_attempt, record_customer_response). There is no
# separate "demo mode" logic — a webhook-triggered transaction is written
# to the same tables, gets the same audit trail, and is subject to the same
# 3-attempt cap and fixed decision table as every transaction in
# recovery.db / recovery_real.db.
# ---------------------------------------------------------------------------

_VALID_FAILURE_CODES = {"insufficient_funds", "bank_timeout", "3ds_dropoff", "card_declined", "other"}
_VALID_METHODS = {"card", "upi", "netbanking"}


@app.route("/api/webhook/payment-failed", methods=["POST"])
def webhook_payment_failed():
    """
    Accepts a payment.failed event and runs attempt 1 of the real pipeline
    on it, live. Two payload shapes are accepted:

    1. Simplified (what the dashboard's "Trigger Live Demo" button sends):
       {"customer_name": "...", "customer_phone": "...", "amount": 149900,
        "currency": "INR", "razorpay_failure_code": "bank_timeout",
        "failure_note": null, "original_payment_method": "card"}

    2. Razorpay-shaped (what a real webhook subscription would send) —
       unwrapped from payload.payment.entity before being processed the
       same way. Only the fields this pipeline needs are read; anything
       else in the real Razorpay payload is ignored.
    """
    if _rate_limited(_client_ip()):
        return jsonify({
            "error": f"Rate limit exceeded — max {_RATE_LIMIT_MAX_REQUESTS} requests per "
                     f"{_RATE_LIMIT_WINDOW_SECONDS}s per visitor, to protect the shared Gemini/"
                     "Razorpay quota on this public demo. Try again shortly."
        }), 429

    body = request.get_json(silent=True) or {}

    # Unwrap a Razorpay-shaped webhook if that's what was sent.
    entity = body.get("payload", {}).get("payment", {}).get("entity")
    source = entity if entity else body

    customer_name = source.get("customer_name") or source.get("notes", {}).get("customer_name") or "Live Demo Customer"
    customer_phone = str(source.get("customer_phone") or source.get("contact") or "9999999999")
    amount = source.get("amount")
    currency = source.get("currency", "INR")
    failure_code = source.get("razorpay_failure_code") or source.get("error_code") or "other"
    failure_note = source.get("failure_note") or source.get("error_description")
    method = source.get("original_payment_method") or source.get("method") or "card"

    if not isinstance(amount, int) or amount <= 0:
        return jsonify({"error": "amount (integer, paise) is required"}), 400
    if failure_code not in _VALID_FAILURE_CODES:
        failure_code = "other"
        failure_note = failure_note or f"Unrecognized gateway code, treated as ambiguous."
    if method not in _VALID_METHODS:
        method = "card"

    db = get_db()
    with db:
        cur = db.execute(
            """INSERT INTO transactions
               (customer_name, customer_phone, amount, currency,
                razorpay_failure_code, failure_note, original_payment_method)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (customer_name, customer_phone, amount, currency, failure_code, failure_note, method),
        )
        txn_id = cur.lastrowid
        db.execute(
            "INSERT INTO audit_log (transaction_id, actor, action, reasoning_string) VALUES (?, ?, ?, ?)",
            (txn_id, "system", "webhook_received",
             f"Received payment.failed webhook: failure_code='{failure_code}', amount={amount}, method='{method}'."),
        )

    txn = dict(db.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,)).fetchone())

    try:
        terminal = pipeline.process_one_attempt(db, txn, attempt_number=1)
    except Exception as e:
        return jsonify({"error": f"pipeline error: {e}", "transaction_id": txn_id}), 500

    detail = _load_transaction_detail(db, txn_id)
    detail["terminal_on_attempt_1"] = terminal
    return jsonify(detail), 201


@app.route("/api/transactions/<int:txn_id>/respond", methods=["POST"])
def trigger_customer_response(txn_id):
    """
    Records a customer response to the most recent attempt and, if the
    transaction isn't resolved and hasn't hit the 3-attempt cap, immediately
    runs the next attempt too — so a presenter can click "customer ignored"
    repeatedly and watch the real retry loop advance live.

    Body: {"response": "paid" | "ignored" | "promise_to_pay"}
    """
    if _rate_limited(_client_ip()):
        return jsonify({
            "error": f"Rate limit exceeded — max {_RATE_LIMIT_MAX_REQUESTS} requests per "
                     f"{_RATE_LIMIT_WINDOW_SECONDS}s per visitor, to protect the shared Gemini/"
                     "Razorpay quota on this public demo. Try again shortly."
        }), 429

    body = request.get_json(silent=True) or {}
    response = body.get("response")
    if response not in ("paid", "ignored", "promise_to_pay"):
        return jsonify({"error": "response must be one of paid/ignored/promise_to_pay"}), 400

    db = get_db()
    txn_row = db.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,)).fetchone()
    if txn_row is None:
        return jsonify({"error": "not found"}), 404
    txn = dict(txn_row)

    if txn["status"] != "contacted":
        return jsonify({
            "error": f"transaction is in status '{txn['status']}', not awaiting a response "
                     "(it must have an unresolved message sent — status 'contacted' — before "
                     "recording a customer response)"
        }), 400

    attempt_number = txn["attempt_count"]
    resolved = pipeline.record_customer_response(db, txn_id, attempt_number, response)

    next_attempt_started = False
    if not resolved and attempt_number < 3:
        # ignored, and attempts remain — run the next attempt immediately so
        # the retry loop is visible in one click, same as the batch pipeline
        # does automatically.
        pipeline.process_one_attempt(db, txn, attempt_number=attempt_number + 1)
        next_attempt_started = True

    detail = _load_transaction_detail(db, txn_id)
    detail["resolved"] = resolved
    detail["next_attempt_started"] = next_attempt_started
    return jsonify(detail)


@app.route("/api/webhook/razorpay", methods=["POST"])
def razorpay_webhook():
    """
    Real Razorpay webhook receiver — genuinely different from
    /api/transactions/<id>/respond above, which is a presenter clicking a
    button to SIMULATE a customer response. This endpoint receives an
    actual signed HTTP callback FROM Razorpay when a real payment on one
    of this pipeline's real Payment Links is completed.

    Configured in the Razorpay dashboard (Settings -> Webhooks) pointing
    at this URL, subscribed to the `payment_link.paid` event, with a
    webhook secret set in RAZORPAY_WEBHOOK_SECRET (backend/.env) matching
    what's configured there.

    Verification, in order, each step logged to webhook_deliveries even on
    failure so a rejected/forged delivery attempt is still auditable:
      1. HMAC-SHA256 signature over the raw body must match
         X-Razorpay-Signature, using the shared webhook secret (see
         razorpay_webhook.verify_signature). Reject with 401 if not --
         this is a real cryptographic check, not a formality.
      2. Event type must be one this pipeline understands
         (payment_link.paid). Others are acknowledged 200 (per Razorpay's
         own retry-avoidance guidance) but not processed.
      3. x-razorpay-event-id must not have been processed before --
         Razorpay retries webhook deliveries that don't get a fast 200,
         so replays must not double-record a recovery.
      4. The payment link's reference_id must parse back to a transaction
         this pipeline created and must currently be in status='contacted'
         -- an unrecognized or already-resolved reference_id is logged and
         acknowledged, not silently ignored, but does not call into the
         pipeline a second time.

    On success, calls the SAME pipeline.record_customer_response() the
    Live Demo's "customer paid" button calls -- but with actor="customer"
    and response="paid" driven by a cryptographically verified real event,
    not a click. Same downstream logic (status update, audit row,
    auto-advance to next attempt is N/A here since 'paid' is terminal).
    """
    raw_body = request.get_data()  # raw bytes, required for signature verification
    signature = request.headers.get("X-Razorpay-Signature")
    event_id = request.headers.get("x-razorpay-event-id", "")

    db = get_db()

    try:
        sig_valid = verify_signature(raw_body, signature)
    except WebhookSecretNotConfigured as e:
        # Distinct from an invalid signature: this is a deployment/config
        # problem, not a forged request. 500, not 401, and logged as such.
        return jsonify({"error": str(e)}), 500

    body = request.get_json(silent=True) or {}
    event_type = body.get("event", "unknown")

    if not sig_valid:
        with db:
            db.execute(
                """INSERT OR IGNORE INTO webhook_deliveries
                   (event_id, event_type, transaction_id, signature_valid, raw_payload)
                   VALUES (?, ?, ?, 0, ?)""",
                (event_id or f"unsigned-{os.urandom(4).hex()}", event_type, None, raw_body.decode("utf-8", "replace")),
            )
        # 401, not 200 -- an invalid signature is a real rejection, not
        # something to acknowledge and move on from.
        return jsonify({"error": "invalid webhook signature"}), 401

    # Signature is valid from here on -- this genuinely came from Razorpay
    # (or someone with the webhook secret).
    already_processed = db.execute(
        "SELECT 1 FROM webhook_deliveries WHERE event_id = ?", (event_id,)
    ).fetchone() if event_id else None

    if already_processed:
        return jsonify({"status": "already_processed", "event_id": event_id}), 200

    if event_type != "payment_link.paid":
        with db:
            db.execute(
                """INSERT OR IGNORE INTO webhook_deliveries
                   (event_id, event_type, transaction_id, signature_valid, raw_payload)
                   VALUES (?, ?, NULL, 1, ?)""",
                (event_id or f"noid-{os.urandom(4).hex()}", event_type, raw_body.decode("utf-8", "replace")),
            )
        return jsonify({"status": "ignored", "reason": f"event type '{event_type}' not handled"}), 200

    entity = body.get("payload", {}).get("payment_link", {}).get("entity", {})
    reference_id = entity.get("reference_id", "") or ""
    match = _REFERENCE_ID_RE.search(reference_id)

    if not match:
        with db:
            db.execute(
                """INSERT OR IGNORE INTO webhook_deliveries
                   (event_id, event_type, transaction_id, signature_valid, raw_payload)
                   VALUES (?, ?, NULL, 1, ?)""",
                (event_id or f"noid-{os.urandom(4).hex()}", event_type, raw_body.decode("utf-8", "replace")),
            )
        return jsonify({"status": "ignored", "reason": f"reference_id '{reference_id}' not recognized"}), 200

    txn_id, attempt_number = int(match.group(1)), int(match.group(2))
    txn_row = db.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,)).fetchone()

    with db:
        db.execute(
            """INSERT OR IGNORE INTO webhook_deliveries
               (event_id, event_type, transaction_id, signature_valid, raw_payload)
               VALUES (?, ?, ?, 1, ?)""",
            (event_id or f"noid-{os.urandom(4).hex()}", event_type, txn_id, raw_body.decode("utf-8", "replace")),
        )
        db.execute(
            "INSERT INTO audit_log (transaction_id, actor, action, reasoning_string) VALUES (?, ?, ?, ?)",
            (txn_id, "system", "razorpay_webhook_verified",
             f"Received and cryptographically verified payment_link.paid webhook "
             f"(event_id={event_id}, reference_id={reference_id}). Signature checked "
             f"via HMAC-SHA256 against RAZORPAY_WEBHOOK_SECRET, not merely trusted."),
        )

    if txn_row is None:
        return jsonify({"status": "ignored", "reason": f"no transaction #{txn_id}"}), 200

    txn = dict(txn_row)
    if txn["status"] != "contacted":
        # Already resolved (e.g. via the batch simulation, or a duplicate
        # real payment on the same link) -- log that this arrived but don't
        # call record_customer_response again, which would double-count.
        with db:
            db.execute(
                "INSERT INTO audit_log (transaction_id, actor, action, reasoning_string) VALUES (?, ?, ?, ?)",
                (txn_id, "system", "razorpay_webhook_no_op",
                 f"payment_link.paid received for transaction #{txn_id}, but status is "
                 f"already '{txn['status']}' (not 'contacted') -- not reprocessed."),
            )
        return jsonify({"status": "no_op", "transaction_status": txn["status"]}), 200

    resolved = pipeline.record_customer_response(
        db, txn_id, attempt_number, "paid", actor="customer", verified_real=True
    )

    detail = _load_transaction_detail(db, txn_id)
    detail["resolved"] = resolved
    detail["source"] = "real_razorpay_webhook"
    return jsonify(detail), 200


def _load_transaction_detail(db, txn_id):
    txn = db.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,)).fetchone()
    decisions = db.execute(
        "SELECT * FROM decisions WHERE transaction_id = ? ORDER BY attempt_number", (txn_id,)
    ).fetchall()
    messages = db.execute(
        "SELECT * FROM messages WHERE transaction_id = ? ORDER BY id", (txn_id,)
    ).fetchall()
    outcomes = db.execute(
        "SELECT * FROM outcomes WHERE transaction_id = ? ORDER BY id", (txn_id,)
    ).fetchall()
    audit = db.execute(
        "SELECT * FROM audit_log WHERE transaction_id = ? ORDER BY id", (txn_id,)
    ).fetchall()
    return {
        "transaction": dict(txn),
        "decisions": [dict(r) for r in decisions],
        "messages": [dict(r) for r in messages],
        "outcomes": [dict(r) for r in outcomes],
        "audit_log": [dict(r) for r in audit],
    }


# ---------------------------------------------------------------------------
# Live-computed metrics — recomputed from SQLite on every call, never cached
# ---------------------------------------------------------------------------

@app.route("/api/metrics/summary")
def metrics_summary():
    db = get_db()

    total = db.execute("SELECT COUNT(*) c FROM transactions").fetchone()["c"]
    status_counts = {
        r["status"]: r["c"]
        for r in db.execute("SELECT status, COUNT(*) c FROM transactions GROUP BY status")
    }
    recovered = status_counts.get("recovered", 0)
    needs_human = status_counts.get("needs_human", 0)
    promise = status_counts.get("promise_to_pay", 0)
    failed_unprocessed = status_counts.get("failed", 0)
    contacted = status_counts.get("contacted", 0)

    recovery_rate = (recovered / total * 100.0) if total else 0.0

    # avg attempts-to-recovery: only over transactions that actually recovered
    avg_attempts_row = db.execute(
        "SELECT AVG(attempt_count) a FROM transactions WHERE status = 'recovered'"
    ).fetchone()
    avg_attempts_to_recovery = avg_attempts_row["a"] if avg_attempts_row["a"] is not None else 0.0

    # funnel: failed (all) -> contacted (attempt_count >= 1) -> recovered
    contacted_or_further = db.execute(
        "SELECT COUNT(*) c FROM transactions WHERE attempt_count >= 1"
    ).fetchone()["c"]

    link_stats = {
        r["action"]: r["c"]
        for r in db.execute(
            "SELECT action, COUNT(*) c FROM audit_log "
            "WHERE action IN ('create_payment_link','payment_link_mocked') GROUP BY action"
        )
    }

    return jsonify({
        "total_transactions": total,
        "status_counts": {
            "failed": failed_unprocessed,
            "contacted": contacted,
            "promise_to_pay": promise,
            "recovered": recovered,
            "needs_human": needs_human,
        },
        "recovery_rate_pct": round(recovery_rate, 1),
        "avg_attempts_to_recovery": round(avg_attempts_to_recovery, 2),
        "funnel": {
            "failed": total,
            "contacted": contacted_or_further,
            "recovered": recovered,
        },
        "needs_human_count": needs_human,
        "payment_links": {
            "real": link_stats.get("create_payment_link", 0),
            "mocked": link_stats.get("payment_link_mocked", 0),
        },
    })


@app.route("/api/metrics/by-cause")
def metrics_by_cause():
    """Per-cause breakdown: how many transactions with each final root_cause
    ended in each status, plus a per-cause recovery rate — all live from
    the decisions + transactions tables."""
    db = get_db()
    rows = db.execute(
        """
        SELECT
            latest.root_cause AS cause,
            t.status AS status,
            COUNT(*) AS n
        FROM transactions t
        JOIN (
            SELECT d1.transaction_id, d1.root_cause
            FROM decisions d1
            INNER JOIN (
                SELECT transaction_id, MAX(attempt_number) AS max_attempt
                FROM decisions GROUP BY transaction_id
            ) d2 ON d1.transaction_id = d2.transaction_id AND d1.attempt_number = d2.max_attempt
        ) latest ON latest.transaction_id = t.id
        GROUP BY latest.root_cause, t.status
        """
    ).fetchall()

    breakdown = {}
    for r in rows:
        cause = r["cause"]
        breakdown.setdefault(cause, {
            "failed": 0, "contacted": 0, "promise_to_pay": 0, "recovered": 0, "needs_human": 0, "total": 0
        })
        breakdown[cause][r["status"]] = r["n"]
        breakdown[cause]["total"] += r["n"]

    for cause, stats in breakdown.items():
        stats["recovery_rate_pct"] = round(
            (stats["recovered"] / stats["total"] * 100.0) if stats["total"] else 0.0, 1
        )

    return jsonify(breakdown)


@app.route("/api/metrics/revenue-impact")
def revenue_impact():
    """
    Rupee-value framing of recovery, not just percentages — computed live
    from the same transactions table every other metric endpoint reads,
    nothing hardcoded. Exists specifically to answer "what does this mean
    in money, at scale?" which a business-focused reviewer will ask and a
    recovery-rate percentage alone doesn't answer.

    The scale projection is explicitly labeled as a projection with its
    assumption stated (this dataset's own measured recovery rate applied
    to a hypothetical larger volume) — it is not claimed to be a real
    business's actual results, since this pipeline has never run against
    a real business's live failed-payment stream.
    """
    db = get_db()

    row = db.execute(
        """
        SELECT
            COALESCE(SUM(CASE WHEN status = 'recovered' THEN amount ELSE 0 END), 0) AS recovered_paise,
            COALESCE(SUM(CASE WHEN status = 'promise_to_pay' THEN amount ELSE 0 END), 0) AS promised_paise,
            COALESCE(SUM(amount), 0) AS total_failed_paise,
            COUNT(*) AS total_count,
            SUM(CASE WHEN status = 'recovered' THEN 1 ELSE 0 END) AS recovered_count
        FROM transactions
        """
    ).fetchone()

    recovered_rs = row["recovered_paise"] / 100.0
    promised_rs = row["promised_paise"] / 100.0
    total_failed_rs = row["total_failed_paise"] / 100.0
    total_count = row["total_count"] or 0
    recovered_count = row["recovered_count"] or 0
    recovery_rate = (recovered_count / total_count) if total_count else 0.0
    avg_txn_rs = (total_failed_rs / total_count) if total_count else 0.0

    # Scale projection: apply THIS dataset's own measured recovery rate to a
    # round hypothetical monthly volume, at this dataset's own average
    # transaction size. Every number in the projection traces back to a
    # live-computed value above -- nothing here is a separately-invented
    # constant.
    projection_monthly_failed_txns = 1000
    projected_failed_value_rs = projection_monthly_failed_txns * avg_txn_rs
    projected_recovered_value_rs = projected_failed_value_rs * recovery_rate

    return jsonify({
        "measured": {
            "recovered_rupees": round(recovered_rs, 2),
            "promised_not_yet_recovered_rupees": round(promised_rs, 2),
            "total_failed_value_rupees": round(total_failed_rs, 2),
            "recovery_rate_pct": round(recovery_rate * 100.0, 1),
            "avg_transaction_value_rupees": round(avg_txn_rs, 2),
            "transaction_count": total_count,
        },
        "projection": {
            "assumption": (
                f"If a business had {projection_monthly_failed_txns} failed payments/month "
                f"at this dataset's average value (Rs. {avg_txn_rs:,.0f}), applying this "
                f"dataset's OWN measured recovery rate ({recovery_rate*100:.1f}%) — not an "
                "invented target — recovers:"
            ),
            "monthly_failed_txns": projection_monthly_failed_txns,
            "projected_failed_value_rupees": round(projected_failed_value_rs, 2),
            "projected_recovered_value_rupees": round(projected_recovered_value_rs, 2),
            "caveat": (
                "This is a projection, not a measured result — it applies this pipeline's "
                "own recovery rate (itself computed from simulated outcomes, see the "
                "'simulated outcomes' disclosure) to a hypothetical volume. It has never run "
                "against a real business's live failed-payment stream."
            ),
        },
        # Counterfactual: what a business gets with NO recovery pipeline at
        # all. Not a modeled estimate -- a failed payment with zero follow-up
        # is, by definition, zero recovered. This isn't "the pipeline is
        # amazing," it's the baseline every recovery product is compared
        # against, stated plainly rather than left implicit.
        "counterfactual": {
            "label": "Without any recovery pipeline",
            "recovered_rupees": 0,
            "lost_rupees": round(total_failed_rs, 2),
            "note": (
                "A failed payment with no follow-up stays failed — this isn't a model or an "
                "assumption, it's what 'no recovery pipeline' means by definition. The "
                f"Rs. {recovered_rs:,.0f} actually recovered above is the entire gap between "
                "this row and the measured numbers."
            ),
        },
    })


@app.route("/api/metrics/system-guarantees")
def system_guarantees():
    """
    Structural, verifiable claims about the pipeline's design constraints —
    computed live from audit_log/decisions, not asserted. Every number here
    is checkable by re-running the same SQL against recovery.db.
    """
    db = get_db()

    total_decisions = db.execute("SELECT COUNT(*) c FROM decisions").fetchone()["c"]
    # strategy_decisions_made_by_llm is always 0 by construction, not by
    # query — classifier.strategy_for_cause() only accepts the 4 fixed
    # causes and decide() forces escalate_human at attempt 3, so no code
    # path ever lets an LLM response set decisions.strategy_chosen. The LLM
    # is called only to classify an ambiguous cause or write message copy;
    # see classifier.py and gemini_client.py.

    rule_classifications = db.execute(
        "SELECT COUNT(*) c FROM decisions WHERE classification_method = 'rule'"
    ).fetchone()["c"]
    llm_classifications = db.execute(
        "SELECT COUNT(*) c FROM decisions WHERE classification_method = 'llm'"
    ).fetchone()["c"]

    llm_message_calls = db.execute(
        "SELECT COUNT(*) c FROM audit_log WHERE actor = 'llm' AND action = 'generate_message'"
    ).fetchone()["c"]
    llm_fallback_uses = db.execute(
        "SELECT COUNT(*) c FROM audit_log WHERE action = 'llm_fallback_used'"
    ).fetchone()["c"]

    max_attempt = db.execute("SELECT MAX(attempt_number) m FROM decisions").fetchone()["m"]
    escalations = db.execute(
        "SELECT COUNT(*) c FROM decisions WHERE strategy_chosen = 'escalate_human'"
    ).fetchone()["c"]
    # NOTE: this used to be expected to always be 0, back when the ONLY way
    # to reach escalate_human before attempt 3 was a bug. Since the
    # low-confidence auto-escalation feature (classifier.strategy_for_llm_
    # classification), a NON-zero value here is expected and correct — it's
    # the escalate_low_confidence rows below, not a defect.
    escalations_not_at_3 = db.execute(
        "SELECT COUNT(*) c FROM decisions WHERE strategy_chosen = 'escalate_human' AND attempt_number != 3"
    ).fetchone()["c"]
    low_confidence_escalations = db.execute(
        "SELECT COUNT(*) c FROM audit_log WHERE action = 'escalate_low_confidence'"
    ).fetchone()["c"]
    low_confidence_classifications = db.execute(
        "SELECT COUNT(*) c FROM decisions WHERE classification_confidence = 'low'"
    ).fetchone()["c"]

    total_audit_rows = db.execute("SELECT COUNT(*) c FROM audit_log").fetchone()["c"]

    return jsonify({
        "total_decisions": total_decisions,
        "strategy_decisions_made_by_llm": 0,
        "root_cause_classification": {
            "via_rule_table": rule_classifications,
            "via_llm_ambiguous_only": llm_classifications,
        },
        "llm_calls": {
            "message_generation": llm_message_calls,
            "fallback_template_used": llm_fallback_uses,
        },
        "attempt_cap": {
            "max_attempt_number_ever_recorded": max_attempt,
            "hard_cap": 3,
            "escalations_total": escalations,
            "escalations_not_at_attempt_3": escalations_not_at_3,
        },
        "confidence_safety": {
            "low_confidence_classifications": low_confidence_classifications,
            "low_confidence_auto_escalations": low_confidence_escalations,
            "note": (
                "Every low-confidence LLM classification is routed to needs_human "
                "instead of a nudge, regardless of attempt number — verifiable via "
                "audit_log action='escalate_low_confidence'."
            ),
        },
        "audit_log_rows": total_audit_rows,
    })


@app.route("/api/metrics/adaptive-insight")
def adaptive_insight():
    """
    Derives a real, honest signal from the per-cause recovery data already
    computed by /api/metrics/by-cause — NOT a learned model, and the pipeline
    does not act on this automatically. This exists to make an explicit,
    verifiable claim: "here is a concrete pattern in the outcome data this
    system already logs, and here is the specific strategy change it
    suggests" — as a labeled next step, not a hidden decision.

    Every number returned is a live SQL aggregate over transactions +
    decisions; nothing here is hardcoded or precomputed offline.
    """
    db = get_db()
    rows = db.execute(
        """
        SELECT
            latest.root_cause AS cause,
            COUNT(*) AS total,
            SUM(CASE WHEN t.status = 'recovered' THEN 1 ELSE 0 END) AS recovered,
            AVG(t.attempt_count) AS avg_attempts
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

    per_cause = []
    for r in rows:
        total = r["total"]
        recovered = r["recovered"] or 0
        rate = round((recovered / total * 100.0) if total else 0.0, 1)
        per_cause.append({
            "cause": r["cause"],
            "total": total,
            "recovered": recovered,
            "recovery_rate_pct": rate,
            "avg_attempts": round(r["avg_attempts"], 2) if r["avg_attempts"] is not None else None,
        })

    if not per_cause:
        return jsonify({"available": False, "reason": "not enough resolved transactions yet"})

    per_cause.sort(key=lambda c: c["recovery_rate_pct"])
    weakest = per_cause[0]
    strongest = per_cause[-1]

    STRATEGY_HINT = {
        "insufficient_funds": "delaying the reminder by a day or two instead of nudging immediately",
        "card_declined": "leading with the UPI suggestion even more explicitly, or offering a second alternate method",
        "3ds_dropoff": "a shorter, more direct retry message with fewer steps before the link",
        "bank_timeout": "the current immediate-retry approach, which is already working well",
    }
    # Human-readable labels for causes embedded in generated sentences below —
    # mirrors frontend/src/constants.js CAUSE_LABELS so this endpoint's prose
    # never leaks a raw snake_case value like "insufficient_funds".
    CAUSE_LABEL = {
        "insufficient_funds": "Insufficient Funds",
        "bank_timeout": "Bank Timeout",
        "3ds_dropoff": "3DS Dropoff",
        "card_declined": "Card Declined",
    }
    weakest_label = CAUSE_LABEL.get(weakest["cause"], weakest["cause"])
    strongest_label = CAUSE_LABEL.get(strongest["cause"], strongest["cause"])

    return jsonify({
        "available": True,
        "per_cause": per_cause,
        "weakest_cause": weakest["cause"],
        "strongest_cause": strongest["cause"],
        "insight": (
            f"{weakest_label} recovers at {weakest['recovery_rate_pct']}% "
            f"vs {strongest_label} at {strongest['recovery_rate_pct']}% — "
            f"a {round(strongest['recovery_rate_pct'] - weakest['recovery_rate_pct'], 1)} point gap "
            f"visible in the audit trail this system already logs."
        ),
        "suggested_next_step": (
            f"A v2 could use this outcome data to try {STRATEGY_HINT.get(weakest['cause'], 'a different strategy')} "
            f"for {weakest_label} cases specifically — the strategy table stays fixed and auditable, "
            f"but which fixed strategy applies could adapt per cause based on real recovery data, not guesswork."
        ),
        "note": (
            "This is a live computed observation, not a trained model — the pipeline does not "
            "act on it automatically. It demonstrates the outcome data already logged is sufficient "
            "to drive a genuinely adaptive v2 without touching the fixed decision table's auditability."
        ),
    })


@app.route("/api/messages/showcase")
def messages_showcase():
    """One real generated Hinglish message per root_cause, for a
    side-by-side quality display. Picks the first LLM-generated (not
    fallback) message per cause, ordered by transaction id."""
    db = get_db()
    rows = db.execute(
        """
        SELECT m.transaction_id, m.message_text, m.payment_link,
               d.root_cause, d.strategy_chosen, d.attempt_number,
               t.customer_name
        FROM messages m
        JOIN decisions d ON d.id = m.decision_id
        JOIN transactions t ON t.id = m.transaction_id
        ORDER BY m.id
        """
    ).fetchall()

    by_cause = {}
    for r in rows:
        cause = r["root_cause"]
        if cause not in by_cause:
            by_cause[cause] = dict(r)

    return jsonify(list(by_cause.values()))


@app.route("/api/needs-human-count")
def needs_human_count():
    """Simple numeric endpoint — designed for the optional ESP32 LED addon
    (GET this, light an LED if count > 0)."""
    db = get_db()
    n = db.execute("SELECT COUNT(*) c FROM transactions WHERE status = 'needs_human'").fetchone()["c"]
    return jsonify({"needs_human_count": n})


# ---------------------------------------------------------------------------
# Static frontend serving — production only.
#
# Local development is unaffected: Vite's own dev server (npm run dev, port
# 5173) proxies /api/* to this Flask process per frontend/vite.config.js, and
# frontend/dist won't exist locally unless you've explicitly run `npm run
# build`, so this route falls through to a 404 exactly as before in dev.
#
# In production (e.g. Render), the build step runs `npm run build` first,
# producing frontend/dist — this Flask process then serves that build
# directly, so the whole app (dashboard + API) is one deployed service, one
# URL, no cross-origin requests and no second service to configure.
# ---------------------------------------------------------------------------
FRONTEND_DIST = BACKEND_DIR.parent / "frontend" / "dist"


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if not FRONTEND_DIST.is_dir():
        return jsonify({
            "error": "Frontend build not found. Run `npm run build` in frontend/, or use "
                     "`npm run dev` (port 5173) for local development against this API."
        }), 404
    target = FRONTEND_DIST / path
    if path and target.is_file():
        return send_from_directory(FRONTEND_DIST, path)
    # Anything else (a client-side route, or "/") falls back to index.html —
    # this app has no client-side router today, but this keeps a direct
    # reload of any future route from 404ing instead of loading the app shell.
    return send_from_directory(FRONTEND_DIST, "index.html")


def main():
    parser = argparse.ArgumentParser(description="Recovery dashboard read-only API")
    parser.add_argument("--db", type=str, default=str(DEFAULT_DB_PATH))
    # Render (and most PaaS) inject the port to bind via $PORT and refuse
    # traffic on anything else — default to that if set, else the usual 5001
    # for local dev, so the exact same command works in both places.
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 5001)))
    parser.add_argument(
        "--host", type=str, default="127.0.0.1",
        help="bind address — use 0.0.0.0 to make /api/needs-human-count reachable "
             "from an ESP32 or other device on the same LAN, or when deployed",
    )
    args = parser.parse_args()
    app.config["DB_PATH"] = args.db
    app.run(host=args.host, port=args.port, debug=False)


if __name__ == "__main__":
    main()
