import AnimatedNumber from './AnimatedNumber'
import SyntheticDataBadge from './SyntheticDataBadge'

export default function RevenueImpact({ impact }) {
  if (!impact) return null
  const { measured, projection, counterfactual } = impact

  return (
    <div className="panel rounded-2xl overflow-hidden shadow-lg shadow-black/20">
      <div className="px-5 py-3 border-b border-white/10">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Revenue Impact — money, not just percentages
          </div>
          <SyntheticDataBadge />
        </div>
        <p className="text-[11px] text-slate-500 mt-1">
          The badge above applies to the whole panel: the rupee amounts below are real sums
          over this dataset's actual transaction values, but WHETHER a given transaction
          recovered is drawn from the same simulated outcomes as everywhere else on this
          dashboard — see the "Read this first" section in the README.
        </p>
      </div>

      <div className="px-5 py-4">
        {/* Measured: real rupee sums over this dataset's actual transaction amounts */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wide">Recovered</div>
            <div className="font-display text-3xl font-extrabold text-teal-300 tracking-tight">
              <AnimatedNumber
                value={measured.recovered_rupees}
                decimals={0}
                prefix="₹"
                groupDigits
                flashClassName="text-teal-200 scale-110"
              />
            </div>
            <div className="text-xs text-slate-500 mt-1">
              of ₹{measured.total_failed_value_rupees.toLocaleString('en-IN')} in failed-payment value
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wide">In progress</div>
            <div className="font-display text-3xl font-extrabold text-amber-300 tracking-tight">
              <AnimatedNumber
                value={measured.promised_not_yet_recovered_rupees}
                decimals={0}
                prefix="₹"
                groupDigits
                flashClassName="text-amber-200 scale-110"
              />
            </div>
            <div className="text-xs text-slate-500 mt-1">promised to pay, not yet counted as recovered</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wide">Avg. transaction</div>
            <div className="font-display text-3xl font-extrabold text-white tracking-tight">
              <AnimatedNumber
                value={measured.avg_transaction_value_rupees}
                decimals={0}
                prefix="₹"
                groupDigits
              />
            </div>
            <div className="text-xs text-slate-500 mt-1">across {measured.transaction_count} transactions</div>
          </div>
        </div>

        {/* Counterfactual: with vs. without this pipeline, made visual so
            the gap is felt, not just read as text. */}
        {counterfactual && (
          <div className="mb-5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              {counterfactual.label} vs. with it
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-28 shrink-0">Without pipeline</span>
                <div className="flex-1 h-6 bg-white/5 rounded-full overflow-hidden ring-1 ring-white/10">
                  <div className="h-full w-[2%] bg-rose-500/60 rounded-full" />
                </div>
                <span className="text-xs font-semibold text-rose-300 w-20 text-right shrink-0">₹0</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-28 shrink-0">With this pipeline</span>
                <div className="flex-1 h-6 bg-white/5 rounded-full overflow-hidden ring-1 ring-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-teal-500 to-teal-400 rounded-full transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.max(6, measured.recovery_rate_pct)}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-teal-300 w-20 text-right shrink-0">
                  ₹{measured.recovered_rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">{counterfactual.note}</p>
          </div>
        )}

        {/* Projection: clearly separated, clearly labeled as hypothetical */}
        <div className="rounded-xl bg-brand-500/[0.07] ring-1 ring-brand-400/20 p-4">
          <div className="text-[10px] font-bold text-brand-300 uppercase tracking-widest mb-2">
            At scale — a labeled projection, not a measured result
          </div>
          <p className="text-sm text-slate-300 mb-3">{projection.assumption}</p>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="font-display text-2xl font-extrabold text-brand-300">
              ₹{projection.projected_recovered_value_rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
            <span className="text-xs text-slate-500">
              recovered / month, out of ₹{projection.projected_failed_value_rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 })} that failed
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-3 italic">{projection.caveat}</p>
        </div>
      </div>
    </div>
  )
}
