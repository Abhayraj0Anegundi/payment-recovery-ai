import { useEffect, useRef, useState } from 'react'

/**
 * Animates a numeric value counting from its previous value to a new one
 * whenever `value` changes. Falls back to displaying non-numeric values
 * (e.g. "62.2%") unanimated but still applies the flash-on-change effect.
 *
 * suffix/prefix let the caller keep formatting (%, decimals) without the
 * hook needing to know about it.
 */
export default function AnimatedNumber({ value, decimals = 0, suffix = '', prefix = '', durationMs = 700 }) {
  const numericTarget = typeof value === 'number' ? value : parseFloat(value)
  const isNumeric = !Number.isNaN(numericTarget)

  const [display, setDisplay] = useState(numericTarget)
  const [flash, setFlash] = useState(false)
  const prevValue = useRef(numericTarget)
  const rafRef = useRef(null)

  useEffect(() => {
    if (!isNumeric) return

    const from = prevValue.current
    const to = numericTarget
    if (from === to) return

    setFlash(true)
    const flashTimer = setTimeout(() => setFlash(false), 750)

    const start = performance.now()
    function tick(now) {
      const elapsed = now - start
      const t = Math.min(1, elapsed / durationMs)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from + (to - from) * eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setDisplay(to)
        prevValue.current = to
      }
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafRef.current)
      clearTimeout(flashTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numericTarget, isNumeric])

  if (!isNumeric) {
    return <span>{prefix}{value}{suffix}</span>
  }

  return (
    <span
      className={`inline-block transition-all duration-300 ${
        flash ? 'text-indigo-600 scale-110' : 'scale-100'
      }`}
    >
      {prefix}{display.toFixed(decimals)}{suffix}
    </span>
  )
}
