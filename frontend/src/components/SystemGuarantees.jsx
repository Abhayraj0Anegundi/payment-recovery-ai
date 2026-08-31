function Metric({ value, label, tone = 'default' }) {
  const toneClasses = {
    default: 'text-white',
    good: 'text-teal-300',
  }
  return (
    <div className="text-center px-3">
      <div
        className={`font-display text-3xl font-extrabold tracking-tight ${toneClasses[tone]}`}
        style={tone === 'good' ? { textShadow: '0 0 20px rgba(53,211,168,0.5)' } : undefined}
      >
        {value}
      </div>
      <div className="text-xs text-slate-400 mt-1 min-h-[2.25rem] flex items-start justify-center">{label}</div>
    </div>
  )
}

export default function SystemGuarantees({ guarantees }) {
  if (!guarantees) return null

  return (
    <div className="relative rounded-2xl px-5 py-5 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 ring-1 ring-teal-400/20 shadow-xl shadow-black/40">
      <div
        className="absolute inset-0 opacity-60 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 0% 0%, rgba(23,185,142,0.12), transparent 40%), radial-gradient(circle at 100% 100%, rgba(48,94,255,0.1), transparent 40%)',
        }}
      />
      <div className="relative">
        <div className="flex items-center gap-2 mb-4">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-400" />
          </span>
          <div className="text-xs font-bold text-teal-300 uppercase tracking-widest">
            System Guarantees — verifiable from audit_log, not asserted
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 divide-x divide-white/10">
          <Metric
            value={guarantees.strategy_decisions_made_by_llm}
            label={`of ${guarantees.total_decisions} strategy decisions made by LLM`}
          />
          <Metric
            value={guarantees.root_cause_classification.via_rule_table}
            label={`of ${guarantees.total_decisions} classified by rule table alone`}
            tone="good"
          />
          <Metric
            value={guarantees.attempt_cap.max_attempt_number_ever_recorded}
            label={`max attempt ever recorded (hard cap: ${guarantees.attempt_cap.hard_cap})`}
          />
          <Metric
            value={guarantees.attempt_cap.escalations_not_at_attempt_3}
            label="early escalations (attempt cap OR low-confidence override — see next)"
          />
          {guarantees.confidence_safety && (
            <Metric
              value={guarantees.confidence_safety.low_confidence_auto_escalations}
              label={`of ${guarantees.confidence_safety.low_confidence_classifications} low-confidence classifications auto-escalated`}
              tone="good"
            />
          )}
          <Metric
            value={guarantees.llm_calls.fallback_template_used}
            label={`LLM parse failures out of ${guarantees.llm_calls.message_generation} message calls`}
          />
        </div>
      </div>
    </div>
  )
}
