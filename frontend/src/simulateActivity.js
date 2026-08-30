import { api } from './api'

// Runs 2-3 real transactions through the real pipeline (real classify/decide,
// real Gemini message, real-or-mocked Razorpay link) so hitting Refresh feels
// like a live system with ongoing traffic, not a static report. Names are
// drawn from a pool clearly distinct from the seeded batch / demo presets so
// they read as "simulated activity," not confused with real submission data.
//
// This genuinely grows the transaction count in recovery.db by 2-3 rows per
// click — that's real, not faked — see the README's "Live traffic simulation"
// section for why the documented totals are described as a starting point
// rather than a frozen number.

const SIM_NAMES = [
  'Karthik Menon', 'Divya Rao', 'Manoj Kulkarni', 'Sneha Joshi', 'Arjun Nair',
  'Pooja Desai', 'Rajesh Iyer', 'Neha Kapoor', 'Vivek Pillai', 'Meera Shah',
]

const SIM_SCENARIOS = [
  { failure_code: 'bank_timeout', method: 'netbanking', amount: [50000, 300000] },
  { failure_code: 'card_declined', method: 'card', amount: [80000, 500000] },
  { failure_code: 'insufficient_funds', method: 'upi', amount: [30000, 200000] },
  { failure_code: '3ds_dropoff', method: 'card', amount: [100000, 400000] },
]

const RESPONSES = ['paid', 'ignored', 'promise_to_pay']

function randomPhone() {
  return '9' + Math.floor(100000000 + Math.random() * 900000000)
}

function randomOf(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomAmount([min, max]) {
  return Math.floor(min + Math.random() * (max - min))
}

/**
 * Fires `count` (default 2-3, randomized) real webhook transactions, each
 * immediately followed by a real simulated customer response, so the kanban
 * board actually shows movement (not just a growing "contacted" pile) after
 * a Refresh. Best-effort: a failure on one scenario (e.g. Razorpay quota)
 * doesn't stop the others. Returns the count that actually succeeded.
 */
export async function simulateFreshActivity() {
  const count = 2 + Math.floor(Math.random() * 2) // 2 or 3
  const usedNames = new Set()
  let succeeded = 0

  for (let i = 0; i < count; i++) {
    let name = randomOf(SIM_NAMES)
    while (usedNames.has(name) && usedNames.size < SIM_NAMES.length) {
      name = randomOf(SIM_NAMES)
    }
    usedNames.add(name)

    const scenario = randomOf(SIM_SCENARIOS)

    try {
      const result = await api.triggerWebhook({
        customer_name: name,
        customer_phone: randomPhone(),
        amount: randomAmount(scenario.amount),
        currency: 'INR',
        razorpay_failure_code: scenario.failure_code,
        failure_note: null,
        original_payment_method: scenario.method,
      })

      const txnId = result?.transaction?.id
      const isAwaiting = result?.transaction?.status === 'contacted'
      if (txnId && isAwaiting) {
        // Simulate a customer response so this doesn't just pile up in
        // "contacted" — gives Refresh visible movement across columns.
        await api.respondToTransaction(txnId, randomOf(RESPONSES))
      }
      succeeded++
    } catch (e) {
      // Best-effort — e.g. Razorpay quota exhausted mid-run. The pipeline's
      // own mock-link fallback already handles that gracefully; if the
      // webhook call itself fails for some other reason, just skip this one
      // scenario rather than blocking the rest of the refresh.
      console.warn('simulateFreshActivity: one scenario failed, continuing', e)
    }
  }

  return succeeded
}
