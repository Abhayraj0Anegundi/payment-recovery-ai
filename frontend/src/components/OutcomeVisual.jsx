import { useEffect, useRef, useState } from 'react'
import { CAUSE_LABELS } from '../constants'
import SyntheticDataBadge from './SyntheticDataBadge'

// A genuinely visual, at-a-glance read of the same summary/byCause data
// every other panel already fetches — no new endpoint, no new state in
// App.jsx beyond what's already passed down. A calm, centered hero number
// on a soft dark radial backdrop, with quiet colored stat cards and a
// per-cause breakdown beneath. Toned down deliberately from an earlier,
// more theatrical pass — the glow reads as "premium," not "alarm."
// Every number tweens from its previous rendered value to the new one on
// every data change, including a live Refresh, not just first load.

function useTween(target, durationMs = 900) {
  const [display, setDisplay] = useState(target)
  const prevRef = useRef(target)
  const rafRef = useRef(null)

  useEffect(() => {
    const from = prevRef.current
    const to = target
    if (Math.abs(from - to) < 0.01) {
      setDisplay(to)
      prevRef.current = to
      return
    }
    const start = performance.now()
    function tick(now) {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from + (to - from) * eased)
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
  }, [target])

  return display
}

function useTweenArray(targets, durationMs = 900) {
  const [display, setDisplay] = useState(targets)
  const prevRef = useRef(targets)
  const rafRef = useRef(null)
  const key = JSON.stringify(targets)

  useEffect(() => {
    const from = prevRef.current.length === targets.length ? prevRef.current : targets
    const changed = from.some((v, i) => Math.abs(v - targets[i]) > 0.01)
    if (!changed) {
      setDisplay(targets)
      prevRef.current = targets
      return
    }
    const start = performance.now()
    function tick(now) {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from.map((v, i) => v + (targets[i] - v) * eased))
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setDisplay(targets)
        prevRef.current = targets
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return display
}

function StatCard({ label, value, color }) {
  return (
    <div
      className="rounded-xl px-4 py-4 ring-1 transition-transform hover:-translate-y-0.5"
      style={{
        background: `linear-gradient(180deg, ${color}0d, rgba(255,255,255,0.015))`,
        borderColor: `${color}22`,
      }}
    >
      <div className="font-display text-2xl font-bold" style={{ color }}>
        {value}
      </div>
      <div className="text-[10px] text-slate-400 uppercase tracking-wide mt-1">{label}</div>
    </div>
  )
}

export default function OutcomeVisual({ summary, byCause }) {
  if (!summary) return null
  const pct = useTween(summary.recovery_rate_pct)
  const total = summary.total_transactions || 1
  const causes = byCause
    ? Object.keys(byCause).sort((a, b) => byCause[b].recovery_rate_pct - byCause[a].recovery_rate_pct)
    : []
  const causeTargets = causes.map((c) => byCause[c].recovery_rate_pct)
  const tweenedCauses = useTweenArray(causeTargets)

  const stats = [
    { label: 'Recovered', value: summary.status_counts.recovered, color: '#35d3a8' },
    { label: 'Promise to Pay', value: summary.status_counts.promise_to_pay, color: '#fbbf24' },
    { label: 'Needs Human', value: summary.status_counts.needs_human, color: '#fb7185' },
  ]

  return (
    <div className="relative rounded-2xl overflow-hidden ring-1 ring-white/[0.07] shadow-xl shadow-black/30">
      {/* Deliberately quiet backdrop: a single soft radial wash, no dot
          texture, no hard edges — depth without visual noise. */}
      <div className="absolute inset-0 bg-[#070c18]" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 50% 0%, rgba(53,211,168,0.10), transparent 60%)',
        }}
      />

      <div className="relative px-6 sm:px-10 py-9 text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-teal-400" />
          </span>
          <div className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-[0.25em]">
            Live Recovery
          </div>
        </div>

        <div className="relative inline-block mt-3">
          <div
            className="absolute inset-0 blur-2xl opacity-25"
            style={{ background: 'radial-gradient(circle, #35d3a8, transparent 72%)' }}
          />
          <div
            className="relative font-display text-[4.75rem] sm:text-[5.5rem] leading-none font-extrabold text-white tracking-tight"
            style={{ textShadow: '0 0 28px rgba(53,211,168,0.28)' }}
          >
            {pct.toFixed(1)}
            <span className="text-3xl text-teal-300/80 align-top">%</span>
          </div>
        </div>
        <div className="text-sm text-slate-400 mt-3">
          <span className="text-slate-200 font-semibold">{summary.status_counts.recovered}</span> of{' '}
          <span className="text-slate-200 font-semibold">{total}</span> failed payments recovered
        </div>
        <div className="flex justify-center mt-3.5">
          <SyntheticDataBadge />
        </div>

        <div className="grid grid-cols-3 gap-3 mt-8 max-w-xl mx-auto">
          {stats.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} color={s.color} />
          ))}
        </div>

        {causes.length > 0 && (
          <div className="mt-8 pt-6 border-t border-white/[0.06] max-w-2xl mx-auto">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.2em] mb-4">
              Recovery rate by cause
            </div>
            <div className="flex justify-center gap-x-8 gap-y-3 flex-wrap">
              {causes.map((cause, i) => {
                const p = tweenedCauses[i] ?? causeTargets[i]
                const tone = p >= 65 ? '#6ce8c3' : p >= 45 ? '#fcd34d' : '#fda4af'
                return (
                  <div key={cause} className="text-center">
                    <div className="font-display text-lg font-bold tabular-nums" style={{ color: tone }}>
                      {p.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{CAUSE_LABELS[cause] || cause}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
