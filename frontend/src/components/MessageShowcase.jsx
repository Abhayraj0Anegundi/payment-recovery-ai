import { CAUSE_LABELS } from '../constants'

const GENERIC_BASELINE = {
  card_declined: 'Your payment failed. Please try again using this link.',
  bank_timeout: 'Your payment failed. Please try again using this link.',
  '3ds_dropoff': 'Your payment failed. Please try again using this link.',
  insufficient_funds: 'Your payment failed. Please try again using this link.',
}

export default function MessageShowcase({ messages }) {
  if (!messages || messages.length === 0) return null

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          Message Quality — real generated output, one per cause
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Every message on the right actually came from this batch's Gemini calls. The line on the
          left is what a generic retry-bot would send instead — same failure, no cause named.
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {messages.map((m) => (
          <div key={m.transaction_id} className="grid grid-cols-1 md:grid-cols-2 gap-0">
            <div className="px-5 py-4 bg-rose-50/40 border-r border-slate-100">
              <div className="text-[10px] font-semibold text-rose-400 uppercase tracking-wide mb-1.5">
                Generic (avoid)
              </div>
              <p className="text-sm text-slate-500 italic">
                {GENERIC_BASELINE[m.root_cause] || GENERIC_BASELINE.card_declined}
              </p>
            </div>
            <div className="px-5 py-4 bg-emerald-50/40">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">
                  Actual output — {CAUSE_LABELS[m.root_cause] || m.root_cause}
                </span>
                <span className="text-[10px] text-slate-400">#{m.transaction_id} · {m.customer_name}</span>
              </div>
              <p className="text-sm text-slate-800">{m.message_text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
