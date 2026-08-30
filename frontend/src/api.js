const BASE = '/api'

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API error ${res.status} on ${path}`)
  return res.json()
}

export const api = {
  transactions: () => get('/transactions'),
  transactionDetail: (id) => get(`/transactions/${id}`),
  metricsSummary: () => get('/metrics/summary'),
  metricsByCause: () => get('/metrics/by-cause'),
  needsHumanCount: () => get('/needs-human-count'),
  systemGuarantees: () => get('/metrics/system-guarantees'),
  messagesShowcase: () => get('/messages/showcase'),
}
