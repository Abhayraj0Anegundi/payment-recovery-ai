import { useEffect, useState } from 'react'
import { api } from './api'
import { simulateFreshActivity } from './simulateActivity'
import MetricsHeader from './components/MetricsHeader'
import CauseBreakdownTable from './components/CauseBreakdownTable'
import AdaptiveInsight from './components/AdaptiveInsight'
import SystemGuarantees from './components/SystemGuarantees'
import MessageShowcase from './components/MessageShowcase'
import LiveDemo from './components/LiveDemo'
import KanbanBoard from './components/KanbanBoard'
import TransactionDetailModal from './components/TransactionDetailModal'

function App() {
  const [transactions, setTransactions] = useState([])
  const [summary, setSummary] = useState(null)
  const [byCause, setByCause] = useState(null)
  const [insight, setInsight] = useState(null)
  const [guarantees, setGuarantees] = useState(null)
  const [showcase, setShowcase] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [simulating, setSimulating] = useState(false)
  const [lastSimCount, setLastSimCount] = useState(null)
  const [error, setError] = useState(null)
  const [lastLoaded, setLastLoaded] = useState(null)

  async function loadAll() {
    try {
      const [txns, sum, cause, ins, guar, show] = await Promise.all([
        api.transactions(),
        api.metricsSummary(),
        api.metricsByCause(),
        api.adaptiveInsight(),
        api.systemGuarantees(),
        api.messagesShowcase(),
      ])
      setTransactions(txns)
      setSummary(sum)
      setByCause(cause)
      setInsight(ins)
      setGuarantees(guar)
      setShowcase(show)
      setError(null)
      setLastLoaded(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  async function refreshWithSimulatedActivity() {
    setSimulating(true)
    setLastSimCount(null)
    try {
      const succeeded = await simulateFreshActivity()
      setLastSimCount(succeeded)
    } finally {
      setSimulating(false)
      await loadAll()
    }
  }

  const needsHumanTxns = transactions.filter((t) => t.status === 'needs_human')
  // Prefer an insufficient_funds case for the pinned example — it has the
  // clearest story (lowest recovery rate; reminders genuinely don't help
  // until the customer has funds, so escalating after 3 is correct
  // behavior, not a bug). Falls back to any needs_human case.
  const pinnedNeedsHuman =
    needsHumanTxns.find((t) => t.latest_cause === 'insufficient_funds') || needsHumanTxns[0]

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50/60 via-white to-white">
      <header className="bg-white/90 backdrop-blur border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand-600 to-teal-500 flex items-center justify-center shrink-0 shadow-sm shadow-brand-600/30">
              <span className="text-white font-display font-extrabold text-sm">₹</span>
            </div>
            <div>
              <h1 className="text-xl font-display font-extrabold text-slate-900 tracking-tight">
                AI Revenue Recovery
              </h1>
              <p className="text-sm text-slate-500">
                Hinglish-voice payment recovery — <span className="text-brand-700 font-medium">rule-based strategy</span>,{' '}
                <span className="text-teal-700 font-medium">LLM copy</span>, live SQLite audit trail
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastSimCount !== null && !simulating && (
              <span className="text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-3 py-1 animate-card-arrive">
                +{lastSimCount} new transaction{lastSimCount === 1 ? '' : 's'} processed
              </span>
            )}
            {lastLoaded && (
              <span className="text-xs text-slate-500 font-medium">
                Live from SQLite · {lastLoaded.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={refreshWithSimulatedActivity}
              disabled={simulating}
              className="text-sm font-semibold bg-slate-900 text-white rounded-full px-5 py-2 hover:bg-slate-700 disabled:opacity-70 inline-flex items-center gap-2 transition-colors shadow-sm"
            >
              {simulating && (
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {simulating ? 'Processing new payments…' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {loading && <div className="text-slate-400 text-sm">Loading live data…</div>}
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3">
            Failed to load from API: {error}. Is the backend running (py -3 api.py)?
          </div>
        )}

        {!loading && !error && (
          <>
            <LiveDemo onResolved={loadAll} />

            <MetricsHeader summary={summary} />

            <SystemGuarantees guarantees={guarantees} />

            <CauseBreakdownTable byCause={byCause} />

            <AdaptiveInsight insight={insight} />

            <MessageShowcase messages={showcase} />

            {pinnedNeedsHuman && (
              <div className="bg-white border border-rose-200 rounded-2xl px-5 py-3.5 flex items-center justify-between shadow-sm shadow-rose-100">
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                  <div>
                    <span className="text-sm font-semibold text-rose-700">
                      Needs Human — example case pinned for demo
                    </span>
                    <span className="text-sm text-slate-500 ml-2">
                      #{pinnedNeedsHuman.id} {pinnedNeedsHuman.customer_name} — {pinnedNeedsHuman.razorpay_failure_code},
                      3 attempts exhausted
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedId(pinnedNeedsHuman.id)}
                  className="text-sm font-semibold text-rose-700 hover:text-rose-800 shrink-0 rounded-full border border-rose-200 px-3 py-1.5 hover:bg-rose-50 transition-colors"
                >
                  View audit trail →
                </button>
              </div>
            )}

            <section>
              <h2 className="text-sm font-display font-bold text-slate-800 mb-3 tracking-tight">Kanban Board</h2>
              <KanbanBoard
                transactions={transactions}
                onSelect={setSelectedId}
                pinnedNeedsHumanId={pinnedNeedsHuman?.id}
              />
            </section>
          </>
        )}
      </main>

      <TransactionDetailModal transactionId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  )
}

export default App
