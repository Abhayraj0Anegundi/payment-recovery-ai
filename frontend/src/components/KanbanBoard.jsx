import { useEffect, useRef, useState } from 'react'
import { CAUSE_LABELS, CAUSE_COLORS, STATUS_COLUMNS, formatAmount } from '../constants'

function TransactionCard({ txn, onClick, highlight, justChanged }) {
  return (
    <button
      onClick={() => onClick(txn.id)}
      className={`w-full text-left border rounded-xl p-3 hover:shadow-md cursor-pointer
        transition-all duration-700 ease-out
        ${highlight ? 'border-rose-300 ring-2 ring-rose-200 bg-white' : 'border-slate-200'}
        ${justChanged ? 'animate-card-arrive ring-2 ring-brand-300' : !highlight ? 'bg-white' : ''}
      `}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-mono text-slate-400">#{txn.id}</span>
        <span className="text-xs font-medium text-slate-600">
          {formatAmount(txn.amount, txn.currency)}
        </span>
      </div>
      <div className="font-medium text-sm text-slate-800 mb-1.5">{txn.customer_name}</div>
      {txn.latest_cause && (
        <span
          className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border mb-1.5 ${
            CAUSE_COLORS[txn.latest_cause] || 'bg-slate-100 text-slate-700 border-slate-200'
          }`}
        >
          {CAUSE_LABELS[txn.latest_cause] || txn.latest_cause}
        </span>
      )}
      <div className="text-xs text-slate-400 mb-1">
        Attempt {txn.attempt_count} / 3
      </div>
      {txn.latest_message && (
        <p className="text-xs text-slate-500 line-clamp-2 mt-1.5 border-t border-slate-100 pt-1.5">
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
            <div className={`bg-white border border-slate-200 border-t-4 ${col.accent} rounded-2xl p-3 h-full`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-display font-bold text-slate-700">{col.label}</h3>
                <span
                  className={`text-xs font-semibold rounded-full px-2 py-0.5 transition-colors duration-300 ${
                    items.some((t) => justChangedIds.has(t.id))
                      ? 'bg-brand-100 text-brand-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {items.length}
                </span>
              </div>
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {items.length === 0 && (
                  <div className="text-xs text-slate-300 italic py-4 text-center">Empty</div>
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
