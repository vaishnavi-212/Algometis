import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { createRouter, classifyError } from '../server/llm/router.js'
import { buildChain } from '../server/config.js'
import { buildSolveGraph, freshInput } from '../server/agent/solveGraph.js'
import { createProfileStore } from '../server/memory/store.js'

// fake clock so cooldowns and waits run instantly
const clock = () => {
  let t = 1_000_000
  return { now: () => t, sleep: async (ms) => void (t += ms), advance: (ms) => void (t += ms) }
}
const entry = (name, model, rpm = 30) => ({ id: `${name}:${model}`, name, kind: 'openai', label: name, baseURL: `https://${name}.test/v1`, model, apiKey: 'k', rpm, keyHint: '…k' })
const ok = (text = 'hi') => ({ ok: true, status: 200, headers: new Map(), text: async () => JSON.stringify({ choices: [{ message: { role: 'assistant', content: text } }] }) })
const err = (status, message = 'nope', headers = {}) => ({ ok: false, status, headers: new Map(Object.entries(headers)), text: async () => JSON.stringify({ error: { message } }) })
const hostOf = (url) => new URL(url).host.split('.')[0]
const ask = { system: 's', messages: [{ role: 'user', content: 'q' }], purpose: 'concept', hint: { mentioned: null } }

test('error classification', () => {
  assert.equal(classifyError({ status: 401 }).kind, 'disable')
  assert.equal(classifyError({ status: 404 }).kind, 'disable')
  assert.equal(classifyError({ status: 400, message: 'The model `x` has been decommissioned' }).kind, 'disable')
  assert.equal(classifyError({ status: 429, message: 'slow down', retryAfterMs: 5000 }).ms, 5000)
  assert.equal(classifyError({ status: 429, message: 'Quota exceeded for requests per day' }).daily, true)
  assert.equal(classifyError({ status: 503 }).kind, 'cool')
  assert.equal(classifyError({ status: 0, message: 'LLM request timed out' }).kind, 'cool')
  assert.equal(classifyError({ status: 400, message: 'context too long' }).kind, 'soft')
})

test('rate-limited primary fails over to the backup and then cools down', async () => {
  const c = clock()
  const hits = []
  const fetchImpl = async (url) => {
    hits.push(hostOf(url))
    return hostOf(url) === 'a' ? err(429, 'Too many requests', { 'retry-after': '20' }) : ok('from b')
  }
  const r = createRouter([entry('a', 'm1'), entry('b', 'm2')], { fetchImpl, now: c.now, sleep: c.sleep })
  const res = await r.chat(ask)
  assert.equal(res.text, 'from b')
  assert.equal(res.provider, 'b')
  assert.deepEqual(hits, ['a', 'b'])
  // while cooling, a is skipped completely
  await r.chat(ask)
  assert.deepEqual(hits, ['a', 'b', 'b'])
  const st = r.status()
  assert.equal(st.chain[0].state, 'cooling')
  assert.equal(st.chain[0].retryInSec, 20)
  assert.equal(st.stats.failovers, 1)
  // after Retry-After passes, a is used again
  c.advance(21_000)
  hits.length = 0
  await r.chat(ask).catch(() => {})
  assert.equal(hits[0], 'a')
})

test('bad key is disabled for hours; unknown model is disabled too', async () => {
  const c = clock()
  const fetchImpl = async (url, opts) => {
    const model = JSON.parse(opts.body).model
    if (model === 'bad-key') return err(401, 'invalid api key')
    if (model === 'gone') return err(404, 'model not found')
    return ok('good')
  }
  const r = createRouter([entry('x', 'bad-key'), entry('y', 'gone'), entry('z', 'fine')], { fetchImpl, now: c.now, sleep: c.sleep })
  assert.equal((await r.chat(ask)).text, 'good')
  const st = r.status().chain
  assert.equal(st[0].state, 'disabled')
  assert.match(st[0].reason, /key/)
  assert.equal(st[1].state, 'disabled')
  assert.match(st[1].reason, /model/)
  assert.equal(r.status().mode, 'online')
})

test('per-minute budget moves traffic to the next provider before any 429', async () => {
  const c = clock()
  const hits = []
  const fetchImpl = async (url) => (hits.push(hostOf(url)), ok())
  const r = createRouter([entry('a', 'm', 2), entry('b', 'm', 30)], { fetchImpl, now: c.now, sleep: c.sleep, maxWaitMs: 0 })
  for (let i = 0; i < 4; i++) await r.chat(ask)
  assert.deepEqual(hits, ['a', 'a', 'b', 'b'])
  assert.equal(r.status().chain[0].state, 'busy')
  c.advance(61_000)
  await r.chat(ask)
  assert.equal(hits.at(-1), 'a')
})

test('if every provider is briefly limited it waits instead of going offline', async () => {
  const c = clock()
  let n = 0
  const fetchImpl = async () => (n++ === 0 ? err(429, 'slow down', { 'retry-after': '3' }) : ok('after wait'))
  const r = createRouter([entry('solo', 'm')], { fetchImpl, now: c.now, sleep: c.sleep, maxWaitMs: 8000 })
  const res = await r.chat(ask)
  assert.equal(res.text, 'after wait')
  assert.equal(res.isMock, false)
})

test('offline rules only when nothing can answer (or an error if fallback is off)', async () => {
  const c = clock()
  const fetchImpl = async () => err(500, 'down')
  const r = createRouter([entry('a', 'm'), entry('b', 'm')], { fetchImpl, now: c.now, sleep: c.sleep, maxWaitMs: 0 })
  const res = await r.chat(ask)
  assert.equal(res.isMock, true)
  assert.equal(r.status().stats.offlineAnswers, 1)
  const strict = createRouter([entry('a', 'm')], { fetchImpl, now: c.now, sleep: c.sleep, maxWaitMs: 0, offlineFallback: false })
  await assert.rejects(strict.chat(ask), /unavailable/)
  // soft errors (400) try the next entry without a cooldown
  const soft = createRouter([entry('a', 'm'), entry('b', 'm')], { fetchImpl: async (url) => (hostOf(url) === 'a' ? err(400, 'too long') : ok('b ok')), now: c.now, sleep: c.sleep })
  assert.equal((await soft.chat(ask)).text, 'b ok')
  assert.equal(soft.status().chain[0].state, 'ready')
})

test('no keys → fully offline router', async () => {
  const r = createRouter([])
  assert.equal(r.isMock, true)
  assert.equal(r.status().mode, 'offline')
  assert.equal((await r.chat(ask)).isMock, true)
})

test('chain built from .env: order, several keys, model overrides, legacy settings', () => {
  const chain = buildChain({ GROQ_API_KEY: 'g1,g2', GEMINI_API_KEY: 'gem', GEMINI_MODELS: 'flash-a,flash-b', MISTRAL_API_KEY: 'mi', GROQ_RPM: '5' })
  assert.deepEqual(
    chain.map((e) => `${e.name}/${e.model}/${e.apiKey}`),
    ['gemini/flash-a/gem', 'gemini/flash-b/gem', 'groq/openai/gpt-oss-120b/g1', 'groq/openai/gpt-oss-120b/g2', 'groq/qwen/qwen3.8-27b/g1', 'groq/qwen/qwen3.8-27b/g2', 'groq/llama-3.3-70b-versatile/g1', 'groq/llama-3.3-70b-versatile/g2', 'mistral/mistral-small-latest/mi']
  )
  assert.equal(chain[2].rpm, 5)
  assert.equal(chain[0].keyHint, '…gem') // keys are never sent to the browser in full
  const ordered = buildChain({ LLM_CHAIN: 'mistral,gemini', GEMINI_API_KEY: 'a', MISTRAL_API_KEY: 'b', GEMINI_MODELS: 'x' })
  assert.deepEqual(ordered.map((e) => e.name), ['mistral', 'gemini'])
  const legacy = buildChain({ LLM_PROVIDER: 'groq', LLM_API_KEY: 'old', LLM_MODEL: 'm', GEMINI_API_KEY: 'a', GEMINI_MODELS: 'x' })
  assert.deepEqual(legacy.map((e) => `${e.name}/${e.model}`), ['groq/m', 'gemini/x'])
  assert.deepEqual(buildChain({}), [])
  assert.deepEqual(buildChain({ OLLAMA_URL: 'http://pc:11434/v1' }).map((e) => e.baseURL), ['http://pc:11434/v1'])
})

test('full agent run survives the first provider being rate limited mid-conversation', async () => {
  const c = clock()
  const reply = (toolCalls, content = null) => ({ ok: true, status: 200, headers: new Map(), text: async () => JSON.stringify({ choices: [{ message: { role: 'assistant', content, tool_calls: toolCalls } }] }) })
  const tc = (name, args, id) => [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }]
  let primaryCalls = 0
  const input = { nodes: ['Depot', 'Clinic', 'Hospital'], edges: [{ from: 'Depot', to: 'Clinic', weight: 4 }, { from: 'Clinic', to: 'Hospital', weight: 3 }, { from: 'Depot', to: 'Hospital', weight: 9 }], directed: false, source: 'Depot', target: 'Hospital', meta: { title: 'Ambulance route', unit: 'min' } }
  const used = []
  const fetchImpl = async (url, opts) => {
    const host = hostOf(url)
    // primary answers the first two calls, then its free quota runs out
    if (host === 'primary' && ++primaryCalls > 2) return err(429, 'Resource has been exhausted (e.g. check quota).')
    used.push(host)
    const body = JSON.parse(opts.body)
    const names = (body.tools || []).map((t) => t.function.name)
    const msgs = body.messages
    if (names.includes('route')) return reply(tc('route', { kind: 'problem', reason: 'routing problem' }, 'r1'))
    if (names.includes('report_constraints')) return reply(tc('report_constraints', { problemType: 'shortest_path', constraints: { weighted: true, size: 40 }, missing: [], summary: 'Fastest route', entities: ['Depot', 'Hospital'] }, 'a1'))
    if (names.includes('write_explanation')) return reply(tc('write_explanation', { because: 'Travel times differ and none are negative, so Dijkstra fits.', inYourWords: 'From the Depot it always settles the closest place next.', personalNote: '' }, 'e1'))
    const lastUser = msgs.map((m) => m.role).lastIndexOf('user')
    const done = msgs.slice(lastUser + 1).filter((m) => m.role === 'tool')
    const step = [
      ['search_catalog', { problemType: 'shortest_path', constraints: { weighted: true, size: 40 } }],
      ['get_input_schema', { algorithmId: 'dijkstra' }],
      ['validate_input', { algorithmId: 'dijkstra', inputJson: JSON.stringify(input) }],
      ['compare_algorithms', { algorithmIds: ['dijkstra', 'bellman_ford'], inputJson: JSON.stringify(input) }],
      ['submit_recommendation', { algorithmId: 'dijkstra', inputJson: JSON.stringify(input), inputIsExample: false }],
    ][done.length]
    return reply(tc(step[0], step[1], `x${done.length}`))
  }
  const llm = createRouter([entry('primary', 'p'), entry('backup', 'b')], { fetchImpl, now: c.now, sleep: c.sleep })
  const store = createProfileStore(fs.mkdtempSync(path.join(os.tmpdir(), 'algometis-router-')))
  const out = await buildSolveGraph().invoke(freshInput('w', 'Fastest ambulance route from depot to hospital, times in minutes'), { threadId: 'failover', context: { llm, store } })
  const rec = out.state.response.recommendation
  assert.equal(rec.algorithmId, 'dijkstra')
  assert.equal(rec.explanationSource, 'llm') // the AI (backup) wrote it, not offline rules
  assert.deepEqual(used.slice(0, 2), ['primary', 'primary'])
  assert.ok(used.slice(2).every((h) => h === 'backup'))
  const st = llm.status()
  assert.equal(st.chain[0].state, 'cooling')
  assert.match(st.chain[0].reason, /quota/)
  assert.equal(st.stats.offlineAnswers, 0)
})
