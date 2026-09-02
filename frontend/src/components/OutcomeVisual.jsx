import { useEffect, useRef, useState } from 'react'
import { CAUSE_LABELS } from '../constants'
import SyntheticDataBadge from './SyntheticDataBadge'

// A genuinely visual, at-a-glance read of the same summary/byCause data
// every other panel already fetches — no new endpoint, no new state in
// App.jsx beyond what's already passed down. Two pieces:
//   1. An animated SVG donut (status_counts as proportions of total)
//   2. A small set of live horizontal bars (recovery % per cause)
// Both interpolate from their previous rendered value to the new one on
// every data change (initial load AND every Refresh click), the same
// tween pattern AnimatedNumber.jsx uses for numbers — so a real new
// transaction added via Refresh visibly nudges the rings/bars instead of
// jump-cutting, making "this updates with real data" obvious to look at,
// not just true underneath.

const SEGMENT_ORDER = [
  { key: 'recovered', label: 'Recovered', color: '#35d3a8' }, // teal-400
  { key: 'promise_to_pay', label: 'Promise to Pay', color: '#fbbf24' }, // amber-400
  { key: 'needs_human', label: 'Needs Human', color: '#fb7185' }, // rose-400
  { key: 'contacted', label: 'In Progress', color: '#7c93ff' }, // brand-400
]

const RADIUS = 70
const STROKE = 22
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function useTweenedSegments(targetValues) {
  // targetValues: array of numbers (one per SEGMENT_ORDER entry), already
  // in "dash length" units (i.e. pre-multiplied by circumference/total).
  const [display, setDisplay] = useState(targetValues)
  const prevRef = useRef(targetValues)
  const rafRef = useRef(null)

  useEffect(() => {
    const from = prevRef.current
    const to = targetValues
    const changed = from.some((v, i) => Math.abs(v - to[i]) > 0.01)
    if (!changed) return

    const start = performance.now()
    const durationMs = 800
    function tick(now) {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from.map((v, i) => v + (to[i] - v) * eased))
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setDisplay(to)
        prevRef.current = to
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(targetValues)])

  return display
}

function Donut({ summary }) {
  const total = summary.total_transactions || 1
  const rawCounts = SEGMENT_ORDER.map((s) => summary.status_counts[s.key] || 0)
  const targetLengths = rawCounts.map((c) => (c / total) * CIRCUMFERENCE)
  const tweened = useTweenedSegments(targetLengths)

  // Running offset around the ring — each segment starts where the last ended.
  let cumulative = 0
  const arcs = tweened.map((len, i) => {
    const offset = cumulative
    cumulative += len
    return { ...SEGMENT_ORDER[i], len, offset }
  })

  const recoveredPct = summary.recovery_rate_pct

  return (
    <div className="relative shrink-0" style={{ width: 220, height: 220 }}>
      <svg width="220" height="220" viewBox="0 0 220 220" className="-rotate-90">
        <circle cx="110" cy="110" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={STROKE} />
        {arcs.map((arc) =>
          arc.len > 0.5 ? (
            <circle
              key={arc.key}
              cx="110"
              cy="110"
              r={RADIUS}
              fill="none"
              stroke={arc.color}
              strokeWidth={STROKE}
              strokeDasharray={`${arc.len} ${CIRCUMFERENCE - arc.len}`}
              strokeDashoffset={-arc.offset}
              strokeLinecap="butt"
              style={{ filter: `drop-shadow(0 0 6px ${arc.color}66)` }}
            />
          ) : null
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-4xl font-extrabold text-white tracking-tight">
          {recoveredPct.toFixed(1)}%
        </div>
        <div className="text-[10px] text-slate-400 uppercase tracking-wide mt-1">recovered</div>
      </div>
    </div>
  )
}

function Legend({ summary }) {
  const total = summary.total_transactions || 1
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
      {SEGMENT_ORDER.map((s) => {
        const count = summary.status_counts[s.key] || 0
        const pct = total ? ((count / total) * 100).toFixed(1) : '0.0'
        return (
          <div key={s.key} className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color, boxShadow: `0 0 6px ${s.color}88` }} />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-100 leading-tight">{count}</div>
              <div className="text-[11px] text-slate-500 leading-tight truncate">{s.label} · {pct}%</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CauseBars({ byCause }) {
  if (!byCause) return null
  const causes = Object.keys(byCause).sort((a, b) => byCause[b].recovery_rate_pct - byCause[a].recovery_rate_pct)
  const [tweenedPcts, setTweenedPcts] = useState(() => causes.map((c) => byCause[c].recovery_rate_pct))
  const prevRef = useRef(tweenedPcts)
  const rafRef = useRef(null)

  useEffect(() => {
    const targets = causes.map((c) => byCause[c].recovery_rate_pct)
    const from = prevRef.current.length === targets.length ? prevRef.current : targets
    const changed = from.some((v, i) => Math.abs(v - targets[i]) > 0.05)
    if (!changed) {
      setTweenedPcts(targets)
      prevRef.current = targets
      return
    }
    const start = performance.now()
    const durationMs = 800
    function tick(now) {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setTweenedPcts(from.map((v, i) => v + (targets[i] - v) * eased))
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setTweenedPcts(targets)
        prevRef.current = targets
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(causes.map((c) => byCause[c].recovery_rate_pct))])

  return (
    <div className="space-y-2.5">
      {causes.map((cause, i) => {
        const pct = tweenedPcts[i] ?? byCause[cause].recovery_rate_pct
        const tone =
          pct >= 65 ? '#35d3a8' : pct >= 45 ? '#fbbf24' : '#fb7185'
        return (
          <div key={cause}>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-slate-400 font-medium">{CAUSE_LABELS[cause] || cause}</span>
              <span className="font-semibold" style={{ color: tone }}>{pct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-none"
                style={{ width: `${Math.max(2, pct)}%`, backgroundColor: tone, boxShadow: `0 0 6px ${tone}66` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function OutcomeVisual({ summary, byCause }) {
  if (!summary) return null

  return (
    <div className="relative rounded-2xl overflow-hidden panel shadow-xl shadow-black/30 p-6">
      <div
        className="absolute inset-0 opacity-50 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 90% 10%, rgba(53,211,168,0.10), transparent 45%), radial-gradient(circle at 10% 90%, rgba(48,94,255,0.10), transparent 45%)',
        }}
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-5">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Outcomes at a glance — every failed payment, right now
          </div>
          <SyntheticDataBadge />
        </div>

        <div className="flex flex-col md:flex-row items-center gap-8">
          <Donut summary={summary} />
          <div className="flex-1 w-full">
            <Legend summary={summary} />
            {byCause && (
              <div className="mt-5 pt-5 border-t border-white/10">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Recovery rate by cause
                </div>
                <CauseBars byCause={byCause} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
