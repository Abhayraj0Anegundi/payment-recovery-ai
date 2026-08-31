function Metric({ value, label, tone = 'default' }) {
  const toneClasses = {
    default: 'text-white',
    good: 'text-teal-400',
  }
  return (
    <div className="text-center px-3">
      <div className={`font-display text-2xl font-extrabold tracking-tight ${toneClasses[tone]}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-0.5 min-h-[2.25rem] flex items-start justify-center">{label}</div>
    </div>
  )
}

export default function SystemGuarantees({ guarantees }) {
  if (!guarantees) return null

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl px-5 py-4 ring-1 ring-white/5">
      <div className="flex items-center gap-2 mb-3">
        <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
        <div className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
          System Guarantees — verifiable from audit_log, not asserted
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 divide-x divide-slate-700">
        <Metric
          value={guarantees.strategy_decisions_made_by_llm}
          label={`of ${guarantees.total_decisions} strategy decisions made by LLM`}
        />
        <Metric
          value={guarantees.root_cause_classification.via_rule_table}
          label={`of ${guarantees.total_decisions} classified by rule table alone`}
        />
        <Metric
          value={guarantees.attempt_cap.max_attempt_number_ever_recorded}
          label={`max attempt ever recorded (hard cap: ${guarantees.attempt_cap.hard_cap})`}
        />
        <Metric
          value={guarantees.attempt_cap.escalations_not_at_attempt_3}
          label="escalations that happened before attempt 3"
        />
        <Metric
          value={guarantees.llm_calls.fallback_template_used}
          label={`LLM parse failures out of ${guarantees.llm_calls.message_generation} message calls`}
        />
      </div>
    </div>
  )
}
