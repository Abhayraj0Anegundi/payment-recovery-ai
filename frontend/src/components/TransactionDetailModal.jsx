import { useEffect, useState } from 'react'
import { api } from '../api'
import { CAUSE_LABELS, STRATEGY_LABELS, formatAmount } from '../constants'

const ACTOR_STYLES = {
  system: 'bg-slate-100 text-slate-700',
  llm: 'bg-violet-100 text-violet-700',
  customer: 'bg-blue-100 text-blue-700',
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
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {error && <div className="p-6 text-rose-600">Error: {error}</div>}
        {!detail && !error && <div className="p-6 text-slate-400">Loading…</div>}
        {detail && (
          <>
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-400 font-mono">Transaction #{detail.transaction.id}</div>
                <h2 className="text-lg font-semibold text-slate-800">
                  {detail.transaction.customer_name}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none px-2"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-4 space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-xs text-slate-400">Amount</div>
                  <div className="font-medium">
                    {formatAmount(detail.transaction.amount, detail.transaction.currency)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Failure Code</div>
                  <div className="font-medium">{detail.transaction.razorpay_failure_code}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Status</div>
                  <div className="font-medium">{detail.transaction.status}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Attempts</div>
                  <div className="font-medium">{detail.transaction.attempt_count} / 3</div>
                </div>
              </div>

              {detail.decisions.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Decisions</h3>
                  <div className="space-y-2">
                    {detail.decisions.map((d) => (
                      <div key={d.id} className="border border-slate-200 rounded-lg p-3 text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-slate-800">Attempt {d.attempt_number}</span>
                          <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                            {CAUSE_LABELS[d.root_cause] || d.root_cause}
                          </span>
                          <span className="text-xs bg-indigo-50 text-indigo-700 rounded-full px-2 py-0.5">
                            {STRATEGY_LABELS[d.strategy_chosen] || d.strategy_chosen}
                          </span>
                          <span className="text-[10px] text-slate-400 ml-auto uppercase tracking-wide">
                            {d.classification_method === 'llm' ? 'LLM classified' : 'Rule-based'}
                          </span>
                        </div>
                        <p className="text-slate-500 text-xs">{d.reasoning_string}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {detail.messages.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">WhatsApp Messages (mock)</h3>
                  <div className="space-y-2">
                    {detail.messages.map((m) => (
                      <div key={m.id} className="bg-emerald-50 border border-emerald-100 rounded-lg rounded-tl-none p-3 text-sm max-w-md">
                        <p className="text-slate-800">{m.message_text}</p>
                        <p className="text-[10px] text-slate-400 mt-1 truncate">{m.payment_link}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Audit Trail</h3>
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {detail.audit_log.map((a) => (
                    <div key={a.id} className="px-3 py-2 text-xs flex items-start gap-2">
                      <span className="text-slate-400 font-mono shrink-0 w-32">{a.timestamp}</span>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 font-medium ${
                          ACTOR_STYLES[a.actor] || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {a.actor}
                      </span>
                      <span className="shrink-0 font-medium text-slate-600 w-40">{a.action}</span>
                      <span className="text-slate-500">{a.reasoning_string}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
