import test from 'node:test'
import assert from 'node:assert/strict'
import { GENERATORS } from '../shared/algorithms/index.js'
import { ALGORITHMS } from '../shared/registry.js'
import { runAlgorithm, validateFor } from '../shared/evidence.js'

const rand = (n, max = 99) => Array.from({ length: n }, () => Math.floor(Math.random() * max) - 10)

test('every registry entry has a generator, a valid sample, and steps whose lines exist in both languages', () => {
  for (const [id, A] of Object.entries(ALGORITHMS)) {
    const G = GENERATORS[id]
    assert.ok(G, `generator for ${id}`)
    const v = validateFor(id, A.sample)
    assert.ok(v.valid, `${id} sample valid: ${v.errors.join('; ')}`)
    const run = runAlgorithm(id, A.sample)
    assert.ok(run.steps.length > 2, `${id} has steps`)
    for (const s of run.steps) {
      for (const lang of ['javascript', 'python']) {
        assert.ok(s.line in G.code[lang].lines, `${id}: line key "${s.line}" missing in ${lang}`)
      }
      assert.ok(s.message && s.why, `${id}: step has message and why`)
      assert.ok(s.view && s.view.kind, `${id}: step has a view`)
    }
    for (const lang of ['javascript', 'python']) assert.ok(!/(\/\/|#)@\w+/.test(G.code[lang].code), `${id} ${lang}: markers stripped`)
  }
})

test('sorting algorithms sort correctly and keep labels attached', () => {
  for (const id of ['bubble_sort', 'insertion_sort', 'merge_sort', 'quick_sort']) {
    for (let t = 0; t < 30; t++) {
      const values = rand(2 + Math.floor(Math.random() * 14))
      const itemLabels = values.map((v, i) => `L${i}:${v}`)
      const r = runAlgorithm(id, { values, itemLabels })
      assert.deepEqual(r.result.answer, [...values].sort((a, b) => a - b), id)
      r.result.labels.forEach((lab, i) => assert.equal(Number(lab.split(':')[1]), r.result.answer[i], `${id} label follows value`))
    }
  }
})

test('stability: merge sort keeps equal items in order', () => {
  const r = runAlgorithm('merge_sort', { values: [5, 3, 5, 3, 1], itemLabels: ['a', 'b', 'c', 'd', 'e'] })
  assert.deepEqual(r.result.labels, ['e', 'b', 'd', 'a', 'c'])
})

test('searches find the right index', () => {
  for (let t = 0; t < 50; t++) {
    const values = [...new Set(rand(10))].sort((a, b) => a - b)
    if (values.length < 2) continue
    const target = Math.random() < 0.7 ? values[Math.floor(Math.random() * values.length)] : 1000
    const exp = values.indexOf(target)
    assert.equal(runAlgorithm('binary_search', { values, target }).result.answer, exp)
    assert.equal(runAlgorithm('linear_search', { values, target }).result.answer, exp)
  }
})

function randomGraph(V, E, { directed = false, neg = false, connected = false } = {}) {
  const nodes = Array.from({ length: V }, (_, i) => `N${i}`)
  const edges = []
  const key = new Set()
  if (connected) for (let i = 1; i < V; i++) {
    const j = Math.floor(Math.random() * i)
    edges.push({ from: nodes[j], to: nodes[i], weight: 1 + Math.floor(Math.random() * 9) })
    key.add(`${j}-${i}`)
    key.add(`${i}-${j}`)
  }
  let guard = 0
  while (edges.length < E && guard++ < 500) {
    const a = Math.floor(Math.random() * V)
    const b = Math.floor(Math.random() * V)
    if (a === b || key.has(`${a}-${b}`) || (!directed && key.has(`${b}-${a}`))) continue
    key.add(`${a}-${b}`)
    edges.push({ from: nodes[a], to: nodes[b], weight: (neg && Math.random() < 0.2 ? -1 : 1) * (1 + Math.floor(Math.random() * 9)) })
  }
  return { nodes, edges, directed, source: nodes[0] }
}

function referenceDist(g) {
  // brute-force Bellman-Ford reference
  const d = Object.fromEntries(g.nodes.map((n) => [n, Infinity]))
  d[g.source] = 0
  const list = g.edges.flatMap((e) => (g.directed ? [e] : [e, { from: e.to, to: e.from, weight: e.weight }]))
  for (let i = 0; i < g.nodes.length; i++) for (const e of list) if (d[e.from] + e.weight < d[e.to]) d[e.to] = d[e.from] + e.weight
  return d
}

test('dijkstra, bellman-ford and floyd-warshall agree with a reference on random graphs', () => {
  for (let t = 0; t < 40; t++) {
    const g = randomGraph(2 + Math.floor(Math.random() * 6), 3 + Math.floor(Math.random() * 10), { directed: Math.random() < 0.5 })
    const ref = referenceDist(g)
    assert.deepEqual(runAlgorithm('dijkstra', g).result.compare, ref)
    assert.deepEqual(runAlgorithm('bellman_ford', g).result.compare, ref)
    assert.deepEqual(runAlgorithm('floyd_warshall', g).result.compare, ref)
  }
})

test('bellman-ford handles negative edges and detects negative cycles', () => {
  const g = ALGORITHMS.bellman_ford.sample
  const r = runAlgorithm('bellman_ford', g)
  assert.deepEqual(r.result.compare, referenceDist(g))
  assert.equal(validateFor('dijkstra', g).valid, false, 'dijkstra rejects negative weights')
  const cyc = { nodes: ['A', 'B', 'C'], edges: [{ from: 'A', to: 'B', weight: 1 }, { from: 'B', to: 'C', weight: -3 }, { from: 'C', to: 'B', weight: 1 }], directed: true, source: 'A' }
  assert.equal(runAlgorithm('bellman_ford', cyc).result.compare, 'negative-cycle')
})

test('prim and kruskal produce the same minimum total; BFS hops correct', () => {
  for (let t = 0; t < 40; t++) {
    const g = randomGraph(2 + Math.floor(Math.random() * 7), 4 + Math.floor(Math.random() * 10), { connected: true })
    const p = runAlgorithm('prim', g)
    const k = runAlgorithm('kruskal', g)
    assert.equal(p.result.compare, k.result.compare)
    assert.equal(p.result.answer.edges.length, g.nodes.length - 1)
  }
  const r = runAlgorithm('bfs', ALGORITHMS.bfs.sample)
  assert.equal(r.result.answer.hops.Gopi, 4)
})

test('topological sort respects every prerequisite and detects cycles', () => {
  const g = ALGORITHMS.topological_sort.sample
  const order = runAlgorithm('topological_sort', g).result.answer
  const pos = Object.fromEntries(order.map((n, i) => [n, i]))
  for (const e of g.edges) assert.ok(pos[e.from] < pos[e.to])
  const cyc = { nodes: ['A', 'B', 'C'], edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'B' }], directed: true }
  assert.equal(runAlgorithm('topological_sort', cyc).result.compare, 'cycle')
})

function bruteKnapsack(items, W) {
  let best = 0
  for (let mask = 0; mask < 1 << items.length; mask++) {
    let w = 0
    let v = 0
    items.forEach((it, i) => mask & (1 << i) && ((w += it.weight), (v += it.value)))
    if (w <= W) best = Math.max(best, v)
  }
  return best
}

test('0/1 knapsack is optimal (brute force) and fractional >= 0/1', () => {
  for (let t = 0; t < 40; t++) {
    const items = Array.from({ length: 1 + Math.floor(Math.random() * 6) }, (_, i) => ({ name: `I${i}`, weight: 1 + Math.floor(Math.random() * 9), value: 1 + Math.floor(Math.random() * 30) }))
    const capacity = 1 + Math.floor(Math.random() * 20)
    const a = runAlgorithm('knapsack_01', { items, capacity })
    assert.equal(a.result.compare, bruteKnapsack(items, capacity))
    const chosenW = a.result.answer.chosen.reduce((s, n) => s + items.find((x) => x.name === n).weight, 0)
    assert.ok(chosenW <= capacity)
    const f = runAlgorithm('fractional_knapsack', { items, capacity })
    assert.ok(f.result.compare >= a.result.compare - 1e-9)
  }
})

test('LCS, coin change and activity selection give known answers', () => {
  assert.equal(runAlgorithm('lcs', { a: 'AGGTAB', b: 'GXTXAYB' }).result.answer.sequence, 'GTAB')
  assert.equal(runAlgorithm('coin_change', { coins: [1, 3, 4], amount: 6 }).result.compare, 2)
  assert.equal(runAlgorithm('greedy_coin_change', { coins: [1, 3, 4], amount: 6 }).result.compare, 3)
  assert.equal(runAlgorithm('activity_selection', ALGORITHMS.activity_selection.sample).result.compare, 4)
})

test('array views carry stable ids (for slide animations) and recursion trees for merge/quick sort', () => {
  for (const id of ['bubble_sort', 'insertion_sort', 'merge_sort', 'quick_sort']) {
    const values = [5, 1, 4, 2, 8, 3]
    const r = runAlgorithm(id, { values })
    for (const s of r.steps) {
      const ids = s.view.ids
      assert.equal(new Set(ids).size, values.length, `${id}: ids are a permutation`)
      ids.forEach((orig, pos) => assert.equal(s.view.values[pos], values[orig], `${id}: id follows its value`))
    }
  }
  const m = runAlgorithm('merge_sort', { values: [5, 1, 4, 2] })
  const last = m.steps.at(-1).view.tree
  assert.equal(last.nodes.length, 7)
  assert.ok(last.nodes.every((n) => n.state === 'done'))
  assert.equal(last.nodes[0].label, '1 2 4 5')
})
