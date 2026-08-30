import { CAUSE_LABELS } from '../constants'

export default function AdaptiveInsight({ insight }) {
  if (!insight || !insight.available) return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
      <div className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-2">
        What the outcome data suggests — not yet acted on
      </div>
      <p className="text-sm text-slate-700">
        <span className="font-semibold">{CAUSE_LABELS[insight.weakest_cause] || insight.weakest_cause}</span>{' '}
        recovers at only <span className="font-semibold">{insight.per_cause.find((c) => c.cause === insight.weakest_cause)?.recovery_rate_pct}%</span>{' '}
        vs <span className="font-semibold">{CAUSE_LABELS[insight.strongest_cause] || insight.strongest_cause}</span> at{' '}
        <span className="font-semibold">{insight.per_cause.find((c) => c.cause === insight.strongest_cause)?.recovery_rate_pct}%</span> —
        a real gap visible in the audit trail this system already logs.
      </p>
      <p className="text-sm text-slate-600 mt-2">{insight.suggested_next_step}</p>
      <p className="text-xs text-amber-600/80 mt-3 italic">{insight.note}</p>
    </div>
  )
}
