import { CAUSE_LABELS } from '../constants'

export default function CauseBreakdownTable({ byCause }) {
  if (!byCause) return null
  const causes = Object.keys(byCause).sort()

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          Per-Cause Breakdown
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="px-5 py-2 font-medium">Root Cause</th>
              <th className="px-3 py-2 font-medium text-right">Total</th>
              <th className="px-3 py-2 font-medium text-right">Recovered</th>
              <th className="px-3 py-2 font-medium text-right">Promise</th>
              <th className="px-3 py-2 font-medium text-right">Needs Human</th>
              <th className="px-3 py-2 font-medium text-right">Recovery %</th>
            </tr>
          </thead>
          <tbody>
            {causes.map((cause) => {
              const s = byCause[cause]
              return (
                <tr key={cause} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-2.5 font-medium text-slate-800">
                    {CAUSE_LABELS[cause] || cause}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{s.total}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-600">{s.recovered}</td>
                  <td className="px-3 py-2.5 text-right text-amber-600">{s.promise_to_pay}</td>
                  <td className="px-3 py-2.5 text-right text-rose-600">{s.needs_human}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-slate-800">
                    {s.recovery_rate_pct}%
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
