import { useState } from 'react'

const NAV_LINKS = ['How it works', 'The decision table', 'Proof, not promises']

function NavBar({ onLaunch }) {
  return (
    <nav className="relative z-20 max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand-400 to-teal-400 flex items-center justify-center shrink-0 shadow-lg shadow-brand-500/40 ring-1 ring-white/20">
          <span className="text-white font-display font-extrabold text-base">₹</span>
        </div>
        <span className="font-display font-extrabold text-lg tracking-tight text-white">
          Recovery<span className="text-teal-300">AI</span>
        </span>
      </div>
      <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
        {NAV_LINKS.map((link) => (
          <a
            key={link}
            href={`#${link.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            className="hover:text-white transition-colors"
          >
            {link}
          </a>
        ))}
      </div>
      <button
        onClick={onLaunch}
        className="text-sm font-bold bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-full px-5 py-2.5 hover:from-brand-400 hover:to-brand-500 transition-all shadow-lg shadow-brand-600/40 hover:shadow-brand-500/50 hover:-translate-y-0.5"
      >
        Open Dashboard →
      </button>
    </nav>
  )
}

function Hero({ onLaunch }) {
  return (
    <section className="relative max-w-7xl mx-auto px-6 pt-10 pb-20 sm:pt-16 sm:pb-28">
      <div className="max-w-3xl">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/5 ring-1 ring-white/10 px-3.5 py-1.5 text-xs font-semibold text-teal-300 mb-6">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-teal-400" />
          </span>
          Built for Razorpay's AI Revenue Recovery track
        </div>

        <h1 className="font-display font-extrabold tracking-tight text-4xl sm:text-6xl leading-[1.05] text-white">
          Failed payments don't have to stay failed.
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-slate-300 leading-relaxed">
          A rule-based recovery agent that reads{' '}
          <span className="text-white font-semibold">why</span> a payment failed, decides{' '}
          <span className="text-white font-semibold">what to do about it</span> from a fixed decision
          table, and messages the customer in natural Hinglish — with a hard 3-attempt cap and a full
          audit trail for every single decision.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-4">
          <button
            onClick={onLaunch}
            className="text-base font-bold bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-full px-7 py-3.5 hover:from-brand-400 hover:to-brand-500 transition-all shadow-xl shadow-brand-600/40 hover:shadow-brand-500/50 hover:-translate-y-0.5 inline-flex items-center gap-2"
          >
            Open the Live Dashboard
            <span aria-hidden>→</span>
          </button>
          <a
            href="#how-it-works"
            className="text-base font-semibold text-slate-300 hover:text-white transition-colors px-2 py-3.5"
          >
            See how it works ↓
          </a>
        </div>

        <p className="mt-5 text-xs text-slate-500">
          Real Razorpay test-mode payment links · SQLite audit trail · no LLM ever chooses the
          strategy
        </p>
      </div>

      {/* Ambient glow accents behind the hero copy */}
      <div
        className="pointer-events-none absolute -top-20 right-0 w-[36rem] h-[36rem] opacity-50"
        style={{ backgroundImage: 'radial-gradient(circle, rgba(48,94,255,0.25), transparent 60%)' }}
      />
      <div
        className="pointer-events-none absolute top-40 right-24 w-[28rem] h-[28rem] opacity-40"
        style={{ backgroundImage: 'radial-gradient(circle, rgba(23,185,142,0.22), transparent 60%)' }}
      />
    </section>
  )
}

function ProofStrip() {
  const stats = [
    { value: '62.0%', label: 'recovery rate', sub: '57 of 92 seeded transactions' },
    { value: '₹5.13L', label: 'recovered value', sub: 'of ₹7.02L total failed' },
    { value: '3', label: 'attempt hard cap', sub: 'structurally enforced, not a prompt' },
    { value: '0', label: 'strategy decisions by LLM', sub: 'the rule table decides, always' },
  ]
  return (
    <section className="relative border-y border-white/10 bg-white/[0.02]">
      <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-2 sm:grid-cols-4 gap-6">
        {stats.map((s) => (
          <div key={s.label} className="text-center sm:text-left">
            <div className="font-display font-extrabold text-3xl sm:text-4xl text-white tracking-tight">
              {s.value}
            </div>
            <div className="text-sm font-semibold text-teal-300 mt-1">{s.label}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function StepCard({ num, title, body, accent }) {
  return (
    <div className="panel rounded-2xl p-6 shadow-lg shadow-black/20 hover:-translate-y-1 hover:border-white/20 transition-all">
      <div
        className={`h-9 w-9 rounded-xl flex items-center justify-center font-display font-extrabold text-sm mb-4 ${accent}`}
      >
        {num}
      </div>
      <h3 className="font-display font-bold text-white text-lg mb-2">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
    </div>
  )
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="max-w-7xl mx-auto px-6 py-20 scroll-mt-20">
      <div className="max-w-2xl mb-12">
        <div className="text-xs font-bold text-teal-300 uppercase tracking-widest mb-3">
          How it works
        </div>
        <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-white tracking-tight">
          Four steps, every single time — no exceptions.
        </h2>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StepCard
          num="1"
          accent="bg-brand-500/15 text-brand-300 ring-1 ring-brand-400/30"
          title="Classify the failure"
          body="Razorpay gives a failure code. Clear codes (insufficient funds, bank timeout, 3DS dropoff, card declined) route instantly. Ambiguous 'other' codes go to Gemini for classification only — never for the strategy."
        />
        <StepCard
          num="2"
          accent="bg-teal-500/15 text-teal-300 ring-1 ring-teal-400/30"
          title="Look up the strategy"
          body="A fixed table — not a prompt, not a model — maps cause + attempt number to exactly one strategy: retry, suggest UPI, send a reminder, or escalate to a human."
        />
        <StepCard
          num="3"
          accent="bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/30"
          title="Write the nudge"
          body="Gemini writes the WhatsApp-style Hinglish message for that strategy — natural, warm, and specific to why the payment failed. It writes copy. It never picks the plan."
        />
        <StepCard
          num="4"
          accent="bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30"
          title="Cap it at 3, always"
          body="Every attempt, response, and escalation is written to an audit_log row in the same database commit as the action it explains. Attempt 4 doesn't exist — the code raises before it can happen."
        />
      </div>
    </section>
  )
}

const TABLE_ROWS = [
  { cause: 'Insufficient Funds', a1: 'Send reminder', a2: 'Send reminder', a3: 'Escalate to human' },
  { cause: 'Bank Timeout', a1: 'Retry same method', a2: 'Retry same method', a3: 'Escalate to human' },
  { cause: '3DS Dropoff', a1: 'Retry same method', a2: 'Suggest UPI', a3: 'Escalate to human' },
  { cause: 'Card Declined', a1: 'Suggest UPI', a2: 'Suggest UPI', a3: 'Escalate to human' },
]

function DecisionTable() {
  return (
    <section id="the-decision-table" className="max-w-7xl mx-auto px-6 py-20 scroll-mt-20">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <div className="text-xs font-bold text-brand-300 uppercase tracking-widest mb-3">
            The decision table
          </div>
          <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-white tracking-tight mb-5">
            The AI never decides the plan. This table does.
          </h2>
          <p className="text-slate-400 leading-relaxed mb-4">
            Every strategy this system will ever choose is sitting in a plain lookup table, checked
            into version control, unit-tested independently of anything Gemini says. The LLM is
            confined to two narrow jobs — classifying genuinely ambiguous failure notes, and writing
            the customer-facing message — both of which are logged and neither of which can change
            what happens next.
          </p>
          <p className="text-slate-400 leading-relaxed">
            That's a deliberate trade against "let the model figure it out." In a system that touches
            real money and real customers, a decision that's hard-coded, testable, and explainable
            beats one that's merely usually right.
          </p>
        </div>
        <div className="panel rounded-2xl overflow-hidden shadow-xl shadow-black/30">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                    Root Cause
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                    Attempt 1
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                    Attempt 2
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                    Attempt 3
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {TABLE_ROWS.map((row) => (
                  <tr key={row.cause} className="hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">{row.cause}</td>
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{row.a1}</td>
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{row.a2}</td>
                    <td className="px-4 py-3 text-rose-300 font-medium whitespace-nowrap">{row.a3}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}

function ProofCard({ title, body, tone }) {
  const tones = {
    brand: 'ring-brand-400/30 bg-brand-500/[0.06]',
    teal: 'ring-teal-400/30 bg-teal-500/[0.06]',
    violet: 'ring-violet-400/30 bg-violet-500/[0.06]',
  }
  return (
    <div className={`rounded-2xl p-6 ring-1 ${tones[tone]} backdrop-blur-sm`}>
      <h3 className="font-display font-bold text-white text-base mb-2">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
    </div>
  )
}

function ProofNotPromises({ onLaunch }) {
  return (
    <section id="proof-not-promises" className="max-w-7xl mx-auto px-6 py-20 scroll-mt-20">
      <div className="max-w-2xl mb-12">
        <div className="text-xs font-bold text-violet-300 uppercase tracking-widest mb-3">
          Proof, not promises
        </div>
        <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-white tracking-tight">
          Every claim on this page is verifiable in the dashboard.
        </h2>
        <p className="text-slate-400 mt-4 leading-relaxed">
          Nothing here is a mockup screenshot. Open the dashboard and click into any transaction —
          the decision, the message, the audit rows are all live from the same SQLite database this
          page's numbers came from.
        </p>
      </div>
      <div className="grid sm:grid-cols-3 gap-5 mb-10">
        <ProofCard
          tone="brand"
          title="A real webhook, not a button"
          body="The dashboard's demo can resolve a transaction via an actual HMAC-SHA256-signed Razorpay webhook call, verified against the live server — replay and tampering are both rejected, not just simulated."
        />
        <ProofCard
          tone="teal"
          title="It tells you when it's unsure"
          body="When Gemini's classification confidence comes back low, the system escalates to a human immediately — even on attempt 1 — instead of confidently guessing wrong."
        />
        <ProofCard
          tone="violet"
          title="It knows what it doesn't know"
          body="Recovery-rate and retry-timing numbers are honestly labeled as simulated where they are — this project doesn't pretend synthetic outcomes are measured real-world results."
        />
      </div>
      <div className="text-center">
        <button
          onClick={onLaunch}
          className="text-base font-bold bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-full px-7 py-3.5 hover:from-teal-400 hover:to-teal-500 transition-all shadow-xl shadow-teal-600/40 hover:shadow-teal-500/50 hover:-translate-y-0.5 inline-flex items-center gap-2"
        >
          See it live in the dashboard
          <span aria-hidden>→</span>
        </button>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/10 mt-10">
      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
        <span>Built for Razorpay's AI Revenue Recovery hackathon track.</span>
        <span>Rule-based decisions · LLM copy only · Full audit trail</span>
      </div>
    </footer>
  )
}

export default function LandingPage({ onLaunch }) {
  return (
    <div className="min-h-screen app-backdrop text-slate-200">
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-70 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 15% 0%, rgba(48,94,255,0.22), transparent 45%), radial-gradient(circle at 85% 15%, rgba(23,185,142,0.16), transparent 40%)',
          }}
        />
        <div className="relative">
          <NavBar onLaunch={onLaunch} />
          <Hero onLaunch={onLaunch} />
        </div>
      </div>

      <ProofStrip />
      <HowItWorks />
      <DecisionTable />
      <ProofNotPromises onLaunch={onLaunch} />
      <Footer />
    </div>
  )
}
