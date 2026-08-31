import AnimatedNumber from './AnimatedNumber'
import SyntheticDataBadge from './SyntheticDataBadge'

function StatCard({ label, value, decimals = 0, suffix = '', sublabel, tone = 'default', featured = false }) {
  const toneClasses = {
    default: 'text-white',
    good: 'text-teal-300',
    warn: 'text-rose-300',
  }
  return (
    <div
      className={`rounded-2xl px-5 py-4 flex-1 min-w-[160px] transition-all hover:-translate-y-0.5 ${
        featured
          ? 'bg-gradient-to-br from-brand-600 to-brand-800 shadow-lg shadow-brand-900/50 ring-1 ring-brand-400/30'
          : 'panel shadow-lg shadow-black/20 hover:border-white/20'
      }`}
    >
      <div
        className={`text-xs font-semibold uppercase tracking-wide ${
          featured ? 'text-brand-100' : 'text-slate-400'
        }`}
      >
        {label}
      </div>
      <div
        className={`font-display font-extrabold mt-1 tracking-tight ${
          featured ? 'text-4xl text-white' : `text-3xl ${toneClasses[tone]}`
        }`}
      >
        <AnimatedNumber
          value={value}
          decimals={decimals}
          suffix={suffix}
          flashClassName={featured ? 'text-teal-200 scale-110' : 'text-brand-300 scale-110'}
        />
      </div>
      {sublabel && (
        <div className={`text-xs mt-1 ${featured ? 'text-brand-100/80' : 'text-slate-500'}`}>{sublabel}</div>
      )}
      {featured && <SyntheticDataBadge className="mt-2 !bg-white/10 !text-brand-100 !ring-white/20" />}
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
          featured
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

      <div className="panel rounded-2xl px-5 py-4 shadow-lg shadow-black/20">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
          Funnel — Failed → Contacted → Recovered
        </div>
        <div className="flex items-center gap-2">
          {[
            { label: 'Failed', value: summary.funnel.failed, color: 'bg-slate-500' },
            { label: 'Contacted', value: summary.funnel.contacted, color: 'bg-gradient-to-r from-brand-500 to-brand-400' },
            { label: 'Recovered', value: summary.funnel.recovered, color: 'bg-gradient-to-r from-teal-500 to-teal-400' },
          ].map((stage, i, arr) => {
            const widthPct = Math.max(6, (stage.value / arr[0].value) * 100)
            return (
              <div key={stage.label} className="flex items-center gap-2 flex-1">
                <div className="flex-1">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>{stage.label}</span>
                    <span className="font-semibold text-slate-200">
                      <AnimatedNumber value={stage.value} />
                    </span>
                  </div>
                  <div className="h-3 bg-white/5 rounded-full overflow-hidden ring-1 ring-white/5">
                    <div
                      className={`h-full rounded-full ${stage.color} transition-[width] duration-700 ease-out`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
                {i < arr.length - 1 && <span className="text-slate-600 text-lg">→</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
