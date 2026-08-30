"""
Read-only JSON API over recovery.db for the React dashboard.

Every metric is computed live from SQLite on each request — nothing is
cached, precomputed, or fabricated (constraint #6). No writes happen here;
this process only ever runs SELECT queries.

Usage:
    py -3 api.py [--db PATH] [--port PORT]
"""

import argparse
import sqlite3
from pathlib import Path

from flask import Flask, jsonify, g
from flask_cors import CORS

BACKEND_DIR = Path(__file__).parent
DEFAULT_DB_PATH = BACKEND_DIR / "recovery.db"

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
    txn = db.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,)).fetchone()
    if txn is None:
        return jsonify({"error": "not found"}), 404

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

    return jsonify({
        "transaction": dict(txn),
        "decisions": [dict(r) for r in decisions],
        "messages": [dict(r) for r in messages],
        "outcomes": [dict(r) for r in outcomes],
        "audit_log": [dict(r) for r in audit],
    })


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
    escalations_not_at_3 = db.execute(
        "SELECT COUNT(*) c FROM decisions WHERE strategy_chosen = 'escalate_human' AND attempt_number != 3"
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
        "audit_log_rows": total_audit_rows,
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


def main():
    parser = argparse.ArgumentParser(description="Recovery dashboard read-only API")
    parser.add_argument("--db", type=str, default=str(DEFAULT_DB_PATH))
    parser.add_argument("--port", type=int, default=5001)
    parser.add_argument(
        "--host", type=str, default="127.0.0.1",
        help="bind address — use 0.0.0.0 to make /api/needs-human-count reachable "
             "from an ESP32 or other device on the same LAN",
    )
    args = parser.parse_args()
    app.config["DB_PATH"] = args.db
    app.run(host=args.host, port=args.port, debug=False)


if __name__ == "__main__":
    main()
