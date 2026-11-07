import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { StateGraph, START, END, interrupt, Command } from '../server/agent/graphEngine.js'
import { buildSolveGraph, freshInput } from '../server/agent/solveGraph.js'
import { createMock } from '../server/llm/mock.js'
import { createProfileStore } from '../server/memory/store.js'
import { createOpenAICompatible, createAnthropic } from '../server/llm/providers.js'
import { checkClaims, extractBigO } from '../server/agent/explain.js'
import { runTutor } from '../server/agent/tutor.js'
import { ALGORITHMS } from '../shared/registry.js'
import { createApp } from '../server/index.js'

const tmpStore = () => createProfileStore(fs.mkdtempSync(path.join(os.tmpdir(), 'algometis-')))
const mock = () => ({ ...createMock(), isMock: true, provider: 'mock' })
const nodesOf = (trace) => [...new Set(trace.map((t) => t.node))]

test('graph engine: reducers, conditional edges, interrupt and resume', async () => {
  const g = new StateGraph({ log: { default: () => [], reducer: (a, b) => [...a, ...b] }, n: { default: () => 0 }, answer: { default: () => null } })
  g.addNode('a', (s) => ({ log: ['a'], n: s.n + 1 }))
  g.addNode('ask', () => ({ answer: interrupt({ q: 'name?' }), log: ['ask'] }))
  g.addNode('b', () => ({ log: ['b'] }))
  g.addEdge(START, 'a')
  g.addConditionalEdges('a', (s) => (s.n < 3 ? 'a' : 'ask'))
  g.addEdge('ask', 'b')
  g.addEdge('b', END)
  const app = g.compile()
  const r1 = await app.invoke({}, { threadId: 't1' })
  assert.equal(r1.status, 'interrupted')
  assert.deepEqual(r1.interrupt, { q: 'name?' })
  assert.deepEqual(r1.state.log, ['a', 'a', 'a'])
  const r2 = await app.invoke(new Command({ resume: 'Vaishnavi' }), { threadId: 't1' })
  assert.equal(r2.status, 'done')
  assert.equal(r2.state.answer, 'Vaishnavi')
  assert.deepEqual(r2.state.log, ['a', 'a', 'a', 'ask', 'b'])
})

test('solve agent (offline mock): weighted route problem → Dijkstra with evidence and full trace', async () => {
  const graph = buildSolveGraph()
  const store = tmpStore()
  const out = await graph.invoke(freshInput('stu1', 'I run a food delivery service and want the fastest route from the kitchen to customers. Travel times are in minutes.'), { threadId: 'x1', context: { llm: mock(), store } })
  assert.equal(out.status, 'done')
  const r = out.state.response
  assert.equal(r.status, 'done')
  assert.equal(r.recommendation.algorithmId, 'dijkstra')
  assert.equal(r.recommendation.scoring.candidates.find((c) => c.id === 'bfs').status, 'rejected')
  assert.ok(r.recommendation.evidence.rows.length >= 2)
  assert.ok(r.recommendation.evidence.rows.some((x) => x.algorithmId === 'bfs' && x.sameAnswerAsFirst === false), 'BFS gives a different (worse) answer on weighted data')
  assert.ok(r.recommendation.whyNot.find((w) => w.id === 'bfs').reason.includes('ignores costs'))
  for (const n of ['memory', 'router', 'analyzer', 'executor', 'critic', 'explainer', 'finalize']) assert.ok(nodesOf(out.state.trace).includes(n), `trace has ${n}`)
  const tools = out.state.trace.filter((t) => t.kind === 'tool_call').map((t) => t.tool)
  for (const t of ['get_student_profile', 'search_catalog', 'get_input_schema', 'validate_input', 'compare_algorithms', 'submit_recommendation']) assert.ok(tools.includes(t), `called ${t}`)
  assert.equal(store.getProfile('stu1').recommended[0].algoId, 'dijkstra')
})

test('solve agent: asks a clarifying question (interrupt) and resumes with the answer', async () => {
  const graph = buildSolveGraph()
  const ctx = { context: { llm: mock(), store: tmpStore() } }
  const r1 = await graph.invoke(freshInput('stu2', 'What is the shortest path between the hostels on campus?'), { threadId: 'x2', ...ctx })
  assert.equal(r1.status, 'interrupted')
  assert.match(r1.interrupt.questions[0], /different costs/)
  const r2 = await graph.invoke(new Command({ resume: 'Yes, each road has a different distance in metres' }), { threadId: 'x2', ...ctx })
  assert.equal(r2.status, 'done')
  assert.equal(r2.state.response.recommendation.algorithmId, 'dijkstra')
  const r3 = await buildSolveGraph().invoke(freshInput('s', 'Pack my bag with the most valuable items, capacity 10 kg'), { threadId: 'x3', ...ctx })
  assert.equal(r3.status, 'interrupted')
  const g = buildSolveGraph()
  await g.invoke(freshInput('s', 'Pack my bag with the most valuable items, capacity 10 kg'), { threadId: 'x4', ...ctx })
  const r4 = await g.invoke(new Command({ resume: "No, each item is whole, you can't split it" }), { threadId: 'x4', ...ctx })
  assert.equal(r4.state.response.recommendation.algorithmId, 'knapsack_01')
})

test('solve agent: off-topic is refused, concept question is answered', async () => {
  const ctx = { context: { llm: mock(), store: tmpStore() } }
  const a = await buildSolveGraph().invoke(freshInput('s', 'What is the capital of France?'), { threadId: 'o1', ...ctx })
  assert.equal(a.state.response.status, 'refused')
  const b = await buildSolveGraph().invoke(freshInput('s', 'What is the difference between BFS and DFS?'), { threadId: 'o2', ...ctx })
  assert.equal(b.state.response.status, 'answer')
})

// A scripted fake LLM: lets us test the critic loop and the fact-checker deterministically.
function scripted(handlers) {
  const base = mock()
  return { ...base, isMock: false, provider: 'scripted', chat: async (args) => (handlers[args.purpose] ? handlers[args.purpose](args, base) : base.chat(args)) }
}

test('critic rejects a wrong pick, executor revises; explainer fact-check rejects invented numbers', async () => {
  let execCalls = 0
  let explainCalls = 0
  const llm = scripted({
    executor: async (args, base) => {
      execCalls++
      const critic = args.messages.some((m) => m.role === 'user' && m.content.startsWith('CRITIC'))
      const tc = (name, a) => ({ text: 'thinking', toolCalls: [{ id: `c${execCalls}`, name, args: a }] })
      const input = { values: [5, 3, 8, 1, 9, 2], meta: { title: 'scores' } }
      if (!critic) {
        // deliberately bad first attempt: bubble sort for 100k items
        return execCalls === 1 ? tc('submit_recommendation', { algorithmId: 'bubble_sort', input }) : { text: 'done', toolCalls: [] }
      }
      const done = args.messages.filter((m) => m.role === 'tool' && m.name === 'submit_recommendation').length > 1
      return done ? { text: 'ok', toolCalls: [] } : tc('submit_recommendation', { algorithmId: 'merge_sort', input })
    },
    analyzer: async () => ({ text: '', toolCalls: [{ id: 'a', name: 'report_constraints', args: { problemType: 'sort', constraints: { size: 100000, needStable: true }, missing: [], summary: 'Sort 100000 student records keeping ties in order', entities: [] } }] }),
    explainer: async () => {
      explainCalls++
      const bad = { because: 'Merge sort is stable and runs in O(n log n).', inYourWords: 'It finished in 999 steps.', personalNote: '' }
      const good = { because: 'Merge sort is stable and runs in O(n log n).', inYourWords: 'It splits your list and merges sorted halves.', personalNote: '' }
      return { text: '', toolCalls: [{ id: `e${explainCalls}`, name: 'write_explanation', args: explainCalls === 1 ? bad : good }] }
    },
  })
  const out = await buildSolveGraph().invoke(freshInput('s', 'sort 100000 student records, ties must keep order'), { threadId: 'c1', context: { llm, store: tmpStore() } })
  const rec = out.state.response.recommendation
  assert.equal(rec.algorithmId, 'merge_sort')
  assert.equal(rec.critic.revisions, 1)
  assert.ok(out.state.trace.some((t) => t.node === 'critic' && /Rejected/.test(t.title)))
  assert.equal(rec.explanationSource, 'llm')
  assert.equal(explainCalls, 2, 'first explanation failed the fact-check, second passed')
  assert.ok(out.state.trace.some((t) => t.node === 'explainer' && t.ok === false && /999/.test(t.detail)))
})

test('claim checker handles nested O() and commas', () => {
  assert.deepEqual(extractBigO('runs in O((V + E) log V) and O(n)'), ['O((V + E) log V)', 'O(n)'])
  const pack = { x: '≈ 1,129 basic steps', y: 45 }
  assert.equal(checkClaims(['about 1,129 steps, 45 animation steps, O(V·E)'], pack).ok, true)
  assert.equal(checkClaims(['O(n^5) and 77 steps'], pack).issues.length, 2)
})

test('tutor agent (mock): explains current step, jumps, and re-runs with custom input', async () => {
  const store = tmpStore()
  const a = await runTutor({ llm: mock(), store, studentId: 's', algoId: 'bubble_sort', input: ALGORITHMS.bubble_sort.sample, stepIndex: 3, question: 'why is this happening?' })
  assert.match(a.answer, /At step 4/)
  const b = await runTutor({ llm: mock(), store, studentId: 's', algoId: 'bubble_sort', input: ALGORITHMS.bubble_sort.sample, stepIndex: 0, question: 'show me step 10' })
  assert.deepEqual(b.actions[0], { type: 'jump', index: 9 })
  const c = await runTutor({ llm: mock(), store, studentId: 's', algoId: 'bubble_sort', input: ALGORITHMS.bubble_sort.sample, stepIndex: 0, question: 'what if the data was already sorted?' })
  assert.equal(c.actions[0].type, 'load_input')
  assert.match(c.answer, /re-ran/)
  assert.equal(store.getProfile('s').tutorQuestions.bubble_sort, 3)
})

test('OpenAI-compatible adapter: request shape and tool-call parsing', async () => {
  let sent
  const fetchImpl = async (url, opts) => {
    sent = { url, body: JSON.parse(opts.body), headers: opts.headers }
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'route', arguments: '{"kind":"problem","reason":"x"}' } }] } }] }) }
  }
  const c = createOpenAICompatible({ baseURL: 'https://example.test/v1', apiKey: 'k', model: 'm', fetchImpl })
  const r = await c.chat({
    system: 'sys',
    messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: '', toolCalls: [{ id: 'a1', name: 't', args: { x: 1 } }] }, { role: 'tool', toolCallId: 'a1', name: 't', content: '{"ok":true}' }],
    tools: [{ name: 'route', description: 'd', parameters: { type: 'object', properties: {} } }],
    toolChoice: { name: 'route' },
  })
  assert.equal(sent.url, 'https://example.test/v1/chat/completions')
  assert.equal(sent.headers.authorization, 'Bearer k')
  assert.equal(sent.body.messages[0].role, 'system')
  assert.equal(sent.body.messages[2].tool_calls[0].function.arguments, '{"x":1}')
  assert.equal(sent.body.messages[3].tool_call_id, 'a1')
  assert.deepEqual(sent.body.tool_choice, { type: 'function', function: { name: 'route' } })
  assert.deepEqual(r.toolCalls[0], { id: 'call_1', name: 'route', args: { kind: 'problem', reason: 'x' } })
})

test('Anthropic adapter: groups tool results into one user turn', async () => {
  let sent
  const fetchImpl = async (url, opts) => {
    sent = { url, body: JSON.parse(opts.body), headers: opts.headers }
    return { ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: 'text', text: 'hmm' }, { type: 'tool_use', id: 'tu1', name: 'get_step', input: { index: 2 } }] }) }
  }
  const c = createAnthropic({ baseURL: 'https://api.example/v1', apiKey: 'k', model: 'claude-x', fetchImpl })
  const r = await c.chat({
    system: 'sys',
    messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 'x', args: {} }, { id: 'b', name: 'y', args: {} }] }, { role: 'tool', toolCallId: 'a', content: '1' }, { role: 'tool', toolCallId: 'b', content: '2' }, { role: 'user', content: 'fix it' }],
    tools: [{ name: 'get_step', description: 'd', parameters: { type: 'object', properties: {} } }],
    toolChoice: 'required',
  })
  assert.equal(sent.headers['x-api-key'], 'k')
  assert.equal(sent.body.messages.length, 3)
  assert.deepEqual(sent.body.messages[2].content.map((b) => b.type), ['tool_result', 'tool_result', 'text'])
  assert.deepEqual(sent.body.tool_choice, { type: 'any' })
  assert.equal(r.text, 'hmm')
  assert.deepEqual(r.toolCalls[0], { id: 'tu1', name: 'get_step', args: { index: 2 } })
})

test('HTTP API smoke test (mock LLM)', async () => {
  const server = createApp({ llm: mock(), store: tmpStore(), staticDir: fs.mkdtempSync(path.join(os.tmpdir(), 'static-')) })
  await new Promise((r) => server.listen(0, r))
  const base = `http://127.0.0.1:${server.address().port}`
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json())
  try {
    const health = await fetch(`${base}/api/health`).then((r) => r.json())
    assert.equal(health.offlineDemo, true)
    const cat = await fetch(`${base}/api/catalog`).then((r) => r.json())
    assert.equal(cat.algorithms.length, Object.keys(ALGORITHMS).length)
    const s1 = await post('/api/agent/solve', { threadId: 'h1', studentId: 'web', message: 'Find the shortest path between places in our city' })
    assert.equal(s1.status, 'clarify')
    const s2 = await post('/api/agent/solve', { threadId: 'h1', studentId: 'web', message: 'Every stop is one hop, they all count the same' })
    assert.equal(s2.status, 'done')
    assert.equal(s2.recommendation.algorithmId, 'bfs')
    const rs = await post('/api/rescore', { problemType: 'shortest_path', constraints: { size: 50, negativeWeights: true, weighted: true }, input: ALGORITHMS.bellman_ford.sample })
    assert.equal(rs.chosen, 'bellman_ford')
    const wi = await post('/api/rescore', { problemType: 'shortest_path', constraints: { size: 50, negativeWeights: false, weighted: true }, input: ALGORITHMS.bellman_ford.sample, whatIf: true })
    assert.equal(wi.chosen, 'dijkstra')
    const tut = await post('/api/agent/tutor', { studentId: 'web', algoId: 'dijkstra', input: ALGORITHMS.dijkstra.sample, stepIndex: 5, question: 'why?' })
    assert.ok(tut.answer.length > 10)
    const prof = await post('/api/profile/web/studied', { algoId: 'bfs' })
    assert.equal(prof.studied.bfs.count, 1)
  } finally {
    server.close()
  }
})

test('full agent run through the OpenAI-compatible wire format (fake HTTP server)', async () => {
  const calls = []
  const reply = (toolCalls, content = null) => ({ ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { role: 'assistant', content, tool_calls: toolCalls } }] }) })
  const tc = (name, args, id) => [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }]
  const fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body)
    calls.push(body)
    const names = (body.tools || []).map((t) => t.function.name)
    const msgs = body.messages
    if (names.includes('route')) return reply(tc('route', { kind: 'problem', reason: 'routing problem' }, 'r1'))
    if (names.includes('report_constraints')) return reply(tc('report_constraints', { problemType: 'shortest_path', constraints: { weighted: true, size: 40 }, missing: [], summary: 'Fastest route from the depot to the hospital', entities: ['Depot', 'Hospital'] }, 'a1'))
    if (names.includes('write_explanation')) return reply(tc('write_explanation', { because: 'Travel times differ and none are negative, so Dijkstra fits.', inYourWords: 'From the Depot it always settles the closest place next.', personalNote: '' }, 'e1'))
    // executor: decide from the tool messages since the last user message
    const lastUser = msgs.map((m) => m.role).lastIndexOf('user')
    const done = msgs.slice(lastUser + 1).filter((m) => m.role === 'tool')
    // every tool message must reference a previous assistant tool_call id
    for (const t of done) assert.ok(msgs.some((m) => m.role === 'assistant' && m.tool_calls?.some((c) => c.id === t.tool_call_id)))
    const input = { nodes: ['Depot', 'Clinic', 'Hospital'], edges: [{ from: 'Depot', to: 'Clinic', weight: 4 }, { from: 'Clinic', to: 'Hospital', weight: 3 }, { from: 'Depot', to: 'Hospital', weight: 9 }], directed: false, source: 'Depot', target: 'Hospital', meta: { title: 'Ambulance route', unit: 'min' } }
    const step = [
      ['search_catalog', { problemType: 'shortest_path', constraints: { weighted: true, size: 40 } }],
      ['get_input_schema', { algorithmId: 'dijkstra' }],
      ['validate_input', { algorithmId: 'dijkstra', inputJson: JSON.stringify(input) }],
      ['compare_algorithms', { algorithmIds: ['dijkstra', 'bellman_ford'], inputJson: JSON.stringify(input) }],
      ['submit_recommendation', { algorithmId: 'dijkstra', inputJson: JSON.stringify(input), inputIsExample: false }],
    ][done.length]
    return reply(tc(step[0], step[1], `x${done.length}`), done.length === 0 ? 'I will search the catalog first.' : null)
  }
  const llm = { ...createOpenAICompatible({ baseURL: 'https://fake.test/v1', apiKey: 'k', model: 'fake', fetchImpl }), isMock: false, provider: 'fake' }
  const out = await buildSolveGraph().invoke(freshInput('w', 'Fastest ambulance route from depot to hospital, times in minutes'), { threadId: 'wire', context: { llm, store: tmpStore() } })
  const rec = out.state.response.recommendation
  assert.equal(rec.algorithmId, 'dijkstra')
  assert.equal(rec.explanationSource, 'llm')
  assert.equal(rec.input.meta.title, 'Ambulance route')
  assert.ok(rec.evidence.rows[0].summary.includes('Depot → Clinic → Hospital'))
  assert.ok(calls.length >= 8)
})
