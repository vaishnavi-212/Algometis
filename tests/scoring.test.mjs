import test from 'node:test'
import assert from 'node:assert/strict'
import { scoreFamily } from '../shared/scoring.js'
import { deriveFacts } from '../shared/schemas.js'
import { ALGORITHMS } from '../shared/registry.js'

const status = (s, id) => s.candidates.find((c) => c.id === id).status

test('shortest path: weights, negative costs and all-pairs change the winner', () => {
  assert.equal(scoreFamily('shortest_path', { size: 50, edges: 150, weighted: false }).best, 'bfs')
  assert.equal(scoreFamily('shortest_path', { size: 50, edges: 150, weighted: true }).best, 'dijkstra')
  const neg = scoreFamily('shortest_path', { size: 50, edges: 150, weighted: true, negativeWeights: true })
  assert.equal(neg.best, 'bellman_ford')
  assert.equal(status(neg, 'dijkstra'), 'rejected')
  assert.equal(scoreFamily('shortest_path', { size: 30, edges: 200, weighted: true, allPairs: true }).best, 'floyd_warshall')
})

test('facts from the data override what the story claimed', () => {
  const facts = deriveFacts('graph', ALGORITHMS.bellman_ford.sample)
  assert.equal(facts.negativeWeights, true)
  const s = scoreFamily('shortest_path', { size: 50, negativeWeights: false, weighted: true }, facts)
  assert.equal(s.best, 'bellman_ford')
  assert.deepEqual(s.conflicts, [{ key: 'negativeWeights', said: false, data: true }])
  assert.equal(s.constraints.size, 50, 'real-world size from the story is kept')
})

test('sorting: stability, nearly-sorted data, size and memory', () => {
  const stable = scoreFamily('sort', { size: 100000, needStable: true })
  assert.equal(stable.best, 'merge_sort')
  assert.equal(status(stable, 'quick_sort'), 'rejected')
  assert.equal(status(stable, 'bubble_sort'), 'rejected')
  assert.equal(scoreFamily('sort', { size: 100000 }).best, 'merge_sort')
  assert.equal(scoreFamily('sort', { size: 100000, memoryLimited: true }).best, 'quick_sort')
  assert.equal(scoreFamily('sort', { size: 5000, nearlySorted: true }).best, 'bubble_sort')
})

test('search, knapsack, coins, mst', () => {
  assert.equal(scoreFamily('search', { size: 1000, sorted: false }).best, 'linear_search')
  assert.equal(scoreFamily('search', { size: 1000, sorted: true }).best, 'binary_search')
  assert.equal(scoreFamily('search', { size: 100000, sorted: false, manyQueries: true }).best, 'binary_search')
  assert.equal(scoreFamily('knapsack', { size: 10, capacity: 20, itemsDivisible: false }).best, 'knapsack_01')
  assert.equal(scoreFamily('knapsack', { size: 10, capacity: 20, itemsDivisible: true }).best, 'fractional_knapsack')
  const odd = scoreFamily('coin_change', {}, deriveFacts('coins', { coins: [1, 3, 4], amount: 6 }))
  assert.equal(odd.best, 'coin_change')
  assert.match(odd.candidates.find((c) => c.id === 'greedy_coin_change').rejectReasons[0], /for 6, greedy uses 3 coins but 2/)
  assert.equal(scoreFamily('coin_change', {}, deriveFacts('coins', { coins: [1, 2, 5, 10], amount: 30 })).best, 'greedy_coin_change')
  assert.equal(scoreFamily('mst', { size: 100, edges: 4000 }).best, 'prim')
  assert.equal(scoreFamily('mst', { size: 100, edges: 120 }).best, 'kruskal')
})

test('real-world size from the story is not mixed with demo-sized edge counts', () => {
  const facts = { size: 3, edges: 3, weighted: true, negativeWeights: false }
  const s = scoreFamily('shortest_path', { size: 40, weighted: true }, facts)
  assert.equal(s.constraints.edges, 40)
  assert.equal(s.best, 'dijkstra')
})
