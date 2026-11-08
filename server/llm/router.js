// LLM router: an ordered chain of providers with automatic failover.
//
// Every chat() call walks the chain from the top and uses the first entry that is ready:
//   * per-minute budget: each entry has a self-imposed RPM cap a little under the free limit, so
//     traffic moves to the next provider BEFORE the provider starts answering 429.
//   * cooldowns: a 429 / 5xx / timeout puts the entry on a cooldown (Retry-After when the provider
//     gives one, otherwise growing back-off). "Quota exhausted for the day" cools for an hour.
//   * disabled: a bad key (401/403) or a model that no longer exists (404 / "not found") is parked
//     for hours, so live requests never waste time on it.
//   * soft failures (other 400s, e.g. a request too large for that model) just try the next entry.
// If every entry is cooling down, it waits briefly for the first one to free up; only when nothing
// can answer does it fall back to the offline rule-based mock (marked `isMock` on the result).
//
// Switching provider in the middle of an agent run is safe: the agent keeps one internal message
// format (see providers.js) and every adapter translates it.

import { createOpenAICompatible, createAnthropic } from './providers.js'
import { createMock } from './mock.js'

const SEC = 1000
const MIN = 60 * SEC

export function classifyError(e) {
  const status = e?.status ?? 0
  const msg = String(e?.message || '').toLowerCase()
  if (status === 401 || status === 403) return { kind: 'disable', ms: 6 * 60 * MIN, reason: 'key rejected (401/403): check the API key' }
  if (status === 404 || (status === 400 && /model.*(not found|does not exist|decommission|deprecated|not supported)|unknown model|invalid model/.test(msg)))
    return { kind: 'disable', ms: 6 * 60 * MIN, reason: 'model not available: set <PROVIDER>_MODELS in .env' }
  if (status === 429) {
    const daily = /per day|daily|quota|exhausted|billing|credits/.test(msg)
    return { kind: 'cool', ms: e.retryAfterMs ?? (daily ? 60 * MIN : 0), reason: daily ? 'free quota used up' : 'rate limited (429)', daily }
  }
  if (status === 402) return { kind: 'cool', ms: 60 * MIN, reason: 'out of credits (402)', daily: true }
  if (status >= 500 || status === 0) return { kind: 'cool', ms: 0, reason: status ? `server error (${status})` : msg.includes('timed out') ? 'timed out' : 'network error' }
  return { kind: 'soft', reason: `request rejected (${status}): ${msg.slice(0, 120)}` }
}

export function createRouter(entries, { timeoutMs = 30000, maxWaitMs = 8000, offlineFallback = true, fetchImpl, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} } = {}) {
  const mock = createMock()
  const slots = entries.map((cfg) => ({
    cfg,
    client: (cfg.kind === 'anthropic' ? createAnthropic : createOpenAICompatible)({ ...cfg, fetchImpl, retries: 0, timeoutMs }),
    until: 0, // cooldown / disabled until this time
    disabled: false,
    reason: '',
    strikes: 0, // consecutive failures → longer back-off
    recent: [], // timestamps of requests in the last minute
    ok: 0,
    failed: 0,
    lastUsed: 0,
    lastError: '',
  }))
  const stats = { requests: 0, served: 0, offlineAnswers: 0, failovers: 0, lastProvider: null, lastOfflineAt: 0 }

  const prune = (s, t) => {
    while (s.recent.length && t - s.recent[0] > MIN) s.recent.shift()
  }
  const readyIn = (s, t) => {
    prune(s, t)
    let wait = Math.max(0, s.until - t)
    if (s.recent.length >= s.cfg.rpm) wait = Math.max(wait, MIN - (t - s.recent[0]) + 50)
    return wait
  }
  const stateOf = (s, t) => {
    if (s.disabled && s.until > t) return 'disabled'
    if (s.until > t) return 'cooling'
    prune(s, t)
    if (s.recent.length >= s.cfg.rpm) return 'busy'
    return 'ready'
  }

  function fail(s, e) {
    const c = classifyError(e)
    s.failed++
    s.lastError = c.reason
    if (c.kind === 'soft') return c
    s.strikes++
    const backoff = Math.min(10 * MIN, 15 * SEC * 2 ** (s.strikes - 1)) // 15s, 30s, 1m, 2m … 10m
    s.until = now() + (c.ms || backoff)
    s.disabled = c.kind === 'disable'
    s.reason = c.reason
    log(`[llm] ${s.cfg.label} ${s.cfg.model}: ${c.reason}; next try in ${Math.round((s.until - now()) / SEC)}s`)
    return c
  }

  async function attempt(s, args) {
    s.recent.push(now())
    s.lastUsed = now()
    const res = await s.client.chat(args)
    s.ok++
    s.strikes = 0
    s.reason = ''
    s.disabled = false
    return { ...res, provider: s.cfg.name, label: s.cfg.label, model: s.cfg.model, isMock: false }
  }

  async function chat(args) {
    stats.requests++
    const tried = new Map() // entry → attempts in this call (max 2, the 2nd only after a short wait)
    const canTry = (s) => (tried.get(s) || 0) < 2
    const deadline = now() + Math.max(maxWaitMs, 0)
    let firstChoice = true
    for (;;) {
      const t = now()
      const candidates = slots.filter((s) => canTry(s) && readyIn(s, t) === 0)
      if (candidates.length) {
        const s = candidates[0]
        tried.set(s, (tried.get(s) || 0) + 1)
        try {
          const res = await attempt(s, args)
          if (!firstChoice) stats.failovers++
          stats.served++
          stats.lastProvider = s.cfg.label
          return res
        } catch (e) {
          fail(s, e)
          firstChoice = false
          continue
        }
      }
      // nothing ready right now: wait for the soonest entry if it frees up within the budget
      const waits = slots.filter((s) => !s.disabled && canTry(s)).map((s) => readyIn(s, now()))
      const soonest = waits.length ? Math.min(...waits) : Infinity
      if (soonest !== Infinity && now() + soonest <= deadline) {
        await sleep(soonest + 10)
        continue
      }
      break
    }
    if (!offlineFallback) throw new Error('All AI providers are unavailable right now (rate limits or errors). Try again in a minute.')
    stats.offlineAnswers++
    stats.lastOfflineAt = now()
    const res = await mock.chat(args)
    return { ...res, provider: 'mock', label: 'Offline rules', model: 'rule-based', isMock: true }
  }

  function status() {
    const t = now()
    const chain = slots.map((s) => ({
      id: s.cfg.id,
      provider: s.cfg.name,
      label: s.cfg.label,
      model: s.cfg.model,
      key: s.cfg.keyHint,
      state: stateOf(s, t),
      retryInSec: Math.ceil(Math.max(0, s.until - t) / SEC),
      reason: s.reason,
      lastError: s.lastError,
      rpm: s.cfg.rpm,
      usedLastMinute: s.recent.length,
      ok: s.ok,
      failed: s.failed,
    }))
    const usable = chain.filter((c) => c.state === 'ready' || c.state === 'busy' || c.state === 'cooling')
    const ready = chain.find((c) => c.state === 'ready')
    return {
      configured: slots.length,
      ready: chain.filter((c) => c.state === 'ready').length,
      active: ready ? `${ready.label} · ${ready.model}` : null,
      mode: !slots.length ? 'offline' : ready ? 'online' : usable.length ? 'busy' : 'offline',
      stats: { ...stats, offlineRecently: t - stats.lastOfflineAt < 10 * MIN && stats.lastOfflineAt > 0 },
      chain,
    }
  }

  const first = slots[0]?.cfg
  return {
    chat,
    status,
    isMock: slots.length === 0,
    provider: slots.length ? 'router' : 'mock',
    label: slots.length ? `${first.label}${slots.length > 1 ? ` + ${slots.length - 1} backup${slots.length > 2 ? 's' : ''}` : ''}` : 'Offline demo mode',
    model: slots.length ? first.model : 'rule-based-demo',
    _slots: slots,
  }
}
