import { useEffect, useRef, useState } from 'react'
import { CAUSE_LABELS } from '../constants'
import SyntheticDataBadge from './SyntheticDataBadge'

// A genuinely visual, at-a-glance read of the same summary/byCause data
// every other panel already fetches — no new endpoint, no new state in
// App.jsx beyond what's already passed down. A semi-circular gauge (the
// hero element) plus a set of glass legend chips and gradient cause bars,
// all tweening from their previous rendered value to the new one on every
// data change — including a live Refresh, not just first load.

const SEGMENT_ORDER = [
  { key: 'recovered', label: 'Recovered', color: '#35d3a8', glow: 'rgba(53,211,168,0.55)' },
  { key: 'promise_to_pay', label: 'Promise to Pay', color: '#fbbf24', glow: 'rgba(251,191,36,0.5)' },
  { key: 'needs_human', label: 'Needs Human', color: '#fb7185', glow: 'rgba(251,113,133,0.5)' },
  { key: 'contacted', label: 'In Progress', color: '#7c93ff', glow: 'rgba(124,147,255,0.5)' },
]

// Semi-circular gauge geometry — a 180° arc from 9 o'clock to 3 o'clock,
// read left-to-right like a speedometer. More distinctive than a full
// donut and reads "at a glance" faster: sweep angle IS the fill amount.
const GAUGE_R = 92
const GAUGE_CX = 130
const GAUGE_CY = 118
const ARC_LEN = Math.PI * GAUGE_R // half the circumference — the full sweep

function polarToXY(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 180) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

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

function Gauge({ summary }) {
  const total = summary.total_transactions || 1
  const rawCounts = SEGMENT_ORDER.map((s) => summary.status_counts[s.key] || 0)
  const targetLengths = rawCounts.map((c) => (c / total) * ARC_LEN)
  const tweened = useTweenArray(targetLengths)
  const tweenedPct = useTween(summary.recovery_rate_pct)

  let cumulative = 0
  const arcs = tweened.map((len, i) => {
    const offset = cumulative
    cumulative += len
    return { ...SEGMENT_ORDER[i], len, offset }
  })

  // The needle-tip marker sits at the leading edge of the "recovered"
  // segment — a small glowing dot that reads as a live indicator, not
  // just a static ring, echoing the pulse-dot used elsewhere in the app.
  const recoveredLen = tweened[0]
  const tipAngle = 180 * (recoveredLen / ARC_LEN)
  const tip = polarToXY(GAUGE_CX, GAUGE_CY, GAUGE_R, tipAngle)

  return (
    <div className="relative shrink-0" style={{ width: 260, height: 160 }}>
      <svg width="260" height="160" viewBox="0 0 260 160">
        <defs>
          <filter id="gaugeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Track */}
        <path
          d={`M ${GAUGE_CX - GAUGE_R} ${GAUGE_CY} A ${GAUGE_R} ${GAUGE_R} 0 0 1 ${GAUGE_CX + GAUGE_R} ${GAUGE_CY}`}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="16"
          strokeLinecap="round"
        />
        {/* Segments */}
        {arcs.map((arc) =>
          arc.len > 0.5 ? (
            <path
              key={arc.key}
              d={`M ${GAUGE_CX - GAUGE_R} ${GAUGE_CY} A ${GAUGE_R} ${GAUGE_R} 0 0 1 ${GAUGE_CX + GAUGE_R} ${GAUGE_CY}`}
              fill="none"
              stroke={arc.color}
              strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray={`${arc.len} ${ARC_LEN * 2}`}
              strokeDashoffset={-arc.offset}
              filter="url(#gaugeGlow)"
              opacity="0.95"
            />
          ) : null
        )}
        {/* Live indicator dot at the recovered/next-segment boundary */}
        {recoveredLen > 0.5 && recoveredLen < ARC_LEN - 0.5 && (
          <circle cx={tip.x} cy={tip.y} r="4.5" fill="#eafff8" filter="url(#gaugeGlow)" />
        )}
      </svg>
      <div className="absolute inset-x-0 bottom-2 flex flex-col items-center">
        <div className="font-display text-[2.75rem] leading-none font-extrabold text-white tracking-tight">
          {tweenedPct.toFixed(1)}
          <span className="text-2xl align-top ml-0.5 text-slate-400">%</span>
        </div>
        <div className="text-[10px] font-semibold text-teal-300/90 uppercase tracking-[0.2em] mt-1.5">
          Recovered
        </div>
      </div>
    </div>
  )
}

function LegendChip({ segment, count, pct }) {
  return (
    <div
      className="relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 bg-white/[0.03] ring-1 ring-white/[0.06] overflow-hidden transition-colors hover:bg-white/[0.05]"
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
        style={{ backgroundColor: segment.color, boxShadow: `0 0 8px ${segment.glow}` }}
      />
      <span
        className="h-2 w-2 rounded-full shrink-0 ml-1"
        style={{ backgroundColor: segment.color, boxShadow: `0 0 6px ${segment.glow}` }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-lg font-bold text-white leading-none">{count}</span>
          <span className="text-[11px] text-slate-500 font-medium">{pct}%</span>
        </div>
        <div className="text-[11px] text-slate-400 leading-tight mt-0.5 truncate">{segment.label}</div>
      </div>
    </div>
  )
}

function CauseBars({ byCause }) {
  if (!byCause) return null
  const causes = Object.keys(byCause).sort((a, b) => byCause[b].recovery_rate_pct - byCause[a].recovery_rate_pct)
  const targets = causes.map((c) => byCause[c].recovery_rate_pct)
  const tweened = useTweenArray(targets)

  return (
    <div className="space-y-3">
      {causes.map((cause, i) => {
        const pct = tweened[i] ?? targets[i]
        const tone =
          pct >= 65 ? { fg: '#6ce8c3', from: '#0d9a76', to: '#35d3a8' } :
          pct >= 45 ? { fg: '#fcd34d', from: '#d97706', to: '#fbbf24' } :
                      { fg: '#fda4af', from: '#e11d48', to: '#fb7185' }
        return (
          <div key={cause}>
            <div className="flex justify-between items-baseline text-[11.5px] mb-1.5">
              <span className="text-slate-300 font-medium tracking-tight">{CAUSE_LABELS[cause] || cause}</span>
              <span className="font-display font-bold tabular-nums" style={{ color: tone.fg }}>
                {pct.toFixed(1)}%
              </span>
            </div>
            <div className="h-[7px] bg-white/[0.04] rounded-full overflow-hidden ring-1 ring-white/[0.04]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(2, pct)}%`,
                  background: `linear-gradient(90deg, ${tone.from}, ${tone.to})`,
                  boxShadow: `0 0 10px ${tone.fg}55`,
                }}
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
  const total = summary.total_transactions || 1

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/40">
      {/* Layered glass background — a touch deeper/darker than the standard
          .panel utility, with two soft ambient glows anchored to opposite
          corners (mirroring app-backdrop's language at panel scale) plus a
          faint top hairline to catch light like a real glass edge. */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(155deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015) 40%, rgba(2,6,23,0.4))',
          backdropFilter: 'blur(16px)',
        }}
      />
      <div className="absolute inset-0 ring-1 ring-white/[0.09] rounded-2xl pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      <div
        className="absolute -top-24 -right-16 w-72 h-72 rounded-full opacity-60 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(53,211,168,0.14), transparent 70%)' }}
      />
      <div
        className="absolute -bottom-24 -left-16 w-72 h-72 rounded-full opacity-50 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(48,94,255,0.12), transparent 70%)' }}
      />

      <div className="relative px-6 sm:px-8 py-7">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-teal-400" />
            </span>
            <div className="text-[11px] font-bold text-slate-300 uppercase tracking-[0.15em]">
              Outcomes at a glance
            </div>
          </div>
          <SyntheticDataBadge />
        </div>

        <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-12">
          <div className="flex flex-col items-center shrink-0">
            <Gauge summary={summary} />
            <div className="text-[11px] text-slate-500 mt-1 tracking-wide">
              of <span className="text-slate-300 font-semibold">{total}</span> failed payments
            </div>
          </div>

          <div className="flex-1 w-full min-w-0">
            <div className="grid grid-cols-2 gap-2.5">
              {SEGMENT_ORDER.map((s) => {
                const count = summary.status_counts[s.key] || 0
                const pct = total ? ((count / total) * 100).toFixed(1) : '0.0'
                return <LegendChip key={s.key} segment={s} count={count} pct={pct} />
              })}
            </div>

            {byCause && (
              <div className="mt-6 pt-6 border-t border-white/[0.07]">
                <div className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.15em] mb-3.5">
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
