import { useEffect, useRef, useState } from 'react'
import { CAUSE_LABELS, CAUSE_COLORS, STATUS_COLUMNS, formatAmount } from '../constants'

function TransactionCard({ txn, onClick, highlight, justChanged }) {
  return (
    <button
      onClick={() => onClick(txn.id)}
      className={`w-full text-left border rounded-xl p-3 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer
        transition-all duration-300 ease-out bg-white/[0.03] hover:bg-white/[0.06]
        ${highlight ? 'border-rose-400/50 ring-2 ring-rose-400/30' : 'border-white/10'}
        ${justChanged ? 'animate-card-arrive ring-2 ring-brand-400/50' : ''}
      `}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-mono text-slate-500">#{txn.id}</span>
        <span className="text-xs font-medium text-slate-300">
          {formatAmount(txn.amount, txn.currency)}
        </span>
      </div>
      <div className="font-medium text-sm text-slate-100 mb-1.5">{txn.customer_name}</div>
      {txn.latest_cause && (
        <span
          className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full mb-1.5 ${
            CAUSE_COLORS[txn.latest_cause] || 'bg-slate-500/10 text-slate-300 ring-1 ring-slate-500/30'
          }`}
        >
          {CAUSE_LABELS[txn.latest_cause] || txn.latest_cause}
        </span>
      )}
      <div className="text-xs text-slate-500 mb-1">
        Attempt {txn.attempt_count} / 3
      </div>
      {txn.latest_message && (
        <p className="text-xs text-slate-400 line-clamp-2 mt-1.5 border-t border-white/10 pt-1.5">
          {txn.latest_message}
        </p>
      )}
    </button>
  )
}

export default function KanbanBoard({ transactions, onSelect, pinnedNeedsHumanId }) {
  // Track which transaction ids changed status (or are brand new) since the
  // last render, so their card can briefly highlight where it landed —
  // makes a Live Demo transaction visibly "arrive" in its column instead of
  // silently appearing on the next data refresh.
  const [justChangedIds, setJustChangedIds] = useState(new Set())
  const prevStatusById = useRef(new Map())

  useEffect(() => {
    const prev = prevStatusById.current
    const changed = new Set()
    for (const t of transactions) {
      const prevStatus = prev.get(t.id)
      if (prevStatus !== undefined && prevStatus !== t.status) {
        changed.add(t.id)
      }
    }
    if (changed.size > 0) {
      setJustChangedIds(changed)
      const timer = setTimeout(() => setJustChangedIds(new Set()), 1500)
      prevStatusById.current = new Map(transactions.map((t) => [t.id, t.status]))
      return () => clearTimeout(timer)
    }
    prevStatusById.current = new Map(transactions.map((t) => [t.id, t.status]))
  }, [transactions])

  const byStatus = STATUS_COLUMNS.reduce((acc, col) => {
    acc[col.key] = transactions.filter((t) => t.status === col.key)
    return acc
  }, {})

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
      {STATUS_COLUMNS.map((col) => {
        const items = byStatus[col.key] || []
        return (
          <div key={col.key} className="min-w-0">
            <div className={`panel border-t-4 ${col.accent} rounded-2xl p-3 h-full shadow-lg shadow-black/20`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-display font-bold text-slate-200">{col.label}</h3>
                <span
                  className={`text-xs font-semibold rounded-full px-2 py-0.5 transition-colors duration-300 ${
                    items.some((t) => justChangedIds.has(t.id))
                      ? 'bg-brand-400/20 text-brand-300'
                      : 'bg-white/5 text-slate-400'
                  }`}
                >
                  {items.length}
                </span>
              </div>
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {items.length === 0 && (
                  <div className="text-xs text-slate-600 italic py-4 text-center">Empty</div>
                )}
                {items.map((txn) => (
                  <TransactionCard
                    key={txn.id}
                    txn={txn}
                    onClick={onSelect}
                    highlight={txn.id === pinnedNeedsHumanId}
                    justChanged={justChangedIds.has(txn.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
