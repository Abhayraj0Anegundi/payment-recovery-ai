import { CAUSE_LABELS } from '../constants'

export default function CauseBreakdownTable({ byCause }) {
  if (!byCause) return null
  const causes = Object.keys(byCause).sort()

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Per-Cause Breakdown
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50/60">
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
                <tr key={cause} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-3 font-semibold text-slate-800">
                    {CAUSE_LABELS[cause] || cause}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-600">{s.total}</td>
                  <td className="px-3 py-3 text-right text-teal-600 font-medium">{s.recovered}</td>
                  <td className="px-3 py-3 text-right text-amber-600 font-medium">{s.promise_to_pay}</td>
                  <td className="px-3 py-3 text-right text-rose-600 font-medium">{s.needs_human}</td>
                  <td className="px-3 py-3 text-right">
                    {/* Thresholds are deliberate, not incidental: >=65% (teal) is
                        "recovering well," 45-64% (amber) is "middling," <45%
                        (rose) is "struggling" — matches the same bands the
                        adaptive-delay tiers in backend/adaptive.py reason about. */}
                    <span
                      className={`font-display font-bold px-2 py-0.5 rounded-full text-xs ${
                        s.recovery_rate_pct >= 65
                          ? 'bg-teal-50 text-teal-700'
                          : s.recovery_rate_pct >= 45
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-rose-50 text-rose-700'
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
