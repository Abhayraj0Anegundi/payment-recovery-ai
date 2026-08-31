import { useState } from 'react'
import { api } from '../api'
import { CAUSE_LABELS, STRATEGY_LABELS, formatAmount } from '../constants'

const DEMO_PRESETS = [
  { failure_code: 'bank_timeout', method: 'netbanking', name: 'Rahul Sharma', amount: 149900 },
  { failure_code: 'card_declined', method: 'card', name: 'Priya Nair', amount: 349900 },
  { failure_code: 'insufficient_funds', method: 'upi', name: 'Ananya Iyer', amount: 99900 },
  { failure_code: '3ds_dropoff', method: 'card', name: 'Vikram Reddy', amount: 249900 },
  {
    failure_code: 'other', method: 'card', name: 'Suresh Patel', amount: 199900,
    note: 'Issuing bank gateway did not respond within timeout window',
  },
]

const CUSTOM_FAILURE_OPTIONS = [
  { value: 'bank_timeout', label: 'Bank Timeout' },
  { value: 'card_declined', label: 'Card Declined' },
  { value: 'insufficient_funds', label: 'Insufficient Funds' },
  { value: '3ds_dropoff', label: '3DS Dropoff' },
  { value: 'other', label: "Other / Unclear (LLM classifies it)" },
]

const METHOD_OPTIONS = ['card', 'upi', 'netbanking']

function randomPhone() {
  return '9' + Math.floor(100000000 + Math.random() * 900000000)
}

const ACTOR_STYLES = {
  system: 'bg-slate-100 text-slate-700',
  llm: 'bg-violet-100 text-violet-700',
  customer: 'bg-blue-100 text-blue-700',
}

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

const CUSTOM_DEFAULTS = {
  name: '',
  amount: '', // rupees, as typed — converted to paise on submit
  failure_code: 'bank_timeout',
  method: 'card',
  note: '',
}

export default function LiveDemo({ onResolved }) {
  const [mode, setMode] = useState('preset') // 'preset' | 'custom'
  const [presetIdx, setPresetIdx] = useState(0)
  const [customForm, setCustomForm] = useState(CUSTOM_DEFAULTS)
  const [formError, setFormError] = useState(null)
  const [live, setLive] = useState(null) // full detail response from webhook/respond
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const preset = DEMO_PRESETS[presetIdx]

  async function triggerWith(payload) {
    setLoading(true)
    setError(null)
    try {
      const result = await api.triggerWebhook(payload)
      setLive(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function triggerPreset() {
    triggerWith({
      customer_name: preset.name,
      customer_phone: randomPhone(),
      amount: preset.amount,
      currency: 'INR',
      razorpay_failure_code: preset.failure_code,
      failure_note: preset.note || null,
      original_payment_method: preset.method,
    })
  }

  function triggerCustom() {
    const name = customForm.name.trim()
    const rupees = parseFloat(customForm.amount)

    if (!name) {
      setFormError('Enter a customer name.')
      return
    }
    if (!rupees || rupees <= 0) {
      setFormError('Enter an amount greater than 0.')
      return
    }
    if (customForm.failure_code === 'other' && !customForm.note.trim()) {
      setFormError("For 'Other', add a short gateway note — that's what the LLM classifies from.")
      return
    }
    setFormError(null)

    triggerWith({
      customer_name: name,
      customer_phone: randomPhone(),
      amount: Math.round(rupees * 100), // rupees -> paise
      currency: 'INR',
      razorpay_failure_code: customForm.failure_code,
      failure_note: customForm.failure_code === 'other' ? customForm.note.trim() : null,
      original_payment_method: customForm.method,
    })
  }

  const [pendingResponse, setPendingResponse] = useState(null)

  async function respond(response) {
    if (!live) return
    setLoading(true)
    setPendingResponse(response)
    setError(null)
    try {
      const result = await api.respondToTransaction(live.transaction.id, response)
      setLive(result)
      if (result.resolved) onResolved?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setPendingResponse(null)
    }
  }

  const txn = live?.transaction
  const isAwaitingResponse = txn?.status === 'contacted'
  const isDone = txn && !isAwaitingResponse

  return (
    <div className="bg-white border border-brand-200 rounded-2xl overflow-hidden shadow-sm shadow-brand-100">
      <div className="px-5 py-3.5 border-b border-brand-100 bg-gradient-to-r from-brand-50 to-teal-50/60">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-600 animate-pulse" />
          <div className="text-xs font-semibold text-brand-700 uppercase tracking-wide">
            Live Demo — real webhook, real pipeline, right now
          </div>
        </div>
        <p className="text-xs text-brand-500 mt-1">
          This doesn't read from the pre-run batch. It POSTs a fresh payment.failed event to
          the real /api/webhook endpoint, which runs classify → decide → Razorpay link → Gemini
          message through the exact same pipeline.py functions the batch uses.
        </p>
      </div>

      <div className="px-5 py-4 space-y-4">
        {!live && (
          <>
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
              <button
                onClick={() => setMode('preset')}
                className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                  mode === 'preset' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                }`}
              >
                Quick presets
              </button>
              <button
                onClick={() => setMode('custom')}
                className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                  mode === 'custom' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                }`}
              >
                Build your own scenario
              </button>
            </div>

            {mode === 'preset' && (
              <>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Pick a failure scenario
                  </label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {DEMO_PRESETS.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => setPresetIdx(i)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                          i === presetIdx
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'
                        }`}
                      >
                        {CAUSE_LABELS[p.failure_code] || p.failure_code}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={triggerPreset}
                  disabled={loading}
                  className="text-sm font-medium bg-brand-600 text-white rounded-full px-4 py-2 hover:bg-brand-700 disabled:opacity-70 inline-flex items-center gap-2"
                >
                  {loading && <Spinner />}
                  {loading ? 'Sending webhook…' : 'Trigger a real failed payment'}
                </button>
              </>
            )}

            {mode === 'custom' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">
                  Type your own transaction. The strategy is still picked from the fixed table —
                  you're choosing the failure, not the response to it.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500">Customer name</label>
                    <input
                      type="text"
                      value={customForm.name}
                      onChange={(e) => setCustomForm({ ...customForm, name: e.target.value })}
                      placeholder="e.g. Aditya Verma"
                      className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-200"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500">Amount (Rs.)</label>
                    <input
                      type="number"
                      min="1"
                      value={customForm.amount}
                      onChange={(e) => setCustomForm({ ...customForm, amount: e.target.value })}
                      placeholder="e.g. 2499"
                      className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-200"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500">Failure reason</label>
                    <select
                      value={customForm.failure_code}
                      onChange={(e) => setCustomForm({ ...customForm, failure_code: e.target.value })}
                      className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-200"
                    >
                      {CUSTOM_FAILURE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500">Original payment method</label>
                    <select
                      value={customForm.method}
                      onChange={(e) => setCustomForm({ ...customForm, method: e.target.value })}
                      className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-200"
                    >
                      {METHOD_OPTIONS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {customForm.failure_code === 'other' && (
                  <div>
                    <label className="text-xs font-medium text-slate-500">
                      Gateway note (what the LLM will classify from)
                    </label>
                    <input
                      type="text"
                      value={customForm.note}
                      onChange={(e) => setCustomForm({ ...customForm, note: e.target.value })}
                      placeholder="e.g. Bank did not respond before session expired"
                      className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-200"
                    />
                  </div>
                )}
                {formError && <p className="text-xs text-rose-600">{formError}</p>}
                <button
                  onClick={triggerCustom}
                  disabled={loading}
                  className="text-sm font-medium bg-brand-600 text-white rounded-full px-4 py-2 hover:bg-brand-700 disabled:opacity-70 inline-flex items-center gap-2"
                >
                  {loading && <Spinner />}
                  {loading ? 'Sending webhook…' : 'Trigger this transaction'}
                </button>
              </div>
            )}
          </>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {live && txn && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-400 font-mono">
                  Transaction #{txn.id} — created just now via webhook
                </div>
                <div className="font-semibold text-slate-800">
                  {txn.customer_name} · {formatAmount(txn.amount, txn.currency)}
                </div>
              </div>
              <span
                key={`${txn.status}-${txn.attempt_count}`}
                className="text-xs font-medium bg-slate-100 text-slate-600 rounded-full px-3 py-1 animate-card-arrive"
              >
                {txn.status} · attempt {txn.attempt_count}/3
              </span>
            </div>

            {live.decisions.map((d, i) => (
              <div key={d.id}>
                <div className="text-[11px] font-medium text-slate-400 mb-1">
                  ① Strategy decided —{' '}
                  {d.classification_method === 'llm'
                    ? 'note was ambiguous, Gemini classified the cause (still picks from the same 4 labels)'
                    : 'fixed rule table matched the failure code directly, no LLM involved'}
                </div>
                <div
                  className={`border rounded-lg p-3 text-sm transition-all ${
                    d.classification_method === 'llm'
                      ? 'border-violet-200 bg-violet-50/40'
                      : 'border-slate-200'
                  } ${i === live.decisions.length - 1 ? 'animate-card-arrive' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-slate-800">Attempt {d.attempt_number}</span>
                    <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                      {CAUSE_LABELS[d.root_cause] || d.root_cause}
                    </span>
                    <span className="text-xs bg-brand-50 text-brand-700 rounded-full px-2 py-0.5">
                      {STRATEGY_LABELS[d.strategy_chosen] || d.strategy_chosen}
                    </span>
                    <span
                      className={`text-[10px] font-semibold ml-auto uppercase tracking-wide rounded-full px-2 py-0.5 ${
                        d.classification_method === 'llm'
                          ? 'bg-violet-100 text-violet-700'
                          : 'bg-teal-100 text-teal-700'
                      }`}
                    >
                      {d.classification_method === 'llm' ? 'LLM classified' : 'Rule Table ✓'}
                    </span>
                  </div>
                  <p className="text-slate-500 text-xs">{d.reasoning_string}</p>
                  {d.suggested_retry_delay_hours != null && (
                    <div className="mt-2 pt-2 border-t border-slate-100 flex items-start gap-1.5">
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 shrink-0">
                        ADAPTIVE
                      </span>
                      <p className="text-slate-500 text-[11px]">
                        Suggested next-retry delay: <span className="font-semibold text-slate-700">{d.suggested_retry_delay_hours}h</span>
                        {' — '}{d.retry_delay_reasoning}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {live.messages.map((m, i) => (
              <div key={m.id}>
                <div className="text-[11px] font-medium text-slate-400 mb-1">
                  ② Message written by Gemini — Hinglish copy naming the actual failure reason, real Razorpay link attached
                </div>
                <div
                  className={`bg-teal-50 border border-teal-100 rounded-xl rounded-tl-none p-3 text-sm max-w-md transition-all ${
                    i === live.messages.length - 1 ? 'animate-card-arrive' : ''
                  }`}
                >
                  <p className="text-slate-800">{m.message_text}</p>
                  <p className="text-[10px] text-slate-400 mt-1 truncate">{m.payment_link}</p>
                </div>
              </div>
            ))}

            {isAwaitingResponse && (
              <div>
                <div className="text-[11px] font-medium text-slate-400 mb-1">
                  ③ Your move — simulate how the customer responds to the message above
                </div>
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                  Simulate what the customer does next
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => respond('paid')}
                    disabled={loading}
                    className="text-sm font-medium bg-teal-600 text-white rounded-full px-4 py-1.5 hover:bg-teal-700 disabled:opacity-70 inline-flex items-center gap-1.5"
                  >
                    {pendingResponse === 'paid' && <Spinner />}
                    Customer paid
                  </button>
                  <button
                    onClick={() => respond('promise_to_pay')}
                    disabled={loading}
                    className="text-sm font-medium bg-amber-500 text-white rounded-full px-4 py-1.5 hover:bg-amber-600 disabled:opacity-70 inline-flex items-center gap-1.5"
                  >
                    {pendingResponse === 'promise_to_pay' && <Spinner />}
                    Promise to pay
                  </button>
                  <button
                    onClick={() => respond('ignored')}
                    disabled={loading}
                    className="text-sm font-medium bg-rose-500 text-white rounded-full px-4 py-1.5 hover:bg-rose-600 disabled:opacity-70 inline-flex items-center gap-1.5"
                  >
                    {pendingResponse === 'ignored' && <Spinner />}
                    Customer ignored
                  </button>
                </div>
              </div>
            )}

            {isDone && (
              <div className="text-sm text-slate-500">
                Final status: <span className="font-semibold text-slate-800">{txn.status}</span>
                {txn.status === 'needs_human' && ' — 3 attempts exhausted, escalated for real, just now.'}
              </div>
            )}

            <details className="text-xs">
              <summary className="cursor-pointer text-slate-400 font-medium">
                Full audit trail ({live.audit_log.length} rows)
              </summary>
              <div className="mt-2 border border-slate-200 rounded-lg divide-y divide-slate-100">
                {live.audit_log.map((a) => (
                  <div key={a.id} className="px-3 py-2 flex items-start gap-2">
                    <span className="text-slate-400 font-mono shrink-0 w-32">{a.timestamp}</span>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 font-medium ${ACTOR_STYLES[a.actor] || 'bg-slate-100'}`}>
                      {a.actor}
                    </span>
                    <span className="shrink-0 font-medium text-slate-600 w-40">{a.action}</span>
                    <span className="text-slate-500">{a.reasoning_string}</span>
                  </div>
                ))}
              </div>
            </details>

            <button
              onClick={() => { setLive(null); setError(null); setFormError(null); setCustomForm(CUSTOM_DEFAULTS) }}
              className="text-xs text-slate-400 underline"
            >
              Reset — trigger another live demo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
