"""
Real Razorpay webhook signature verification.

Per Razorpay's own docs (https://razorpay.com/docs/webhooks/validate-test/):
the X-Razorpay-Signature header is an HMAC-SHA256 (hex digest) over the RAW
request body, keyed with the webhook secret configured in the Razorpay
dashboard for this webhook endpoint. This module implements exactly that,
with no shortcuts — an invalid or missing signature is always rejected,
never silently accepted "for the demo."

This is the piece that turns "customer paid" from a button click into a
real, cryptographically-verified event: only someone holding the actual
webhook secret (i.e. Razorpay itself, or someone who has the secret) can
produce a payload this function accepts.
"""

import hmac
import hashlib
import os
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

RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")


class WebhookSecretNotConfigured(Exception):
    """Raised when RAZORPAY_WEBHOOK_SECRET isn't set — verification cannot
    proceed at all (not the same as an invalid signature; this is a
    configuration error the caller should surface distinctly)."""
    pass


def verify_signature(raw_body: bytes, signature_header: str | None) -> bool:
    """
    Returns True iff `signature_header` is the correct HMAC-SHA256 hex
    digest of `raw_body`, keyed with RAZORPAY_WEBHOOK_SECRET.

    Uses hmac.compare_digest (constant-time) to avoid timing side-channels
    on the comparison — a real security property, not just correctness.

    Raises WebhookSecretNotConfigured if no secret is set in .env, so a
    misconfigured deployment fails loudly instead of silently accepting
    everything (which `not secret` would otherwise make trivially true).
    """
    if not RAZORPAY_WEBHOOK_SECRET:
        raise WebhookSecretNotConfigured(
            "RAZORPAY_WEBHOOK_SECRET is not set in backend/.env — cannot verify "
            "webhook signatures. Get this value from the Razorpay dashboard's "
            "webhook configuration page for this endpoint."
        )
    if not signature_header:
        return False

    expected = hmac.new(
        RAZORPAY_WEBHOOK_SECRET.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature_header)
