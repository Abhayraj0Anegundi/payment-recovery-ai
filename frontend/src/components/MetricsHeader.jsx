import AnimatedNumber from './AnimatedNumber'

function StatCard({ label, value, decimals = 0, suffix = '', sublabel, tone = 'default' }) {
  const toneClasses = {
    default: 'text-slate-900',
    good: 'text-emerald-600',
    warn: 'text-rose-600',
  }
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex-1 min-w-[160px] transition-shadow hover:shadow-sm">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`text-3xl font-semibold mt-1 ${toneClasses[tone]}`}>
        <AnimatedNumber value={value} decimals={decimals} suffix={suffix} />
      </div>
      {sublabel && <div className="text-xs text-slate-400 mt-1">{sublabel}</div>}
    </div>
  )
}

export default function MetricsHeader({ summary }) {
  if (!summary) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <StatCard
          label="Recovery Rate"
          value={summary.recovery_rate_pct}
          decimals={1}
          suffix="%"
          sublabel={`${summary.status_counts.recovered} of ${summary.total_transactions} recovered`}
          tone="good"
        />
        <StatCard
          label="Avg Attempts to Recovery"
          value={summary.avg_attempts_to_recovery}
          decimals={2}
          sublabel="among recovered transactions"
        />
        <StatCard
          label="Needs Human"
          value={summary.needs_human_count}
          sublabel="escalated after 3 attempts"
          tone={summary.needs_human_count > 0 ? 'warn' : 'default'}
        />
        <StatCard
          label="Payment Links"
          value={summary.payment_links.real}
          sublabel={`real (Razorpay) · ${summary.payment_links.mocked} mocked after quota cap`}
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
          Funnel — Failed → Contacted → Recovered
        </div>
        <div className="flex items-center gap-2">
          {[
            { label: 'Failed', value: summary.funnel.failed, color: 'bg-slate-400' },
            { label: 'Contacted', value: summary.funnel.contacted, color: 'bg-blue-400' },
            { label: 'Recovered', value: summary.funnel.recovered, color: 'bg-emerald-500' },
          ].map((stage, i, arr) => {
            const widthPct = Math.max(6, (stage.value / arr[0].value) * 100)
            return (
              <div key={stage.label} className="flex items-center gap-2 flex-1">
                <div className="flex-1">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>{stage.label}</span>
                    <span className="font-medium text-slate-700">
                      <AnimatedNumber value={stage.value} />
                    </span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${stage.color} transition-[width] duration-700 ease-out`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
                {i < arr.length - 1 && <span className="text-slate-300 text-lg">→</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
