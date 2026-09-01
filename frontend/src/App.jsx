import { useEffect, useState } from 'react'
import { api } from './api'
import { simulateFreshActivity } from './simulateActivity'
import LandingPage from './components/LandingPage'
import StoryMode, { STORY_STEPS } from './components/StoryMode'
import MetricsHeader from './components/MetricsHeader'
import RevenueImpact from './components/RevenueImpact'
import CauseBreakdownTable from './components/CauseBreakdownTable'
import AdaptiveInsight from './components/AdaptiveInsight'
import SystemGuarantees from './components/SystemGuarantees'
import MessageShowcase from './components/MessageShowcase'
import LiveDemo from './components/LiveDemo'
import KanbanBoard from './components/KanbanBoard'
import TransactionDetailModal from './components/TransactionDetailModal'

function App() {
  const [view, setView] = useState('landing') // 'landing' | 'dashboard'
  const [transactions, setTransactions] = useState([])
  const [summary, setSummary] = useState(null)
  const [byCause, setByCause] = useState(null)
  const [revenue, setRevenue] = useState(null)
  const [insight, setInsight] = useState(null)
  const [guarantees, setGuarantees] = useState(null)
  const [showcase, setShowcase] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [simulating, setSimulating] = useState(false)
  const [lastSimCount, setLastSimCount] = useState(null)
  const [error, setError] = useState(null)
  const [lastLoaded, setLastLoaded] = useState(null)
  const [storyActive, setStoryActive] = useState(false)
  const [storyStep, setStoryStep] = useState(0)

  async function loadAll() {
    try {
      const [txns, sum, cause, rev, ins, guar, show] = await Promise.all([
        api.transactions(),
        api.metricsSummary(),
        api.metricsByCause(),
        api.revenueImpact(),
        api.adaptiveInsight(),
        api.systemGuarantees(),
        api.messagesShowcase(),
      ])
      setTransactions(txns)
      setSummary(sum)
      setByCause(cause)
      setRevenue(rev)
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
    // The landing page needs no backend at all — only fetch once the user
    // actually opens the dashboard, so a backend that isn't running yet
    // never surfaces an error banner on the marketing page.
    if (view === 'dashboard') loadAll()
  }, [view])

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

  function startStory() {
    setStoryStep(0)
    setStoryActive(true)
  }
  function nextStoryStep() {
    if (storyStep >= STORY_STEPS.length - 1) {
      setStoryActive(false)
      return
    }
    setStoryStep((s) => s + 1)
  }
  function backStoryStep() {
    setStoryStep((s) => Math.max(0, s - 1))
  }

  const needsHumanTxns = transactions.filter((t) => t.status === 'needs_human')
  // Prefer an insufficient_funds case for the pinned example — it has the
  // clearest story (lowest recovery rate; reminders genuinely don't help
  // until the customer has funds, so escalating after 3 is correct
  // behavior, not a bug). Falls back to any needs_human case.
  const pinnedNeedsHuman =
    needsHumanTxns.find((t) => t.latest_cause === 'insufficient_funds') || needsHumanTxns[0]

  if (view === 'landing') {
    return <LandingPage onLaunch={() => setView('dashboard')} />
  }

  return (
    <div className="min-h-screen app-backdrop text-slate-200">
      <header className="relative bg-gradient-to-br from-slate-950 via-brand-900 to-slate-950 px-6 py-6 sticky top-0 z-10 overflow-hidden shadow-lg shadow-black/40 border-b border-white/5">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle at 15% 30%, rgba(48,94,255,0.35), transparent 45%), radial-gradient(circle at 85% 70%, rgba(23,185,142,0.3), transparent 45%)',
          }}
        />
        <div className="relative max-w-7xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setView('landing')}
            className="flex items-center gap-3.5 text-left group"
            title="Back to home"
          >
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-brand-400 to-teal-400 flex items-center justify-center shrink-0 shadow-lg shadow-brand-500/40 ring-1 ring-white/20 group-hover:scale-105 transition-transform">
              <span className="text-white font-display font-extrabold text-lg">₹</span>
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight leading-none">
                <span className="text-white">AI Revenue</span>{' '}
                <span className="bg-gradient-to-r from-brand-300 to-teal-300 bg-clip-text text-transparent">
                  Recovery
                </span>
              </h1>
              <p className="text-sm text-slate-300 mt-1.5">
                Hinglish-voice payment recovery —{' '}
                <span className="text-brand-300 font-semibold">rule-based strategy</span>,{' '}
                <span className="text-teal-300 font-semibold">LLM copy</span>, live SQLite audit trail
              </p>
            </div>
          </button>
          <div className="flex items-center gap-3">
            {lastSimCount !== null && !simulating && (
              <span className="text-xs font-semibold text-teal-200 bg-teal-500/15 border border-teal-400/30 rounded-full px-3 py-1 animate-card-arrive">
                +{lastSimCount} new transaction{lastSimCount === 1 ? '' : 's'} processed
              </span>
            )}
            {lastLoaded && (
              <span className="text-xs text-slate-300 font-medium hidden sm:inline">
                Live from SQLite · {lastLoaded.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={startStory}
              className="text-sm font-bold text-teal-300 bg-teal-400/10 ring-1 ring-teal-400/40 rounded-full px-5 py-2.5 hover:bg-teal-400/20 hover:text-teal-200 inline-flex items-center gap-2 transition-all"
            >
              ▶ Story mode
            </button>
            <button
              onClick={refreshWithSimulatedActivity}
              disabled={simulating}
              className="text-sm font-bold bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-full px-5 py-2.5 hover:from-brand-400 hover:to-brand-500 disabled:opacity-70 inline-flex items-center gap-2 transition-all shadow-lg shadow-brand-600/40 hover:shadow-brand-500/50 hover:-translate-y-0.5"
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

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {loading && <div className="text-slate-400 text-sm">Loading live data…</div>}
        {error && (
          <div className="bg-rose-950/40 border border-rose-500/30 text-rose-300 text-sm rounded-2xl px-4 py-3">
            Failed to load from API: {error}. Is the backend running (py -3 api.py)?
          </div>
        )}

        {!loading && !error && (
          <>
            <div data-story="live-demo">
              <LiveDemo onResolved={loadAll} />
            </div>

            <MetricsHeader summary={summary} />

            <div data-story="revenue-impact">
              <RevenueImpact impact={revenue} />
            </div>

            <SystemGuarantees guarantees={guarantees} />

            <CauseBreakdownTable byCause={byCause} />

            <AdaptiveInsight insight={insight} />

            <div data-story="message-showcase">
              <MessageShowcase messages={showcase} />
            </div>

            {pinnedNeedsHuman && (
              <div data-story="needs-human-pin" className="panel border-rose-500/30 rounded-2xl px-5 py-3.5 flex items-center justify-between shadow-lg shadow-rose-950/30">
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-rose-400 shrink-0 shadow-[0_0_8px_2px_rgba(251,113,133,0.6)]" />
                  <div>
                    <span className="text-sm font-semibold text-rose-300">
                      Needs Human — example case pinned for demo
                    </span>
                    <span className="text-sm text-slate-400 ml-2">
                      #{pinnedNeedsHuman.id} {pinnedNeedsHuman.customer_name} — {pinnedNeedsHuman.razorpay_failure_code},
                      3 attempts exhausted
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedId(pinnedNeedsHuman.id)}
                  className="text-sm font-semibold text-rose-300 hover:text-rose-200 shrink-0 rounded-full border border-rose-500/40 px-3 py-1.5 hover:bg-rose-500/10 transition-colors"
                >
                  View audit trail →
                </button>
              </div>
            )}

            <section>
              <h2 className="text-sm font-display font-bold text-slate-300 mb-3 tracking-tight uppercase">Kanban Board</h2>
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

      <StoryMode
        active={storyActive}
        stepIndex={storyStep}
        onNext={nextStoryStep}
        onBack={backStoryStep}
        onExit={() => setStoryActive(false)}
      />
    </div>
  )
}

export default App
