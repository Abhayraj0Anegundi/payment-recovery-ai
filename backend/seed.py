"""
Seed script — generates a synthetic batch of failed transactions for the
Hinglish Payment Recovery Agent pipeline.

Usage:
    py -3 seed.py [--count N] [--db PATH] [--seed SEED]

Rebuilds the SQLite DB from schema.sql each run (fresh batch, no accumulation).
"""

import argparse
import random
import sqlite3
from pathlib import Path

BACKEND_DIR = Path(__file__).parent
DEFAULT_DB_PATH = BACKEND_DIR / "recovery.db"
SCHEMA_PATH = BACKEND_DIR / "schema.sql"

FIRST_NAMES = [
    "Priya", "Rohan", "Ananya", "Vikram", "Sneha", "Arjun", "Kavya", "Aditya",
    "Neha", "Rahul", "Pooja", "Karthik", "Divya", "Siddharth", "Meera", "Amit",
    "Riya", "Sanjay", "Isha", "Varun", "Nisha", "Manoj", "Shreya", "Gaurav",
    "Anjali", "Nikhil", "Tanvi", "Rajesh", "Swati", "Deepak", "Pallavi", "Kunal",
    "Aarti", "Suresh", "Ritika", "Vishal", "Komal", "Harsh", "Simran", "Yash",
]

LAST_NAMES = [
    "Sharma", "Verma", "Iyer", "Reddy", "Nair", "Gupta", "Menon", "Rao",
    "Patel", "Singh", "Kulkarni", "Joshi", "Chatterjee", "Desai", "Agarwal",
    "Pillai", "Malhotra", "Bhatt", "Kapoor", "Chauhan", "Bose", "Mishra",
]

FAILURE_CODES = ["insufficient_funds", "bank_timeout", "3ds_dropoff", "card_declined"]

PAYMENT_METHODS_BY_CODE = {
    # a failure code implies which payment method makes sense
    "insufficient_funds": ["card", "upi"],
    "bank_timeout": ["netbanking", "upi"],
    "3ds_dropoff": ["card"],
    "card_declined": ["card"],
    "other": ["card", "upi", "netbanking"],
}

# Free-text gateway notes used only for failure_code = "other", exercising the
# LLM classification path. Each note is deliberately worded to map fairly
# clearly to one of the four fixed causes, so we can sanity-check the LLM's
# classification against an expected label during Phase 3.
OTHER_NOTES = [
    ("Customer account had low available balance at time of debit", "insufficient_funds"),
    ("Issuing bank gateway did not respond within timeout window", "bank_timeout"),
    ("OTP verification screen was abandoned by user mid-flow", "3ds_dropoff"),
    ("Card issuer declined the transaction with generic decline code", "card_declined"),
    ("Payment failed after prolonged delay on bank authorization page", "bank_timeout"),
    ("Insufficient balance in linked account reported by processor", "insufficient_funds"),
    ("User did not complete two-factor authentication challenge", "3ds_dropoff"),
    ("Bank declined due to risk rules, no further detail provided", "card_declined"),
]

AMOUNT_CHOICES_PAISE = [
    49900, 99900, 149900, 199900, 249900, 299900, 349900, 499900,
    599900, 749900, 999900, 1499900, 1999900, 2499900,
]


def random_phone(rng: random.Random) -> str:
    return "9" + "".join(str(rng.randint(0, 9)) for _ in range(9))


def build_batch(count: int, rng: random.Random):
    """Build a roughly-even distribution across the 4 fixed causes, plus a
    handful of 'other' rows to exercise the LLM classification path."""
    other_count = max(6, round(count * 0.08))
    remaining = count - other_count
    base = remaining // len(FAILURE_CODES)
    extra = remaining - base * len(FAILURE_CODES)

    code_counts = {code: base for code in FAILURE_CODES}
    # distribute the remainder across the first `extra` codes
    for i, code in enumerate(FAILURE_CODES):
        if i < extra:
            code_counts[code] += 1

    rows = []
    for code, n in code_counts.items():
        for _ in range(n):
            rows.append(_build_row(code, rng))
    for _ in range(other_count):
        rows.append(_build_row("other", rng))

    rng.shuffle(rows)
    return rows


def _build_row(code: str, rng: random.Random):
    name = f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"
    phone = random_phone(rng)
    amount = rng.choice(AMOUNT_CHOICES_PAISE)
    method = rng.choice(PAYMENT_METHODS_BY_CODE[code])

    failure_note = None
    if code == "other":
        note, _expected_cause = rng.choice(OTHER_NOTES)
        failure_note = note

    return {
        "customer_name": name,
        "customer_phone": phone,
        "amount": amount,
        "currency": "INR",
        "razorpay_failure_code": code,
        "failure_note": failure_note,
        "original_payment_method": method,
    }


def seed_db(db_path: Path, count: int, seed: int):
    rng = random.Random(seed)

    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))

    rows = build_batch(count, rng)

    with conn:
        conn.executemany(
            """
            INSERT INTO transactions
                (customer_name, customer_phone, amount, currency,
                 razorpay_failure_code, failure_note, original_payment_method)
            VALUES (:customer_name, :customer_phone, :amount, :currency,
                    :razorpay_failure_code, :failure_note, :original_payment_method)
            """,
            rows,
        )

    conn.close()
    return rows


def print_summary(rows):
    from collections import Counter

    counts = Counter(r["razorpay_failure_code"] for r in rows)
    print(f"Seeded {len(rows)} transactions\n")
    print("Distribution by failure_code:")
    for code in FAILURE_CODES + ["other"]:
        print(f"  {code:<20} {counts.get(code, 0)}")

    print("\nSample rows:")
    for r in rows[:8]:
        note = f" note='{r['failure_note']}'" if r["failure_note"] else ""
        print(
            f"  {r['customer_name']:<20} {r['customer_phone']} "
            f"Rs.{r['amount']/100:>8.2f} {r['razorpay_failure_code']:<18} "
            f"via {r['original_payment_method']:<10}{note}"
        )


def main():
    parser = argparse.ArgumentParser(description="Seed synthetic failed transactions")
    parser.add_argument("--count", type=int, default=90, help="number of transactions (80-100 recommended)")
    parser.add_argument("--db", type=str, default=str(DEFAULT_DB_PATH), help="path to SQLite db file")
    parser.add_argument("--seed", type=int, default=42, help="RNG seed for reproducibility")
    args = parser.parse_args()

    db_path = Path(args.db)
    rows = seed_db(db_path, args.count, args.seed)
    print_summary(rows)
    print(f"\nDB written to: {db_path}")


if __name__ == "__main__":
    main()
