import { CAUSE_LABELS } from '../constants'
import SyntheticDataBadge from './SyntheticDataBadge'

export default function CauseBreakdownTable({ byCause }) {
  if (!byCause) return null
  const causes = Object.keys(byCause).sort()

  return (
    <div className="panel rounded-2xl overflow-hidden shadow-lg shadow-black/20">
      <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Per-Cause Breakdown
        </div>
        <SyntheticDataBadge />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-white/10 bg-white/[0.02]">
              <th className="px-5 py-2.5 font-semibold">Root Cause</th>
              <th className="px-3 py-2.5 font-semibold text-right">Total</th>
              <th className="px-3 py-2.5 font-semibold text-right">Recovered</th>
              <th className="px-3 py-2.5 font-semibold text-right">Promise</th>
              <th className="px-3 py-2.5 font-semibold text-right">Needs Human</th>
              <th className="px-3 py-2.5 font-semibold text-right">Recovery %</th>
            </tr>
          </thead>
          <tbody>
            {causes.map((cause) => {
              const s = byCause[cause]
              return (
                <tr key={cause} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors">
                  <td className="px-5 py-3 font-semibold text-slate-200">
                    {CAUSE_LABELS[cause] || cause}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-400">{s.total}</td>
                  <td className="px-3 py-3 text-right text-teal-300 font-medium">{s.recovered}</td>
                  <td className="px-3 py-3 text-right text-amber-300 font-medium">{s.promise_to_pay}</td>
                  <td className="px-3 py-3 text-right text-rose-300 font-medium">{s.needs_human}</td>
                  <td className="px-3 py-3 text-right">
                    {/* Thresholds are deliberate, not incidental: >=65% (teal) is
                        "recovering well," 45-64% (amber) is "middling," <45%
                        (rose) is "struggling" — matches the same bands the
                        adaptive-delay tiers in backend/adaptive.py reason about. */}
                    <span
                      className={`font-display font-bold px-2 py-0.5 rounded-full text-xs ring-1 ${
                        s.recovery_rate_pct >= 65
                          ? 'bg-teal-400/10 text-teal-300 ring-teal-400/30'
                          : s.recovery_rate_pct >= 45
                          ? 'bg-amber-400/10 text-amber-300 ring-amber-400/30'
                          : 'bg-rose-400/10 text-rose-300 ring-rose-400/30'
                      }`}
                    >
                      {s.recovery_rate_pct}%
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
