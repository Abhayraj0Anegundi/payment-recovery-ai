export const CAUSE_LABELS = {
  insufficient_funds: 'Insufficient Funds',
  bank_timeout: 'Bank Timeout',
  '3ds_dropoff': '3DS Dropoff',
  card_declined: 'Card Declined',
}

// Purely categorical cause colors — deliberately NOT amber (used elsewhere
// as the "insight/attention" semantic color) or rose (used elsewhere as the
// "needs_human/error" semantic color), so a cause tag never accidentally
// reads as a severity signal.
export const CAUSE_COLORS = {
  insufficient_funds: 'bg-orange-100 text-orange-800 border-orange-200',
  bank_timeout: 'bg-sky-100 text-sky-800 border-sky-200',
  '3ds_dropoff': 'bg-violet-100 text-violet-800 border-violet-200',
  card_declined: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
}

export const STRATEGY_LABELS = {
  retry_same_method: 'Retry Same Method',
  suggest_upi: 'Suggest UPI',
  send_reminder: 'Send Reminder',
  escalate_human: 'Escalate to Human',
}

export const STATUS_COLUMNS = [
  { key: 'failed', label: 'Failed', accent: 'border-t-slate-400' },
  { key: 'contacted', label: 'Contacted', accent: 'border-t-brand-500' },
  { key: 'promise_to_pay', label: 'Promise to Pay', accent: 'border-t-amber-400' },
  { key: 'recovered', label: 'Recovered', accent: 'border-t-teal-500' },
  { key: 'needs_human', label: 'Needs Human', accent: 'border-t-rose-500' },
]

export function formatAmount(amountPaise, currency = 'INR') {
  const amount = amountPaise / 100
  const symbol = currency === 'INR' ? 'Rs.' : currency + ' '
  return `${symbol}${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
}
