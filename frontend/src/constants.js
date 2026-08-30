export const CAUSE_LABELS = {
  insufficient_funds: 'Insufficient Funds',
  bank_timeout: 'Bank Timeout',
  '3ds_dropoff': '3DS Dropoff',
  card_declined: 'Card Declined',
}

export const CAUSE_COLORS = {
  insufficient_funds: 'bg-amber-100 text-amber-800 border-amber-200',
  bank_timeout: 'bg-sky-100 text-sky-800 border-sky-200',
  '3ds_dropoff': 'bg-violet-100 text-violet-800 border-violet-200',
  card_declined: 'bg-rose-100 text-rose-800 border-rose-200',
}

export const STRATEGY_LABELS = {
  retry_same_method: 'Retry Same Method',
  suggest_upi: 'Suggest UPI',
  send_reminder: 'Send Reminder',
  escalate_human: 'Escalate to Human',
}

export const STATUS_COLUMNS = [
  { key: 'failed', label: 'Failed', accent: 'border-t-slate-400' },
  { key: 'contacted', label: 'Contacted', accent: 'border-t-blue-400' },
  { key: 'promise_to_pay', label: 'Promise to Pay', accent: 'border-t-amber-400' },
  { key: 'recovered', label: 'Recovered', accent: 'border-t-emerald-400' },
  { key: 'needs_human', label: 'Needs Human', accent: 'border-t-rose-500' },
]

export function formatAmount(amountPaise, currency = 'INR') {
  const amount = amountPaise / 100
  const symbol = currency === 'INR' ? 'Rs.' : currency + ' '
  return `${symbol}${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
}
