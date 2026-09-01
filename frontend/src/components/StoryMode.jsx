import { useEffect, useState } from 'react'

// Each step targets a real panel already on the page via a `data-story="<key>"`
// attribute — no separate content to keep in sync, no screenshots, no
// fabricated numbers. Story mode just narrates what's actually rendered.
export const STORY_STEPS = [
  {
    key: 'live-demo',
    title: '1. A real failed payment, right now',
    body: 'Pick any scenario and trigger it — this creates an actual row in SQLite and runs it through the real pipeline live, not a canned animation.',
  },
  {
    key: 'rule-table-proof',
    title: '2. The strategy is never chosen by AI',
    body: 'This number is read straight from audit_log. A fixed table decides retry vs. UPI vs. reminder vs. escalate — the LLM is never in that loop.',
  },
  {
    key: 'message-showcase',
    title: '3. The LLM\'s one real job: writing the nudge',
    body: 'Given the strategy the table already picked, Gemini writes the Hinglish message — specific to why the payment failed, not a generic retry line.',
  },
  {
    key: 'confidence-safety',
    title: '4. It says "I\'m not sure" instead of guessing',
    body: 'When the LLM\'s own classification confidence comes back low, the system escalates to a human immediately — even on attempt 1 — rather than confidently acting on a bad guess.',
  },
  {
    key: 'needs-human-pin',
    title: '5. A real audit trail for the hard cases',
    body: 'Every attempt, every response, every escalation is logged in the same database commit as the action it explains. Click through — nothing here is asserted without a row backing it.',
  },
  {
    key: 'revenue-impact',
    title: '6. What it\'s worth, in rupees',
    body: 'Recovered value vs. what "doing nothing" would have left on the table — computed live from the same transactions, not a separate slide.',
  },
]

function useStoryTarget(step) {
  const [rect, setRect] = useState(null)

  useEffect(() => {
    if (!step) return
    const el = document.querySelector(`[data-story="${step.key}"]`)
    if (!el) {
      setRect(null)
      return
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })

    // Give the smooth scroll time to settle before measuring — a single
    // rAF fires mid-scroll and produces a stale/incorrect highlight rect.
    let raf1, raf2
    const measure = () => {
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    const timer = setTimeout(() => {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(measure)
      })
    }, 380)

    // Keep the highlight glued to the panel during the scroll animation too.
    const onScroll = () => measure()
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      window.removeEventListener('scroll', onScroll)
    }
  }, [step])

  return rect
}

export default function StoryMode({ active, stepIndex, onNext, onBack, onExit }) {
  const step = active ? STORY_STEPS[stepIndex] : null
  const rect = useStoryTarget(step)

  if (!active) return null

  const pad = 10
  const highlightStyle = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {/* Dimming overlay with a transparent "cutout" over the highlighted
          panel, done via four box-shadow-free divs around the rect instead
          of a clip-path, so the cutout corners can stay rounded. */}
      {highlightStyle && (
        <>
          <div
            className="absolute inset-x-0 top-0 bg-black/75 transition-all duration-300"
            style={{ height: Math.max(0, highlightStyle.top) }}
          />
          <div
            className="absolute inset-x-0 bottom-0 bg-black/75 transition-all duration-300"
            style={{ top: highlightStyle.top + highlightStyle.height }}
          />
          <div
            className="absolute bg-black/75 transition-all duration-300"
            style={{
              top: highlightStyle.top,
              height: highlightStyle.height,
              left: 0,
              width: Math.max(0, highlightStyle.left),
            }}
          />
          <div
            className="absolute bg-black/75 transition-all duration-300"
            style={{
              top: highlightStyle.top,
              height: highlightStyle.height,
              left: highlightStyle.left + highlightStyle.width,
              right: 0,
            }}
          />
          <div
            className="absolute rounded-2xl ring-2 ring-teal-400 shadow-[0_0_0_4px_rgba(53,211,168,0.25),0_0_40px_rgba(53,211,168,0.35)] transition-all duration-300"
            style={{
              top: highlightStyle.top,
              left: highlightStyle.left,
              width: highlightStyle.width,
              height: highlightStyle.height,
            }}
          />
        </>
      )}
      {!highlightStyle && <div className="absolute inset-0 bg-black/75" />}

      {/* Caption card + controls, fixed to the bottom so it never overlaps
          the highlighted panel regardless of where on the page it sits. */}
      <div className="absolute inset-x-0 bottom-0 pointer-events-auto">
        <div className="max-w-2xl mx-auto px-6 pb-8">
          <div className="panel rounded-2xl p-5 shadow-2xl shadow-black/60 bg-slate-950/95">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-teal-300 uppercase tracking-widest">
                Story mode · step {stepIndex + 1} of {STORY_STEPS.length}
              </span>
              <button
                onClick={onExit}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Exit ✕
              </button>
            </div>
            <h3 className="font-display font-bold text-white text-lg mb-1.5">{step.title}</h3>
            <p className="text-sm text-slate-400 leading-relaxed mb-4">{step.body}</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex gap-1.5">
                {STORY_STEPS.map((s, i) => (
                  <div
                    key={s.key}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      i <= stepIndex ? 'bg-teal-400' : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>
              <button
                onClick={onBack}
                disabled={stepIndex === 0}
                className="text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:text-slate-300 px-3 py-2 rounded-full border border-white/10 transition-colors shrink-0"
              >
                Back
              </button>
              <button
                onClick={onNext}
                className="text-xs font-bold text-white bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 px-4 py-2 rounded-full transition-all shrink-0"
              >
                {stepIndex === STORY_STEPS.length - 1 ? 'Finish' : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
