-- Hinglish Payment Recovery Agent — SQLite schema
-- Single source of truth for the audit-first pipeline. Nothing is ever deleted.

CREATE TABLE transactions (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name           TEXT NOT NULL,
    customer_phone          TEXT NOT NULL,
    amount                  INTEGER NOT NULL,           -- in paise (Razorpay convention)
    currency                TEXT NOT NULL DEFAULT 'INR',
    razorpay_failure_code   TEXT NOT NULL CHECK (razorpay_failure_code IN
                                ('insufficient_funds','bank_timeout','3ds_dropoff','card_declined','other')),
    failure_note            TEXT,                       -- free-text gateway note, used when code = 'other'
    original_payment_method TEXT NOT NULL CHECK (original_payment_method IN ('card','upi','netbanking')),
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    status                  TEXT NOT NULL DEFAULT 'failed' CHECK (status IN
                                ('failed','contacted','promise_to_pay','recovered','needs_human')),
    attempt_count           INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3)
);

CREATE TABLE decisions (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id        INTEGER NOT NULL REFERENCES transactions(id),
    attempt_number        INTEGER NOT NULL,
    root_cause            TEXT NOT NULL CHECK (root_cause IN
                              ('insufficient_funds','bank_timeout','3ds_dropoff','card_declined')),
    classification_method TEXT NOT NULL CHECK (classification_method IN ('rule','llm')),
    strategy_chosen       TEXT NOT NULL CHECK (strategy_chosen IN
                              ('retry_same_method','suggest_upi','send_reminder','escalate_human')),
    reasoning_string      TEXT NOT NULL,
    created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE messages (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id),
    decision_id    INTEGER NOT NULL REFERENCES decisions(id),
    channel        TEXT NOT NULL DEFAULT 'whatsapp_mock',
    message_text   TEXT NOT NULL,
    payment_link   TEXT NOT NULL,
    sent_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE audit_log (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id    INTEGER NOT NULL REFERENCES transactions(id),
    timestamp         TEXT NOT NULL DEFAULT (datetime('now')),
    actor             TEXT NOT NULL CHECK (actor IN ('system','llm','customer')),
    action            TEXT NOT NULL,
    reasoning_string  TEXT NOT NULL
);

CREATE TABLE outcomes (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id     INTEGER NOT NULL REFERENCES transactions(id),
    simulated_response TEXT NOT NULL CHECK (simulated_response IN ('paid','ignored','promise_to_pay')),
    recorded_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_decisions_txn ON decisions(transaction_id);
CREATE INDEX idx_messages_txn ON messages(transaction_id);
CREATE INDEX idx_audit_txn ON audit_log(transaction_id);
CREATE INDEX idx_outcomes_txn ON outcomes(transaction_id);
