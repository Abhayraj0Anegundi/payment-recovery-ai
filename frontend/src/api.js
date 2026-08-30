const BASE = '/api'

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API error ${res.status} on ${path}`)
  return res.json()
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `API error ${res.status} on ${path}`)
  return data
}

export const api = {
  transactions: () => get('/transactions'),
  transactionDetail: (id) => get(`/transactions/${id}`),
  metricsSummary: () => get('/metrics/summary'),
  metricsByCause: () => get('/metrics/by-cause'),
  needsHumanCount: () => get('/needs-human-count'),
  systemGuarantees: () => get('/metrics/system-guarantees'),
  adaptiveInsight: () => get('/metrics/adaptive-insight'),
  messagesShowcase: () => get('/messages/showcase'),
  triggerWebhook: (payload) => post('/webhook/payment-failed', payload),
  respondToTransaction: (id, response) => post(`/transactions/${id}/respond`, { response }),
}
