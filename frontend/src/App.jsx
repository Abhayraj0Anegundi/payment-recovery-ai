import { useEffect, useState } from 'react'
import { api } from './api'
import MetricsHeader from './components/MetricsHeader'
import CauseBreakdownTable from './components/CauseBreakdownTable'
import SystemGuarantees from './components/SystemGuarantees'
import MessageShowcase from './components/MessageShowcase'
import KanbanBoard from './components/KanbanBoard'
import TransactionDetailModal from './components/TransactionDetailModal'

function App() {
  const [transactions, setTransactions] = useState([])
  const [summary, setSummary] = useState(null)
  const [byCause, setByCause] = useState(null)
  const [guarantees, setGuarantees] = useState(null)
  const [showcase, setShowcase] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastLoaded, setLastLoaded] = useState(null)

  async function loadAll() {
    try {
      const [txns, sum, cause, guar, show] = await Promise.all([
        api.transactions(),
        api.metricsSummary(),
        api.metricsByCause(),
        api.systemGuarantees(),
        api.messagesShowcase(),
      ])
      setTransactions(txns)
      setSummary(sum)
      setByCause(cause)
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

  const needsHumanTxns = transactions.filter((t) => t.status === 'needs_human')
  // Prefer an insufficient_funds case for the pinned example — it has the
  // clearest story (lowest recovery rate; reminders genuinely don't help
  // until the customer has funds, so escalating after 3 is correct
  // behavior, not a bug). Falls back to any needs_human case.
  const pinnedNeedsHuman =
    needsHumanTxns.find((t) => t.latest_cause === 'insufficient_funds') || needsHumanTxns[0]

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">AI Revenue Recovery</h1>
            <p className="text-sm text-slate-500">
              Hinglish-voice payment recovery — rule-based strategy, LLM copy, live SQLite audit trail
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastLoaded && (
              <span className="text-xs text-slate-400">
                Live from SQLite · {lastLoaded.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={loadAll}
              className="text-sm font-medium bg-slate-900 text-white rounded-lg px-4 py-2 hover:bg-slate-700"
            >
              Refresh
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
            <MetricsHeader summary={summary} />

            <SystemGuarantees guarantees={guarantees} />

            <CauseBreakdownTable byCause={byCause} />

            <MessageShowcase messages={showcase} />

            {pinnedNeedsHuman && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl px-5 py-3 flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-rose-700">
                    Needs Human — example case pinned for demo
                  </span>
                  <span className="text-sm text-rose-600 ml-2">
                    #{pinnedNeedsHuman.id} {pinnedNeedsHuman.customer_name} — {pinnedNeedsHuman.razorpay_failure_code},
                    3 attempts exhausted
                  </span>
                </div>
                <button
                  onClick={() => setSelectedId(pinnedNeedsHuman.id)}
                  className="text-sm font-medium text-rose-700 underline shrink-0"
                >
                  View audit trail
                </button>
              </div>
            )}

            <section>
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Kanban Board</h2>
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
