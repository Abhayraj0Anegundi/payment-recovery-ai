"""
Gemini integration — two narrow, independently-testable functions:

  1. classify_ambiguous_cause(...)  — only called when the rule-based
     classifier returns AMBIGUOUS (failure_code == "other" / unrecognized).
  2. generate_hinglish_message(...) — called for every transaction, every
     attempt, to write the WhatsApp nudge + audit reasoning for an
     ALREADY-DECIDED strategy. The LLM never picks the strategy.

Both enforce strict JSON-only output, validate against the fixed label set,
and retry once on parse/validation failure before falling back to a safe
deterministic template (caller logs the fallback to audit_log).
"""

import json
import os
import re
import time
import urllib.request
import urllib.error
from pathlib import Path

from classifier import CAUSES, STRATEGIES

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

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.7-flash")
_API_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
)

CLASSIFICATION_SYSTEM_INSTRUCTION = """You are a strict payment-failure classifier for an Indian payments recovery system.

You MUST classify the failure into EXACTLY ONE of these four labels — no others exist:
- insufficient_funds
- bank_timeout
- 3ds_dropoff
- card_declined

Rules:
- You are FORBIDDEN from inventing a new label, adding a fifth category, or returning "other"/"unknown"/"unclear".
- If the note is genuinely ambiguous, pick the single closest of the four labels based on the evidence given — do not hedge on the LABEL. You must always pick one of the four.
- You MUST also self-report your confidence in that classification, honestly, as exactly one of "high", "medium", "low":
  - "high": the gateway note clearly and specifically points to one cause (e.g. it names a timeout, an explicit balance/limit message, an OTP/verification failure, or an explicit decline reason).
  - "medium": the note is suggestive but not explicit — you're inferring from partial or generic wording.
  - "low": the note is vague, generic, contradictory, or gives you almost nothing to go on (e.g. "idk", "payment failed", "something went wrong") — you are essentially guessing between the four labels.
- Being honest about "low" confidence is exactly as important as picking the right label. Do not inflate confidence to look more certain than you are — a wrong "high" is worse than an honest "low".
- Output ONLY valid JSON matching this exact schema, with no markdown fences, no preamble, no explanation outside the JSON:
{"cause": "<one of the four labels>", "confidence": "<high|medium|low>", "justification": "<one sentence, specific to the input given, and if confidence is low, say what's missing>"}
- Do not output anything before or after the JSON object."""

MESSAGE_SYSTEM_INSTRUCTION = """You are writing a short WhatsApp-style payment recovery nudge for an Indian customer, in natural
Hinglish (code-mixed Hindi-English, written in Latin script). You also write a one-sentence
internal reasoning note for an audit log.

You will be given: customer_name, amount, root_cause, strategy_chosen, attempt_number, payment_link.

STRICT RULES:
- The message MUST reference the SPECIFIC root_cause in natural language — never a generic
  "payment failed, please retry" line. The customer should understand WHY it failed, in the
  same message.
- Tone: warm, respectful, concise (1-3 sentences), like a real person texting on WhatsApp —
  not corporate, not robotic.
- Always include the payment_link exactly as given, once, naturally worked into the message.
- Output ONLY valid JSON, no markdown fences, no text outside the JSON:
{"message": "<Hinglish nudge>", "reasoning": "<one sentence: why this strategy fits this cause>"}

FEW-SHOT EXAMPLES:

GOOD (root_cause=bank_timeout, strategy=retry_same_method):
{"message": "Namaste Priya ji, aapka payment bank ki taraf se timeout ho gaya tha — koi dikkat nahi, bas ek baar phir try kar lijiye: {link}", "reasoning": "Bank-side timeout is usually transient, so retrying the same method is most likely to succeed without customer friction."}

GOOD (root_cause=card_declined, strategy=suggest_upi):
{"message": "Hi Rohan, card se payment decline ho gaya — UPI try karenge? Zyada smooth chalta hai: {link}", "reasoning": "Card decline suggests an issuer-side block, so switching to UPI avoids repeating the same failure."}

GOOD (root_cause=insufficient_funds, strategy=send_reminder):
{"message": "Hi Ananya, lagta hai us waqt balance thoda kam tha — jab convenient ho tab yeh link se payment complete kar dijiye: {link}", "reasoning": "Insufficient funds needs time to resolve, so a gentle delayed reminder is used instead of an immediate retry."}

BAD (avoid — generic, doesn't name the cause):
{"message": "Your payment failed. Please try again using this link: {link}", "reasoning": "Payment failed so we are retrying."}

Never produce output like the BAD example."""


class GeminiCallError(Exception):
    pass


# Client-side pacing to stay under the free-tier RPM cap. gemini-2.5-flash-lite
# free tier is documented around 15 req/min; we pace conservatively below that
# so a long batch run doesn't spend most of its time in 429 backoff.
_MIN_SECONDS_BETWEEN_CALLS = 4.5
_last_call_time = [0.0]


def _throttle():
    elapsed = time.monotonic() - _last_call_time[0]
    wait = _MIN_SECONDS_BETWEEN_CALLS - elapsed
    if wait > 0:
        time.sleep(wait)
    _last_call_time[0] = time.monotonic()


def _retry_delay_from_error(body: str) -> float:
    match = re.search(r'"retryDelay":\s*"(\d+(?:\.\d+)?)s"', body)
    if match:
        return float(match.group(1)) + 1.0
    return 10.0


def _call_gemini(system_instruction: str, user_message: str) -> str:
    if not GEMINI_API_KEY:
        raise GeminiCallError("GEMINI_API_KEY is not set")

    payload = {
        "system_instruction": {"parts": [{"text": system_instruction}]},
        "contents": [{"role": "user", "parts": [{"text": user_message}]}],
        "generationConfig": {
            "temperature": 0.7,
            "responseMimeType": "application/json",
        },
    }
    req_body = json.dumps(payload).encode("utf-8")

    max_rate_limit_retries = 3
    for rl_attempt in range(max_rate_limit_retries + 1):
        _throttle()
        req = urllib.request.Request(
            _API_URL,
            data=req_body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
            break
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            if e.code in (429, 503) and rl_attempt < max_rate_limit_retries:
                time.sleep(_retry_delay_from_error(body))
                continue
            raise GeminiCallError(f"HTTP {e.code}: {body}") from e
        except urllib.error.URLError as e:
            raise GeminiCallError(f"network error: {e}") from e
    else:
        raise GeminiCallError("exhausted rate-limit retries")

    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        raise GeminiCallError(f"unexpected response shape: {data}") from e


def _extract_json(text: str) -> dict:
    """Parse strict JSON, tolerating stray markdown fences if the model adds them."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()
    return json.loads(cleaned)


# ---------------------------------------------------------------------------
# 1. Ambiguous root-cause classification
# ---------------------------------------------------------------------------

_VALID_CONFIDENCE = ("high", "medium", "low")


def classify_ambiguous_cause(failure_note: str, amount: int, payment_method: str) -> dict:
    """
    Calls Gemini to classify an ambiguous ("other") failure into one of the
    4 fixed cause labels, along with a self-reported confidence level.
    Retries once on invalid JSON / invalid label / invalid confidence; on
    second failure, raises GeminiCallError so the caller can apply the
    deterministic fallback and log actor="system", action="llm_fallback_used".

    Returns {"cause": <one of CAUSES>, "confidence": <high|medium|low>,
    "justification": str}. The confidence is NOT decorative — pipeline.py
    uses "low" confidence to force escalate_human regardless of attempt
    number, a real behavior change, not just a UI label. See
    "Does the LLM's uncertainty change behavior?" in the README.
    """
    user_message = (
        "failure_code: other\n"
        f"gateway_note: {failure_note or '(none provided)'}\n"
        f"amount: {amount} paise\n"
        f"payment_method: {payment_method}\n\n"
        "Classify this into exactly one of: insufficient_funds, bank_timeout, 3ds_dropoff, card_declined. "
        "Also self-report your confidence honestly, per the rules above."
    )

    last_error = None
    for _attempt in range(2):
        try:
            raw = _call_gemini(CLASSIFICATION_SYSTEM_INSTRUCTION, user_message)
            parsed = _extract_json(raw)
            cause = parsed.get("cause")
            confidence = parsed.get("confidence")
            justification = parsed.get("justification")
            if cause not in CAUSES:
                raise ValueError(f"LLM returned invalid cause label: {cause!r}")
            if confidence not in _VALID_CONFIDENCE:
                raise ValueError(f"LLM returned invalid confidence level: {confidence!r}")
            if not justification or not isinstance(justification, str):
                raise ValueError("LLM response missing justification")
            return {"cause": cause, "confidence": confidence, "justification": justification}
        except (GeminiCallError, ValueError, json.JSONDecodeError) as e:
            last_error = e

    raise GeminiCallError(f"classification failed after retry: {last_error}")


# ---------------------------------------------------------------------------
# 2. Hinglish message + reasoning generation
# ---------------------------------------------------------------------------

def generate_hinglish_message(
    customer_name: str,
    amount: int,
    root_cause: str,
    strategy_chosen: str,
    attempt_number: int,
    payment_link: str,
) -> dict:
    """
    Calls Gemini to write the Hinglish nudge + audit reasoning for an
    ALREADY-DECIDED strategy. Retries once on invalid JSON; raises
    GeminiCallError on second failure so the caller can fall back to a
    deterministic template and log actor="system", action="llm_fallback_used".

    Returns {"message": str, "reasoning": str}.
    """
    if root_cause not in CAUSES:
        raise ValueError(f"root_cause must be one of {CAUSES}, got {root_cause!r}")
    if strategy_chosen not in STRATEGIES:
        raise ValueError(f"strategy_chosen must be one of {STRATEGIES}, got {strategy_chosen!r}")

    user_message = (
        f"customer_name: {customer_name}\n"
        f"amount: {amount} paise\n"
        f"root_cause: {root_cause}\n"
        f"strategy_chosen: {strategy_chosen}\n"
        f"attempt_number: {attempt_number}\n"
        f"payment_link: {payment_link}\n\n"
        "Write the Hinglish nudge and reasoning per the rules above."
    )

    last_error = None
    for _attempt in range(2):
        try:
            raw = _call_gemini(MESSAGE_SYSTEM_INSTRUCTION, user_message)
            parsed = _extract_json(raw)
            message = parsed.get("message")
            reasoning = parsed.get("reasoning")
            if not message or not isinstance(message, str):
                raise ValueError("LLM response missing message")
            if not reasoning or not isinstance(reasoning, str):
                raise ValueError("LLM response missing reasoning")
            if payment_link not in message:
                raise ValueError("LLM message did not include the payment_link")
            return {"message": message, "reasoning": reasoning}
        except (GeminiCallError, ValueError, json.JSONDecodeError) as e:
            last_error = e

    raise GeminiCallError(f"message generation failed after retry: {last_error}")


# ---------------------------------------------------------------------------
# Deterministic fallback templates (used only when both LLM attempts fail)
# ---------------------------------------------------------------------------

_FALLBACK_TEMPLATES = {
    "retry_same_method": "Hi {name}, aapka payment {cause_hi} ho gaya tha. Please ek baar phir try kar lijiye: {link}",
    "suggest_upi": "Hi {name}, aapka payment {cause_hi} ho gaya tha. UPI se try karke dekhiye: {link}",
    "send_reminder": "Hi {name}, aapka payment {cause_hi} ho gaya tha. Jab convenient ho, is link se complete kar dijiye: {link}",
    "escalate_human": "Hi {name}, aapke payment mein baar baar dikkat aa rahi hai ({cause_hi}). Hamari team jald hi aapse contact karegi.",
}

_CAUSE_HINGLISH = {
    "insufficient_funds": "balance kam hone ki wajah se fail",
    "bank_timeout": "bank timeout ki wajah se fail",
    "3ds_dropoff": "OTP verification incomplete rehne ki wajah se fail",
    "card_declined": "card decline hone ki wajah se fail",
}


def fallback_message(customer_name: str, root_cause: str, strategy_chosen: str, payment_link: str) -> str:
    template = _FALLBACK_TEMPLATES.get(strategy_chosen, _FALLBACK_TEMPLATES["send_reminder"])
    cause_hi = _CAUSE_HINGLISH.get(root_cause, "kisi karan se fail")
    return template.format(name=customer_name, cause_hi=cause_hi, link=payment_link)
