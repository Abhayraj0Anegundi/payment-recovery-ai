import { CAUSE_LABELS } from '../constants'

export default function AdaptiveInsight({ insight }) {
  if (!insight || !insight.available) return null

  return (
    <div className="bg-amber-50/70 border border-amber-200 rounded-2xl px-5 py-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
          What the outcome data suggests — not yet acted on
        </div>
      </div>
      <p className="text-sm text-slate-700">
        <span className="font-semibold">{CAUSE_LABELS[insight.weakest_cause] || insight.weakest_cause}</span>{' '}
        recovers at only{' '}
        <span className="font-display font-bold text-amber-700">
          {insight.per_cause.find((c) => c.cause === insight.weakest_cause)?.recovery_rate_pct}%
        </span>{' '}
        vs <span className="font-semibold">{CAUSE_LABELS[insight.strongest_cause] || insight.strongest_cause}</span> at{' '}
        <span className="font-display font-bold text-teal-700">
          {insight.per_cause.find((c) => c.cause === insight.strongest_cause)?.recovery_rate_pct}%
        </span> —
        a real gap visible in the audit trail this system already logs.
      </p>
      <p className="text-sm text-slate-600 mt-2">{insight.suggested_next_step}</p>
      <p className="text-xs text-amber-600/80 mt-3 italic">{insight.note}</p>
    </div>
  )
}
