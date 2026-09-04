# Video Script — AI Revenue Recovery (4:00–4:30)

**How to use this:** left column = what's on screen, right column = what you say.
Timestamps are targets, not hard cuts — pace to feel natural, not rushed. Practice
reading it out loud 2-3 times before recording; you'll naturally trim ~10-15% once
you're not reading cold, which lands you right in the 4:00-4:30 window.

Live URL to have open and ready: **https://payment-recovery-ai.onrender.com**
⚠️ Visit it ~2 minutes before you start recording so the free-tier instance is
already awake (cold start can take up to 50s otherwise).

---

## [0:00–0:20] Hook — the problem, stated as money, not features

| Screen | Say |
|---|---|
| Landing page hero — "Failed payments don't have to stay failed." | "Every payment gateway in India fails some transactions — bank timeout, insufficient funds, a dropped OTP screen. Most businesses just... eat that loss. This is a system that doesn't." |
| Scroll slowly to reveal the proof-stat strip (62.0% / ₹5.13L / 3 / 0) | "It's a recovery agent for Razorpay's AI Revenue Recovery track — and I built it around one rule: the AI is never allowed to decide what happens to your customer's payment. A fixed table decides. The AI only explains and writes the message." |

---

## [0:20–1:00] What it actually does — the mechanism, fast

| Screen | Say |
|---|---|
| Scroll to "How it works" 4-step cards | "Here's the loop. One — Razorpay tells us why a payment failed. Two — a fixed decision table, not a prompt, picks the strategy: retry, suggest UPI, send a reminder, or escalate to a human. Three — Gemini writes a natural Hinglish WhatsApp message explaining *why* it failed, not a generic 'please try again.' Four — it's capped at exactly three attempts, enforced in code, not policy." |
| Scroll to the decision table screenshot section | "This table right here — that's the whole brain of the strategy layer. No LLM touches it. I can show you the line in the code that makes it structurally impossible to go past attempt three — it raises an error, not a suggestion." |

---

## [1:00–2:30] Live demo — the centerpiece, do this live and unscripted

*This is your strongest asset. Actually click through it live — don't narrate over a
recording. If a step takes a few seconds (Gemini call), let it breathe, don't rush.*

| Screen | Say |
|---|---|
| Click "Open Dashboard" | "Let me show you this actually running — live, right now, not a mockup." |
| Point at "Outcomes at a glance" panel | "This is real data from 92 processed transactions — 62% recovered, and every number here is computed live from the database, not hard-coded into the page." |
| Scroll to Live Demo panel, pick "Bank Timeout" preset | "Let's trigger a real failed payment. This isn't reading from a pre-built batch — it's about to hit my actual backend, live." |
| Click "Trigger a real failed payment" — wait for it to resolve | "Watch — it just classified the cause, picked 'retry same method' from the fixed table, calculated a data-driven retry delay from this dataset's own recovery history, created a real Razorpay payment link, and had Gemini write this Hinglish message — all in the last few seconds." |
| Read the generated message aloud | "[read the actual Hinglish message it generated] — that's not a template. That's Gemini, writing fresh, naming the actual reason it failed." |
| Switch to "Build your own scenario" → "Other" → type a vague note live, e.g. "payment didn't work idk" | "Now here's the part I'm proudest of. Let's try to break it — I'll give it a genuinely useless failure note." |
| Submit, point at the confidence badge | "Look — it self-reported LOW confidence, and instead of guessing and sending a nudge anyway, it escalated straight to a human. That's not a display feature — that's the code refusing to act on a guess it isn't sure about." |

---

## [2:30–3:15] Proof it's not just theater

| Screen | Say |
|---|---|
| Scroll to System Guarantees panel | "Everything I just said is checkable, not just claimed. Zero of these decisions were made by the LLM — that number is computed live from the audit log. Every single message, decision, and escalation is written to a database row in the same commit as the action it explains." |
| (Optional, if time allows) briefly mention the real webhook | "There's also a real cryptographically-signed Razorpay webhook behind this — HMAC verified, replay-protected, tamper-protected — I didn't demo it live today because that needs a public tunnel running during judging, but it's fully tested end to end, and it's documented." |
| Scroll to Revenue Impact panel | "And because a percentage doesn't mean much to a business owner — here's the same result in rupees. ₹5.13 lakh recovered out of ₹7 lakh that failed. Without this pipeline, that's zero, by definition — that's literally what 'no recovery system' means." |

---

## [3:15–3:50] The honesty angle — say the quiet part

| Screen | Say |
|---|---|
| Scroll to "Read this first" section of the README, or just speak to camera | "One more thing, because I think it matters: I'm not going to pretend this is perfect. Some of these payment links are mocked because Razorpay's test quota caps at 30 — that's disclosed, not hidden. The recovery-rate numbers come from a simulated customer-response model, also disclosed. What's real is the entire pipeline — classification, decision, message generation, and the audit trail. What's simulated is only whether a fake customer says yes." |

---

## [3:50–4:15] Close

| Screen | Say |
|---|---|
| Back to landing page or dashboard, wide shot | "This is live right now at this URL — you can go try to break it yourself. It's not a slide deck pretending to be a product. It's a working system, with a hard-coded safety net, a full audit trail, and Gemini kept exactly where it belongs — writing the words, never making the call." |
| End card / your name | "Thanks for watching." |

---

## Delivery notes

- **Don't memorize word-for-word** — know the beats, say them naturally. A slightly
  imperfect live delivery reads as more credible than a stiff, over-rehearsed one.
- **The live demo section is the one part you should NOT compress** — it's your proof,
  not just your feature list. Everything else can be trimmed if you're running long;
  this section shouldn't be.
- **If Gemini is slow one time**, don't panic-fill silence — a beat of "give it a
  second, it's actually calling a real API" is more convincing than dead air with no
  explanation.
- **Have a backup plan for the confidence-escalation demo**: if you're worried about
  typing something convincingly vague live, pre-decide your input beforehand (e.g.
  "payment didn't go through, not sure why") so you're not stalling on-camera.
- **Cut for time first from**: the webhook mention (optional line, marked above) and
  the "How it works" 4-step walkthrough (can be tightened to 2 sentences) — not from
  the live demo or the honesty section, those are your differentiators.
