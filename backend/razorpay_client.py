"""
Razorpay TEST MODE Payment Link creation.

Uses the real Razorpay API (test mode key, no live money ever) to create a
genuine Payment Link for a given transaction/attempt. Returns the short_url
that gets embedded in the Hinglish WhatsApp-mock message.

Docs: https://razorpay.com/docs/api/payments/payment-links/create-standard/
"""

import base64
import json
import os
import time
import urllib.request
import urllib.error
from pathlib import Path

_ENV_PATH = Path(__file__).parent / ".env"


def _load_env():
    if not _ENV_PATH.exists():
        return
    for line in _ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


_load_env()

RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")
_API_URL = "https://api.razorpay.com/v1/payment_links/"


class RazorpayCallError(Exception):
    pass


class RazorpayQuotaExhausted(RazorpayCallError):
    """Raised when the account's fixed test-mode Payment Link cap (a hard,
    non-resetting ceiling per Razorpay's own docs — currently 30 links per
    business) has been reached. Distinct from a transient rate limit: no
    amount of retrying within this process will clear it."""
    pass


# Client-side pacing — empirically, Razorpay test-mode Payment Link creation
# enforces a rolling quota around ~5 requests/minute: short bursts succeed,
# then every call 429s until the window clears (~60s), and per-call retry
# backoff does NOT recover within that window. Pace sustained calls well
# under that rate rather than relying on retry-after-fail.
_MIN_SECONDS_BETWEEN_CALLS = 13.0
_last_call_time = [0.0]


def _throttle():
    elapsed = time.monotonic() - _last_call_time[0]
    wait = _MIN_SECONDS_BETWEEN_CALLS - elapsed
    if wait > 0:
        time.sleep(wait)
    _last_call_time[0] = time.monotonic()


def _basic_auth_header() -> str:
    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        raise RazorpayCallError("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set")
    token = base64.b64encode(f"{RAZORPAY_KEY_ID}:{RAZORPAY_KEY_SECRET}".encode()).decode()
    return f"Basic {token}"


def create_payment_link(
    amount: int,
    currency: str,
    customer_name: str,
    customer_phone: str,
    description: str,
    reference_id: str,
) -> dict:
    """
    Creates a real Razorpay test-mode Payment Link.

    amount: integer in the smallest currency unit (paise for INR).
    reference_id: our own transaction_id/attempt tag, stored on the link for
    traceability in the Razorpay dashboard.

    Returns {"id": <plink_...>, "short_url": <https://rzp.io/...>}.
    Raises RazorpayCallError on any failure — callers should not silently
    proceed without a real payment link, per the "no fabricated links" spirit
    of the audit requirements.
    """
    payload = {
        "amount": amount,
        "currency": currency,
        "description": description[:2048],
        "reference_id": reference_id,
        "customer": {
            "name": customer_name,
            "contact": customer_phone,
        },
        "notify": {"sms": False, "email": False},
        "reminder_enable": False,
    }

    req_body = json.dumps(payload).encode("utf-8")
    auth_header = _basic_auth_header()

    _throttle()
    req = urllib.request.Request(
        _API_URL,
        data=req_body,
        headers={
            "Content-Type": "application/json",
            "Authorization": auth_header,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        # "test mode limit of 30 reached" is a fixed, non-resetting per-business
        # cap (confirmed via Razorpay's own docs) — retrying gains nothing.
        # Fail fast and distinctly so the caller can switch to mock links.
        if e.code == 429 and "test mode limit" in body.lower():
            raise RazorpayQuotaExhausted(f"HTTP {e.code}: {body}") from e
        raise RazorpayCallError(f"HTTP {e.code}: {body}") from e
    except urllib.error.URLError as e:
        raise RazorpayCallError(f"network error: {e}") from e

    if "short_url" not in data or "id" not in data:
        raise RazorpayCallError(f"unexpected response shape: {data}")

    return {"id": data["id"], "short_url": data["short_url"]}


def mock_payment_link(reference_id: str) -> dict:
    """
    Disclosed fallback used ONLY once the account's real test-mode Payment
    Link quota (fixed, non-resetting cap — see RazorpayQuotaExhausted) is
    exhausted. Produces a realistic-looking but entirely fake rzp.io-style
    URL, deterministic from reference_id so re-runs are stable.

    Callers MUST log this to audit_log with actor="system",
    action="payment_link_mocked" — never conflate this with a real link.
    """
    import hashlib

    digest = hashlib.sha1(reference_id.encode()).hexdigest()[:8]
    return {"id": f"mock_plink_{digest}", "short_url": f"https://rzp.io/rzp/mock{digest}"}
