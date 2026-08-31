import { useEffect, useState } from 'react'
import { api } from '../api'
import { CAUSE_LABELS, STRATEGY_LABELS, formatAmount } from '../constants'

const ACTOR_STYLES = {
  system: 'bg-white/10 text-slate-300',
  llm: 'bg-violet-400/15 text-violet-300',
  customer: 'bg-brand-400/15 text-brand-300',
}

export default function TransactionDetailModal({ transactionId, onClose }) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (transactionId == null) return
    setDetail(null)
    setError(null)
    api
      .transactionDetail(transactionId)
      .then(setDetail)
      .catch((e) => setError(e.message))
  }, [transactionId])

  if (transactionId == null) return null

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gradient-to-br from-slate-900 to-slate-950 ring-1 ring-white/10 rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        {error && <div className="p-6 text-rose-400">Error: {error}</div>}
        {!detail && !error && <div className="p-6 text-slate-500">Loading…</div>}
        {detail && (
          <>
            <div className="sticky top-0 bg-slate-900/95 backdrop-blur border-b border-white/10 px-6 py-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 font-mono">Transaction #{detail.transaction.id}</div>
                <h2 className="text-lg font-display font-bold text-white flex items-center gap-2">
                  {detail.transaction.customer_name}
                  {detail.audit_log.some((a) => a.action === 'verified_real_response') && (
                    <span
                      className="text-[10px] font-bold uppercase tracking-wide bg-teal-400/15 text-teal-300 ring-1 ring-teal-400/40 rounded-full px-2 py-0.5"
                      title="Resolved by a real, cryptographically-verified Razorpay webhook (HMAC-SHA256 signature checked) — not a demo button click."
                    >
                      ✓ Real webhook confirmed
                    </span>
                  )}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="text-slate-500 hover:text-slate-200 text-xl leading-none px-2 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-4 space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-xs text-slate-500">Amount</div>
                  <div className="font-medium text-slate-200">
                    {formatAmount(detail.transaction.amount, detail.transaction.currency)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Failure Code</div>
                  <div className="font-medium text-slate-200">{detail.transaction.razorpay_failure_code}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Status</div>
                  <div className="font-medium text-slate-200">{detail.transaction.status}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Attempts</div>
                  <div className="font-medium text-slate-200">{detail.transaction.attempt_count} / 3</div>
                </div>
              </div>

              {detail.decisions.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">Decisions</h3>
                  <div className="space-y-2">
                    {detail.decisions.map((d) => (
                      <div key={d.id} className="border border-white/10 bg-white/[0.03] rounded-lg p-3 text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-slate-100">Attempt {d.attempt_number}</span>
                          <span className="text-xs bg-white/10 text-slate-300 rounded-full px-2 py-0.5">
                            {CAUSE_LABELS[d.root_cause] || d.root_cause}
                          </span>
                          <span className="text-xs bg-brand-400/15 text-brand-300 rounded-full px-2 py-0.5">
                            {STRATEGY_LABELS[d.strategy_chosen] || d.strategy_chosen}
                          </span>
                          <span className="text-[10px] text-slate-500 ml-auto uppercase tracking-wide">
                            {d.classification_method === 'llm' ? 'LLM classified' : 'Rule-based'}
                          </span>
                        </div>
                        {d.classification_confidence && (
                          <div className="mb-1.5">
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                                d.classification_confidence === 'high'
                                  ? 'bg-teal-400/10 text-teal-300 ring-1 ring-teal-400/30'
                                  : d.classification_confidence === 'medium'
                                  ? 'bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/30'
                                  : 'bg-rose-400/10 text-rose-300 ring-1 ring-rose-400/30'
                              }`}
                            >
                              {d.classification_confidence} confidence
                              {d.classification_confidence === 'low' && ' → auto-escalated'}
                            </span>
                          </div>
                        )}
                        <p className="text-slate-400 text-xs">{d.reasoning_string}</p>
                        {d.suggested_retry_delay_hours != null && (
                          <div className="mt-2 pt-2 border-t border-white/10 flex items-start gap-1.5">
                            <span className="text-[10px] font-semibold text-amber-300 bg-amber-400/10 ring-1 ring-amber-400/30 rounded-full px-2 py-0.5 shrink-0">
                              ADAPTIVE
                            </span>
                            <p className="text-slate-400 text-[11px]">
                              Suggested next-retry delay: <span className="font-semibold text-slate-200">{d.suggested_retry_delay_hours}h</span>
                              {' — '}{d.retry_delay_reasoning}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {detail.messages.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">WhatsApp Messages (mock)</h3>
                  <div className="space-y-2">
                    {detail.messages.map((m) => (
                      <div key={m.id} className="bg-teal-400/10 border border-teal-400/25 rounded-xl rounded-tl-none p-3 text-sm max-w-md">
                        <p className="text-slate-100">{m.message_text}</p>
                        <p className="text-[10px] text-slate-500 mt-1 truncate">{m.payment_link}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h3 className="text-sm font-semibold text-slate-300 mb-2">Audit Trail</h3>
                <div className="border border-white/10 rounded-lg divide-y divide-white/10 bg-black/20">
                  {detail.audit_log.map((a) => {
                    const isRealWebhook =
                      a.action === 'razorpay_webhook_verified' || a.action === 'verified_real_response'
                    return (
                      <div
                        key={a.id}
                        className={`px-3 py-2 text-xs flex items-start gap-2 ${
                          isRealWebhook ? 'bg-teal-400/[0.06]' : ''
                        }`}
                      >
                        <span className="text-slate-500 font-mono shrink-0 w-32">{a.timestamp}</span>
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 font-medium ${
                            ACTOR_STYLES[a.actor] || 'bg-white/10 text-slate-300'
                          }`}
                        >
                          {a.actor}
                        </span>
                        <span
                          className={`shrink-0 font-medium w-40 ${
                            isRealWebhook ? 'text-teal-300' : 'text-slate-300'
                          }`}
                        >
                          {isRealWebhook && '🔒 '}{a.action}
                        </span>
                        <span className="text-slate-500">{a.reasoning_string}</span>
                      </div>
                    )
                  })}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
