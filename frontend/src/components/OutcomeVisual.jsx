import { useEffect, useRef, useState } from 'react'
import { CAUSE_LABELS } from '../constants'
import SyntheticDataBadge from './SyntheticDataBadge'

// A genuinely visual, at-a-glance read of the same summary/byCause data
// every other panel already fetches — no new endpoint, no new state in
// App.jsx beyond what's already passed down. A flowing pipeline/funnel
// diagram (failed -> contacted -> recovered/promise/needs-human) as the
// hero element, told as a story of what happens to a payment rather than
// a static ratio — plus a set of live cause-recovery bars beneath it.
// Every number and every ribbon width tweens from its previous rendered
// value to the new one on every data change, including a live Refresh.

const OUTCOME_NODES = [
  { key: 'recovered', label: 'Recovered', color: '#35d3a8', glow: 'rgba(53,211,168,0.55)' },
  { key: 'promise_to_pay', label: 'Promise to Pay', color: '#fbbf24', glow: 'rgba(251,191,36,0.5)' },
  { key: 'needs_human', label: 'Needs Human', color: '#fb7185', glow: 'rgba(251,113,133,0.5)' },
]

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

// Geometry for the flow diagram's SVG ribbons. Three source stages
// (Failed at x=0, Contacted at x=1) fan out into 3 outcome stages at x=2.
// Node vertical centers/heights are expressed as fractions of the SVG's
// viewBox height so the whole thing scales cleanly at any width.
// VB_W leaves ~185px of clear space to the right of the last column
// specifically for the outcome labels ("Promise to Pay" is the longest,
// ~130px at this font size + node width + gap) — labels are SVG <text>
// elements laid out in viewBox coordinates, not HTML flow, so unlike a
// CSS overflow they get hard-clipped at the SVG boundary if that space
// isn't reserved up front rather than just wrapping.
const VB_W = 980
const VB_H = 260
const COL_X = [70, 400, 700] // failed, contacted, outcomes column
const NODE_W = 14

function ribbonPath(x1, y1top, y1bot, x2, y2top, y2bot) {
  const midX = (x1 + x2) / 2
  return [
    `M ${x1} ${y1top}`,
    `C ${midX} ${y1top}, ${midX} ${y2top}, ${x2} ${y2top}`,
    `L ${x2} ${y2bot}`,
    `C ${midX} ${y2bot}, ${midX} ${y1bot}, ${x1} ${y1bot}`,
    'Z',
  ].join(' ')
}

function FlowDiagram({ summary }) {
  const total = summary.total_transactions || 1
  const failed = summary.funnel?.failed ?? total
  const contacted = summary.funnel?.contacted ?? total
  const rawOutcomeCounts = OUTCOME_NODES.map((n) => summary.status_counts[n.key] || 0)
  const inProgress = summary.status_counts.contacted || 0

  // Everything expressed as a fraction of `total` so the tallest possible
  // stack (the Failed column, always 100%) maps to a fixed pixel band —
  // keeps the diagram's vertical scale stable even as counts change.
  const bandTop = 30
  const bandH = VB_H - 60
  const scale = (n) => (n / total) * bandH

  const failedTarget = [scale(failed)]
  const contactedTarget = [scale(contacted)]
  const outcomeTargets = [...rawOutcomeCounts, inProgress].map(scale)

  const failedH = useTweenArray(failedTarget)[0]
  const contactedH = useTweenArray(contactedTarget)[0]
  const outcomeHs = useTweenArray(outcomeTargets)

  // Stack the 3 outcome nodes + "in progress" vertically, centered as a
  // group, with small gaps between them.
  const gap = 10
  const totalOutcomeH = outcomeHs.reduce((a, b) => a + b, 0) + gap * (outcomeHs.length - 1)
  let outcomeY = bandTop + (bandH - totalOutcomeH) / 2
  const outcomeYs = outcomeHs.map((h) => {
    const y = outcomeY
    outcomeY += h + gap
    return { top: y, bot: y + h, h }
  })

  const failedY = bandTop + (bandH - failedH) / 2
  const contactedY = bandTop + (bandH - contactedH) / 2

  const colors = ['#35d3a8', '#fbbf24', '#fb7185', '#7c93ff']
  const labels = ['Recovered', 'Promise to Pay', 'Needs Human', 'In Progress']
  const counts = [...rawOutcomeCounts, inProgress]

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full min-w-[610px]" style={{ height: 'auto' }}>
        <defs>
          <filter id="flowGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="failedToContacted" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#64748b" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#7c93ff" stopOpacity="0.55" />
          </linearGradient>
          {colors.map((c, i) => (
            <linearGradient key={i} id={`toOutcome${i}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#7c93ff" stopOpacity="0.4" />
              <stop offset="100%" stopColor={c} stopOpacity="0.55" />
            </linearGradient>
          ))}
        </defs>

        {/* Ribbon: Failed -> Contacted (nearly all of it, in practice) */}
        <path
          d={ribbonPath(
            COL_X[0] + NODE_W, failedY, failedY + failedH,
            COL_X[1], contactedY, contactedY + contactedH
          )}
          fill="url(#failedToContacted)"
        />

        {/* Ribbons: Contacted -> each outcome node */}
        {outcomeYs.map((o, i) =>
          o.h > 0.5 ? (
            <path
              key={i}
              d={ribbonPath(
                COL_X[1] + NODE_W, contactedY, contactedY + contactedH,
                COL_X[2], o.top, o.bot
              )}
              fill={`url(#toOutcome${i})`}
              opacity={0.85}
            />
          ) : null
        )}

        {/* Failed node */}
        <rect x={COL_X[0]} y={failedY} width={NODE_W} height={Math.max(failedH, 2)} rx="4" fill="#94a3b8" filter="url(#flowGlow)" />
        <text x={COL_X[0] - 12} y={failedY - 10} textAnchor="start" className="fill-slate-300" style={{ fontSize: 15, fontWeight: 700, fontFamily: 'inherit' }}>
          {failed}
        </text>
        <text x={COL_X[0] - 12} y={failedY + failedH + 22} textAnchor="start" className="fill-slate-500" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', fontFamily: 'inherit' }}>
          FAILED
        </text>

        {/* Contacted node */}
        <rect x={COL_X[1]} y={contactedY} width={NODE_W} height={Math.max(contactedH, 2)} rx="4" fill="#7c93ff" filter="url(#flowGlow)" />
        <text x={COL_X[1] + NODE_W / 2} y={contactedY - 10} textAnchor="middle" className="fill-slate-300" style={{ fontSize: 15, fontWeight: 700, fontFamily: 'inherit' }}>
          {contacted}
        </text>
        <text x={COL_X[1] + NODE_W / 2} y={contactedY + contactedH + 22} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', fontFamily: 'inherit' }}>
          CONTACTED
        </text>

        {/* Outcome nodes */}
        {outcomeYs.map((o, i) =>
          o.h > 0.5 ? (
            <g key={i}>
              <rect x={COL_X[2]} y={o.top} width={NODE_W} height={o.h} rx="4" fill={colors[i]} filter="url(#flowGlow)" />
              <text x={COL_X[2] + NODE_W + 14} y={o.top + o.h / 2 - 4} textAnchor="start" className="fill-white" style={{ fontSize: 16, fontWeight: 800, fontFamily: 'inherit' }}>
                {counts[i]}
              </text>
              <text x={COL_X[2] + NODE_W + 14} y={o.top + o.h / 2 + 14} textAnchor="start" style={{ fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit', fill: colors[i] }}>
                {labels[i]}
              </text>
            </g>
          ) : null
        )}
      </svg>
    </div>
  )
}

function CauseBars({ byCause }) {
  if (!byCause) return null
  const causes = Object.keys(byCause).sort((a, b) => byCause[b].recovery_rate_pct - byCause[a].recovery_rate_pct)
  const targets = causes.map((c) => byCause[c].recovery_rate_pct)
  const tweened = useTweenArray(targets)

  return (
    <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3.5">
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
  const recoveredPct = useTween(summary.recovery_rate_pct)

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/40">
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
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-teal-400" />
            </span>
            <div className="text-[11px] font-bold text-slate-300 uppercase tracking-[0.15em]">
              Where every failed payment goes
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm">
              <span className="font-display font-extrabold text-white text-lg tracking-tight">
                {recoveredPct.toFixed(1)}%
              </span>
              <span className="text-slate-500 ml-1.5">recovered overall</span>
            </div>
            <SyntheticDataBadge />
          </div>
        </div>

        <div className="mt-4">
          <FlowDiagram summary={summary} />
        </div>

        {byCause && (
          <div className="mt-4 pt-6 border-t border-white/[0.07]">
            <div className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.15em] mb-3.5">
              Recovery rate by cause
            </div>
            <CauseBars byCause={byCause} />
          </div>
        )}
      </div>
    </div>
  )
}
