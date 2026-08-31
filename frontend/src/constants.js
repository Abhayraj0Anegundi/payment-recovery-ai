export const CAUSE_LABELS = {
  insufficient_funds: 'Insufficient Funds',
  bank_timeout: 'Bank Timeout',
  '3ds_dropoff': '3DS Dropoff',
  card_declined: 'Card Declined',
}

// Purely categorical cause colors — deliberately NOT amber (used elsewhere
// as the "insight/attention" semantic color) or rose (used elsewhere as the
// "needs_human/error" semantic color), so a cause tag never accidentally
// reads as a severity signal. Dark-theme variant: translucent tinted fill
// + matching ring instead of a solid light background.
export const CAUSE_COLORS = {
  insufficient_funds: 'bg-orange-400/10 text-orange-300 ring-1 ring-orange-400/30',
  bank_timeout: 'bg-sky-400/10 text-sky-300 ring-1 ring-sky-400/30',
  '3ds_dropoff': 'bg-violet-400/10 text-violet-300 ring-1 ring-violet-400/30',
  card_declined: 'bg-fuchsia-400/10 text-fuchsia-300 ring-1 ring-fuchsia-400/30',
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
