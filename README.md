# AI Revenue Recovery — Hinglish-Voice Payment Recovery Agent

A payment-failure recovery pipeline built for Razorpay's "AI Revenue Recovery" hackathon
track. It classifies why a payment failed, picks a recovery strategy from a **fixed,
non-negotiable decision table** (never invented by an LLM), writes a natural Hinglish
WhatsApp-style nudge that names the actual failure reason, creates a real Razorpay
test-mode Payment Link, and logs every step to an auditable SQLite trail.

The design brief was explicit: **correctness, auditability, and honest metrics over a
flashier demo.** Everything below — including the parts that didn't go smoothly — is
reported the way it actually happened.

---

## What this is not

- Not a generic "your payment failed, please retry" bot.
- Not an LLM that decides what to do. The LLM only **explains** an already-chosen
  strategy and **writes the copy** for it — never picks the strategy itself.
- Not a cherry-picked demo subset. All metrics below are computed live from the full
  90-transaction batch, recomputed on every dashboard load, including the failure case.

---

## Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────────────┐
│  seed.py     │─────▶│  recovery.db      │◀────▶│  pipeline.py         │
│  (synthetic  │      │  (SQLite,         │      │  (batch orchestrator)│
│  batch)      │      │   schema.sql)     │      └──────────┬───────────┘
└─────────────┘      └──────────────────┘                 │
                              ▲                             │ per transaction, per attempt (max 3)
                              │                             ▼
                     ┌────────┴─────────┐         ┌──────────────────────┐
                     │  api.py          │         │  classifier.py         │
                     │  (read-only      │         │  rule-based cause →    │
                     │  Flask API,      │         │  fixed strategy table  │
                     │  live queries)   │         │  (pure functions)      │
                     └────────┬─────────┘         └──────────┬─────────────┘
                              │                                │ only if AMBIGUOUS
                              ▼                                ▼
                     ┌──────────────────┐         ┌──────────────────────┐
                     │  React dashboard  │         │  gemini_client.py      │
                     │  (kanban + funnel │         │  1) classify ambiguous │
                     │  + audit trail)   │         │  2) write Hinglish msg │
                     └──────────────────┘         └──────────┬─────────────┘
                                                                │
                                                                ▼
                                                     ┌──────────────────────┐
                                                     │  razorpay_client.py    │
                                                     │  real test-mode        │
                                                     │  Payment Links          │
                                                     │  (+ disclosed mock       │
                                                     │  fallback, see below)   │
                                                     └──────────────────────┘

Every arrow above that represents a side effect also writes a row to `audit_log`,
in the same SQLite commit — no side effect happens without an audit row.
```

**Stack:** Python 3.14 (backend + pipeline), Flask (read-only API), SQLite (single-file
audit log), Gemini API (`gemini-3.5-flash-lite`), Razorpay Test Mode API, React + Vite +
Tailwind v4 (dashboard).

---

## The decision table (fixed, never LLM-generated)

| `razorpay_failure_code` | `root_cause`         | `strategy_chosen`   |
|--------------------------|-----------------------|----------------------|
| `insufficient_funds`     | `insufficient_funds`  | `send_reminder`      |
| `bank_timeout`            | `bank_timeout`         | `retry_same_method`  |
| `3ds_dropoff`             | `3ds_dropoff`          | `retry_same_method`  |
| `card_declined`           | `card_declined`        | `suggest_upi`        |
| `other` / unrecognized    | *(ambiguous → LLM classifies into one of the 4 causes above, never a 5th label)* | |
| *any cause, attempt 3*    | *(unchanged)*          | `escalate_human` (forced, overrides the table above) |

This table lives in [`backend/classifier.py`](backend/classifier.py) as plain Python
functions (`classify_cause`, `strategy_for_cause`, `decide`) — no prompt involved. Gemini
is called from two narrow, independently-testable functions in
[`backend/gemini_client.py`](backend/gemini_client.py):

1. `classify_ambiguous_cause(...)` — **only** for `failure_code="other"`. Strict JSON
   output, constrained to the same 4 labels, retries once on invalid output, then raises
   (caller falls back to a deterministic default and logs it).
2. `generate_hinglish_message(...)` — runs for every attempt, on an **already-decided**
   strategy. Writes the WhatsApp-tone Hinglish nudge + a one-sentence audit reasoning
   string. Same retry-then-fallback contract.

---

## The 3-attempt hard cap

Enforced structurally in `classifier.decide()`: calling it with `attempt_number > 3`
raises `ValueError` — it is not possible for any code path to request a 4th attempt.
On `attempt_number == 3`, the strategy is unconditionally overridden to
`escalate_human` regardless of cause, and no payment link or message is generated for
that attempt (there's no point nudging a customer you're escalating away from).

---

## Live demo mode — not just a batch report

Everything above runs as a batch script against seeded data. To prove this is actual
event-driven logic and not a one-off report generator, the dashboard also has a **Live
Demo** panel that triggers the real pipeline on a brand-new transaction, live, in the
browser:

1. Pick a failure scenario and click "Trigger a real failed payment." This POSTs to
   `/api/webhook/payment-failed` — shaped like a real Razorpay `payment.failed` webhook
   — which creates a new transaction row and runs attempt 1 through the *exact same*
   `pipeline.process_one_attempt()` function the batch runs use: real rule/LLM
   classification, a real Razorpay test-mode Payment Link, a real Gemini-generated
   Hinglish message. Nothing here is pre-computed or read from `recovery.db`.
2. Click "Customer ignored" / "Promise to pay" / "Customer paid" to simulate what
   happens next. This calls `/api/transactions/<id>/respond`, which runs
   `pipeline.record_customer_response()` — the same function the batch pipeline calls.
   If ignored and attempts remain, the next attempt starts automatically and you watch a
   second real decision, link, and message appear live.
3. The whole thing is subject to the identical hard 3-attempt cap and fixed decision
   table as every other transaction — click "Customer ignored" three times on the same
   demo transaction and it escalates to `needs_human` for real, in front of you.

There is no separate "demo mode" code path — `api.py`'s two write endpoints
(`/api/webhook/payment-failed`, `/api/transactions/<id>/respond`) are thin wrappers
around the same `process_one_attempt` / `record_customer_response` functions
`pipeline.py`'s batch loop calls internally. A transaction created this way lives in the
same `transactions` table, gets the same audit trail, and shows up in the same kanban
board as everything else.

### Live traffic simulation on Refresh

The dashboard's **Refresh** button doesn't just re-read `recovery.db` — it first fires
2-3 *real* transactions through the exact same webhook + response pipeline described
above (`frontend/src/simulateActivity.js`), using randomized synthetic customers and
scenarios, then reloads. This is intentional: it makes the dashboard feel like a system
with ongoing traffic instead of a static report, and it is not faked — every one of
those transactions is a real classify → decide → Gemini message → Razorpay-or-mocked
link → simulated customer response, written to the same audit trail as everything else.

**Consequence, stated plainly**: the transaction count is not frozen at 91 — it grows by
2-3 every time Refresh is clicked. The "Honest results" table below reflects the state
*as originally documented*; the live dashboard will show a higher, still-honestly-computed
total the moment anyone clicks Refresh. If you want to reproduce the exact documented
numbers, don't click Refresh — the API returns the current live state on page load
without it, and the numbers below match that initial state.

---

## Running it

### 1. Backend setup

```bash
cd backend
py -3 -m pip install -r requirements.txt
```

Create `backend/.env` (gitignored):

```
GEMINI_API_KEY=<your Gemini API key>
GEMINI_MODEL=gemini-3.5-flash-lite
RAZORPAY_KEY_ID=<your Razorpay test key id>
RAZORPAY_KEY_SECRET=<your Razorpay test key secret>
```

### 2. Seed the batch

```bash
py -3 seed.py --count 90
```

Generates ~90 synthetic failed transactions, roughly even across the 4 failure codes
plus a handful of `other` (with free-text gateway notes) to exercise the LLM
classification path.

### 3. Run the classifier unit tests (optional but recommended)

```bash
py -3 -m unittest test_classifier -v
```

### 4. Run the full pipeline

```bash
py -3 pipeline.py --db recovery.db
```

Processes every `status='failed'` transaction through classify → decide → message →
payment link → mock-send → simulate response → retry/escalate, writing the full audit
trail. Re-running against the same DB safely resumes — it only picks up transactions
still in `failed` status.

### 5. Start the API + dashboard

```bash
# terminal 1
cd backend
py -3 api.py --db recovery.db --port 5001

# terminal 2
cd frontend
npm install
npm run dev
```

Open the printed `localhost` URL (default `http://localhost:5173`). The dashboard shows,
top to bottom: live recovery metrics, a funnel, a "System Guarantees" panel (structural
claims like "0 of 129 strategy decisions made by LLM," computed live), a per-cause
breakdown table, a Hinglish message quality showcase (real output vs. a generic baseline),
a pinned `needs_human` example, and the full 5-column kanban board — click any card for
its complete decision + message + audit trail.

To view the 100%-real-links batch instead, point the API at the other DB:

```bash
py -3 api.py --db recovery_real.db --port 5001
```

---

## Honest results — the actual run, not a cherry-picked one

**90 seeded transactions processed** through the real pipeline in the original batch run,
**plus 1 additional transaction (#96)** added afterward via the dashboard's own Live Demo
"build your own scenario" form (see below) and resolved through the same real pipeline —
91 total. Metrics below are pulled live from `GET /api/metrics/summary` and
`/api/metrics/by-cause` against the committed `recovery.db` — reproducible by running the
dashboard yourself, and they will keep changing slightly if you trigger more Live Demo
transactions against this same file, which is expected: they're computed live, not frozen.

| Metric | Value |
|---|---|
| Total transactions | 91 |
| Recovered | 57 (62.6%) |
| Promise to pay | 23 |
| Needs human (escalated) | **11** |
| Avg attempts to recovery | 1.25 |
| Root-cause classifications via rule table | 117 |
| Root-cause classifications via LLM (ambiguous `other` cases) | 13 |
| LLM message-generation fallback triggers | 0 (every Hinglish message parsed cleanly) |
| `audit_log` rows | 830 |

**Per-cause breakdown** (computed live, not hand-picked — note the real variance,
consistent with the intended weighting that bank-side transient failures recover more
easily than low-balance ones):

| Root cause | Total | Recovered | Promise | Needs Human | Recovery % |
|---|---|---|---|---|---|
| Bank Timeout | 26 | 20 | 4 | 2 | **76.9%** |
| 3DS Dropoff | 22 | 15 | 5 | 2 | 68.2% |
| Card Declined | 22 | 14 | 5 | 3 | 63.6% |
| Insufficient Funds | 21 | 8 | 9 | 4 | **38.1%** |

11 transactions genuinely reached `needs_human` after exhausting all 3 attempts — this
is visible and pinned in the dashboard, not a hypothetical.

**Transaction #96 is worth calling out specifically**: it was created by typing
`"idk what happened"` as a gateway note under the ambiguous `other` failure code — a
deliberate stress test of the LLM classification path with a genuinely uninformative
input. The LLM still forced a decision into one of the 4 fixed causes rather than
inventing a 5th or hedging: *"Since the gateway note is uninformative, bank_timeout is
chosen as the closest default for unexplained transaction drops."* This is the
classification prompt's forbid-a-5th-label constraint working exactly as designed under
adversarial input, not just clean seeded data.

---

## The Razorpay quota story (told plainly)

Razorpay's test-mode API enforces a **fixed, non-resetting cap of 30 Payment Links per
business** (confirmed against their own documentation — this is not a rolling rate
limit that clears over time; only Razorpay Support raising it, or a genuinely separate
business account, unblocks more). Two different key pairs shared this same cap, since
Razorpay scopes it per-business, not per-key-pair.

**6 transactions in this run used genuinely real Razorpay test-mode Payment Links** —
independently verifiable in the Razorpay test dashboard, created via the real
`POST /v1/payment_links/` API with Basic Auth, `reference_id` traceability, and correct
customer/amount data. This proves the integration is real and working end to end
(see `backend/razorpay_client.py::create_payment_link`).

Once the account's 30-link cap was hit mid-run, the pipeline automatically and
**transparently** switched to a disclosed mock-link fallback
(`razorpay_client.py::mock_payment_link`) for the remaining payment-link-requiring
attempts, so the full batch could complete and every dashboard column (including
`needs_human`) could be demonstrated. Every single mocked link has its own `audit_log`
row (`action='payment_link_mocked'` or `'razorpay_quota_exhausted'`) explaining exactly
why — nowhere in the data is a mock link presented as, or confused with, a real one. This
is the one deliberate, fully-disclosed deviation from "real links for every transaction,"
made necessary by an external account limit rather than a pipeline shortcut.

```sql
-- verify for yourself (exact counts will grow if you trigger more Live Demo
-- transactions against this file — this query always reflects the current state):
SELECT action, COUNT(*) FROM audit_log
WHERE action IN ('create_payment_link','payment_link_mocked')
GROUP BY action;
-- create_payment_link | 6
-- payment_link_mocked | 113
```

### A second, 100%-real batch (`recovery_real.db`)

To fully close this gap rather than just disclose it, a second, smaller batch was run
against a second Razorpay test account with a clean 30-link quota:

```bash
py -3 seed.py --count 18 --db recovery_real.db --seed 100
py -3 pipeline.py --db recovery_real.db --seed 2
```

**Result: 18/18 transactions processed, 24/24 payment links genuinely real, 0 mocked.**
Every column of the pipeline is demonstrated on real infrastructure, including a
`needs_human` case that started from an ambiguous `other` failure code (LLM-classified
as `bank_timeout` consistently across all 3 attempts, retried via real Razorpay links
twice, then correctly escalated with no link created on attempt 3 — see transaction #4
in `recovery_real.db`).

```sql
SELECT action, COUNT(*) FROM audit_log
WHERE action IN ('create_payment_link','payment_link_mocked')
GROUP BY action;
-- create_payment_link | 24
-- payment_link_mocked | (no rows)
```

| Metric (`recovery_real.db`) | Value |
|---|---|
| Total transactions | 18 |
| Recovered | 8 |
| Promise to pay | 5 |
| Needs human | 5 |
| Real payment links | 24 / 24 (100%) |

Run the dashboard against either database via `py -3 api.py --db recovery.db` (full-scale,
honestly-disclosed batch) or `py -3 api.py --db recovery_real.db` (smaller, zero-mock
batch) — same API, same frontend, just point it at the DB you want to show.

---

## What the outcome data suggests — an honest note on "does this learn?"

The strategy table is deliberately fixed and never LLM-chosen (see above) — that's a
trust and auditability decision, not an oversight, and it means the pipeline itself does
not adapt between transaction #1 and #91. But it does log a real outcome for every
attempt, and that data already contains a genuine, checkable signal:

```
GET /api/metrics/adaptive-insight
```

computes, live, the recovery rate per root cause and surfaces the gap directly:
**`insufficient_funds` recovers at 38.1% vs `bank_timeout` at 76.9%** — a real ~39-point
difference visible in `recovery.db` today, not a hypothetical. The endpoint (and the
matching dashboard panel) is explicit that this is a **computed observation, not a
trained model** — the pipeline does not act on it automatically. It exists to make one
concrete claim: the audit trail this system already writes is sufficient to drive a
genuinely adaptive v2 (e.g. per-cause timing changes — delay the `insufficient_funds`
reminder instead of sending it immediately) without touching the fixed decision table's
auditability. Which fixed strategy applies could become data-driven; whether an LLM gets
to invent a new one never does.

---

## Data model

See [`backend/schema.sql`](backend/schema.sql) for the full DDL. Five tables:
`transactions`, `decisions`, `messages`, `audit_log`, `outcomes` — matching the spec's
data model, with CHECK constraints enforcing the fixed vocabularies (failure codes,
causes, strategies, statuses, actors) at the database level, not just in application
code.

## Project layout

```
backend/
  schema.sql           — SQLite DDL
  seed.py              — synthetic batch generator
  classifier.py        — rule-based cause/strategy lookup (pure functions)
  test_classifier.py   — unit tests (15 tests)
  gemini_client.py     — the 2 narrow Gemini prompts + JSON parsing/fallback
  razorpay_client.py   — real Payment Link creation + disclosed mock fallback
  pipeline.py          — batch orchestrator, 3-attempt loop, audit logging
  api.py               — Flask API; metrics endpoints read-only, plus 2 write
                          endpoints for the Live Demo (real webhook + response)
  recovery.db          — full ~90-txn batch (6 real + 113 disclosed-mock links)
  recovery_real.db     — 18-txn batch, 24/24 links genuinely real, 0 mocked
frontend/
  src/
    api.js                        — thin fetch wrapper
    constants.js                  — shared labels/colors
    components/
      MetricsHeader.jsx           — recovery rate, funnel, needs-human count
      SystemGuarantees.jsx        — live-computed "not a black box" numbers
      CauseBreakdownTable.jsx
      MessageShowcase.jsx         — real Hinglish output vs generic baseline
      KanbanBoard.jsx             — 5-column board, live from /api/transactions
      TransactionDetailModal.jsx  — full decision + message + audit trail
    App.jsx
```

## Optional: ESP32 needs-human LED

`GET /api/needs-human-count` returns `{"needs_human_count": N}` — a single-purpose
read-only endpoint an ESP32 polls to light an LED when `N > 0` (currently 11 in
`recovery.db`). Firmware, wiring diagram, and setup steps are in
[`esp32/needs_human_led.ino`](esp32/needs_human_led.ino) and
[`esp32/README.md`](esp32/README.md). Purely additive — it never touches the pipeline,
database, or audit trail, and the core submission doesn't depend on it.

To make the API reachable from the ESP32 (a separate device on the LAN), bind it to all
interfaces instead of just localhost:

```bash
py -3 api.py --db recovery.db --host 0.0.0.0 --port 5001
```

---

## Two demo artifacts, two different stories

- **`recovery.db`** — the full ~90-transaction batch, computed with honest metrics at
  real scale (90 from the original seeded run, plus any Live Demo transactions triggered
  since). 6 real links + the rest disclosed mocks (see above). This is the number to cite
  for "recovery rate," "per-cause breakdown," and "avg attempts to recovery" — it's the
  one with enough volume for those to mean something statistically.
- **`recovery_real.db`** — an 18-transaction batch where literally every payment link is
  real, verifiable in the Razorpay test dashboard, with no mocking anywhere in the trail.
  This is the one to point to if asked "is any of this faked" — the answer for this batch
  is no, provably.

Nothing about the pipeline logic differs between them — same code, same decision table,
same audit contract. Only which Razorpay account (and therefore how much real quota) was
available at run time changes which branch (`create_payment_link` vs `mock_payment_link`)
fires.
