/**
 * A small, consistent disclosure used everywhere a recovery-rate number is
 * shown. The transaction data (failure codes, amounts, causes) is real and
 * the classify/decide/message/link pipeline is real — but WHETHER a given
 * simulated customer "pays," "promises," or "ignores" is drawn from
 * hand-picked probability weights (pipeline.py's _OUTCOME_WEIGHTS), not
 * measured real-world behavior. Every recovery-rate number on this
 * dashboard is downstream of that simulation, so it's disclosed at the
 * point of display rather than only in the README.
 */
export default function SyntheticDataBadge({ className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-white/5 ring-1 ring-white/10 rounded-full px-2 py-0.5 ${className}`}
      title="Failure codes, causes, and messages are real. Whether a simulated customer pays/ignores/promises is drawn from hand-picked probability weights, not measured customer behavior — see pipeline.py's _OUTCOME_WEIGHTS."
    >
      <span className="h-1 w-1 rounded-full bg-slate-500" />
      simulated outcomes
    </span>
  )
}
