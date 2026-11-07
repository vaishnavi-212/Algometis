// Deterministic, explainable scoring. No AI here: given the same constraints you always
// get the same table. Every cell has a status and a human-readable reason.

import { ALGORITHMS } from './registry.js'

const P = (text) => ({ status: 'pass', text })
const F = (text) => ({ status: 'fail', text })
const W = (text) => ({ status: 'warn', text })
const I = (text) => ({ status: 'info', text })
const log2 = (x) => Math.log2(Math.max(2, x))

/**
 * Each problem family lists: candidate algorithms, the constraint fields that matter
 * (shown as an editable form in the UI) and the criteria rows of the score matrix.
 */
export const FAMILIES = {
  search: {
    label: 'Find an item in a list',
    candidates: ['linear_search', 'binary_search'],
    fields: [
      { key: 'size', label: 'Number of items (real-world)', type: 'number', default: 1000 },
      { key: 'sorted', label: 'Data is already sorted', type: 'bool', default: false, fact: true },
      { key: 'manyQueries', label: 'You search the same data many times', type: 'bool', default: false },
    ],
    cost: (id, c) => {
      const q = c.manyQueries ? 50 : 1
      if (id === 'linear_search') return c.size * q
      return log2(c.size) * q + (c.sorted ? 0 : c.size * log2(c.size))
    },
    criteria: [
      {
        id: 'order',
        label: 'Works on your data order',
        eval: (id, c) =>
          id === 'linear_search' ? P('Works on any order') : c.sorted ? P('Your data is sorted') : c.manyQueries ? W('Must sort once first (O(n log n)); after that each search is fast') : F('Your data is not sorted, so binary search would give wrong answers'),
      },
      {
        id: 'repeat',
        label: 'Many searches on the same data',
        eval: (id, c) => (!c.manyQueries ? I('Only one search needed') : id === 'linear_search' ? W('Scans up to n items for every search') : P('Only about log2(n) checks per search')),
      },
    ],
  },
  sort: {
    label: 'Put items in order',
    candidates: ['bubble_sort', 'insertion_sort', 'merge_sort', 'quick_sort'],
    fields: [
      { key: 'size', label: 'Number of items (real-world)', type: 'number', default: 1000 },
      { key: 'nearlySorted', label: 'Data is already nearly sorted', type: 'bool', default: false, fact: true },
      { key: 'needStable', label: 'Equal items must keep their original order (stable)', type: 'bool', default: false },
      { key: 'memoryLimited', label: 'Memory is tight (prefer in-place)', type: 'bool', default: false },
    ],
    criteria: [
      {
        id: 'stable',
        label: 'Stable (keeps ties in order)',
        eval: (id, c, A) => (!c.needStable ? I(A.stable ? 'Stable (not required)' : 'Not stable (not required)') : A.stable ? P('Stable') : F('Not stable: two equal items may swap places')),
      },
      {
        id: 'order',
        label: 'Speed on your data and size',
        eval: (id, c) => {
          const quad = id === 'bubble_sort' || id === 'insertion_sort'
          if (c.nearlySorted) {
            if (quad) return P('Nearly sorted → close to O(n)')
            if (id === 'quick_sort') return W('Last-element pivot on nearly-sorted data → O(n²) worst case')
            return I('O(n log n) whatever the order')
          }
          if (quad) return c.size > 10000 ? F(`O(n²) is far too slow for ${c.size} items`) : c.size > 50 ? W(`O(n²) on random data: ~${Math.round((c.size * c.size) / 2)} steps`) : I('O(n²), but fine for a tiny list')
          return P(id === 'quick_sort' ? 'O(n log n) on average' : 'Always O(n log n)')
        },
      },
      {
        id: 'memory',
        label: 'Extra memory',
        eval: (id, c, A) => (c.memoryLimited ? (A.inPlace ? P('Sorts in place') : W('Needs O(n) extra memory')) : I(A.inPlace ? 'In place' : 'O(n) extra memory')),
      },
    ],
  },
  traversal: {
    label: 'Explore / reach nodes in a network',
    candidates: ['bfs', 'dfs'],
    fields: [
      { key: 'size', label: 'Number of nodes (real-world)', type: 'number', default: 100 },
      { key: 'needShortestHops', label: 'You need the fewest steps/hops', type: 'bool', default: false },
    ],
    criteria: [
      { id: 'hops', label: 'Finds the fewest-hop path', eval: (id, c) => (!c.needShortestHops ? I('Not required') : id === 'bfs' ? P('Explores level by level, so the first visit is the fewest hops') : F('Finds *a* path, not the fewest hops')) },
      { id: 'explore', label: 'Visits everything reachable', eval: () => P('Yes, in O(V + E)') },
      { id: 'memory', label: 'Memory pattern', eval: (id) => I(id === 'bfs' ? 'Queue can hold a whole level' : 'Stack holds one branch') },
    ],
  },
  shortest_path: {
    label: 'Cheapest / shortest route',
    candidates: ['bfs', 'dijkstra', 'bellman_ford', 'floyd_warshall'],
    fields: [
      { key: 'size', label: 'Number of places (real-world)', type: 'number', default: 50 },
      { key: 'edges', label: 'Number of links (real-world)', type: 'number', default: 150 },
      { key: 'weighted', label: 'Links have different costs (time, distance, money)', type: 'bool', default: true, fact: true },
      { key: 'negativeWeights', label: 'Some costs are negative (cashback, refunds)', type: 'bool', default: false, fact: true },
      { key: 'allPairs', label: 'You need routes between every pair, not from one start', type: 'bool', default: false },
    ],
    cost: (id, c, A) => A.cost(c) * (c.allPairs && id !== 'floyd_warshall' ? c.size : 1),
    criteria: [
      { id: 'weights', label: 'Uses link costs', eval: (id, c) => (id === 'bfs' ? (c.weighted ? F('Counts hops only and ignores costs') : P('All links cost the same, so fewest hops = cheapest')) : P('Adds up link costs')) },
      {
        id: 'negative',
        label: 'Handles negative costs',
        eval: (id, c) => {
          if (!c.negativeWeights) return I('Not needed: no negative costs')
          if (id === 'dijkstra') return F('Finalises the closest node early; a later negative link could make that wrong')
          if (id === 'bfs') return F('Ignores costs entirely')
          return P('Correct with negative costs (and detects negative cycles)')
        },
      },
      {
        id: 'query',
        label: 'Answers your kind of question',
        eval: (id, c) => {
          if (c.allPairs) return id === 'floyd_warshall' ? P('All pairs in one run') : W('Must be repeated once per start (V runs)')
          return id === 'floyd_warshall' ? W('Computes every pair: work you don’t need') : P('One start → all destinations')
        },
      },
    ],
  },
  mst: {
    label: 'Connect everything at minimum total cost',
    candidates: ['prim', 'kruskal'],
    fields: [
      { key: 'size', label: 'Number of places (real-world)', type: 'number', default: 50 },
      { key: 'edges', label: 'Number of possible links (real-world)', type: 'number', default: 150 },
      { key: 'connected', label: 'Every place can be linked somehow (connected)', type: 'bool', default: true, fact: true },
    ],
    criteria: [
      { id: 'connected', label: 'Network is connected', eval: (id, c) => (c.connected === false ? F('Some places can’t be reached, so no spanning tree exists') : P('Connected')) },
      {
        id: 'density',
        label: 'Fit for your network density',
        eval: (id, c) => {
          const maxE = (c.size * (c.size - 1)) / 2
          const dense = (c.edges ?? 0) / Math.max(1, maxE) >= 0.5
          if (dense) return id === 'prim' ? P('Dense network: growing from vertices avoids sorting every edge') : I('Must sort many edges')
          return id === 'kruskal' ? P('Sparse network: only a few edges to sort') : I('Works, slightly more queue work')
        },
      },
    ],
  },
  ordering: {
    label: 'Order tasks with prerequisites',
    candidates: ['topological_sort'],
    fields: [
      { key: 'size', label: 'Number of tasks (real-world)', type: 'number', default: 20 },
      { key: 'hasCycle', label: 'Prerequisites form a cycle', type: 'bool', default: false, fact: true },
    ],
    criteria: [{ id: 'dag', label: 'Prerequisites have no cycle', eval: (id, c) => (c.hasCycle ? W('Cycle found: no valid order exists; the algorithm will report it') : P('No cycle, so a valid order exists')) }],
  },
  knapsack: {
    label: 'Pick items under a weight/budget limit for maximum value',
    candidates: ['fractional_knapsack', 'knapsack_01'],
    fields: [
      { key: 'size', label: 'Number of items (real-world)', type: 'number', default: 10 },
      { key: 'capacity', label: 'Capacity / budget (whole units)', type: 'number', default: 20 },
      { key: 'itemsDivisible', label: 'Items can be split (take part of an item)', type: 'bool', default: false },
    ],
    criteria: [
      {
        id: 'divisible',
        label: 'Matches how items can be taken',
        eval: (id, c) => (c.itemsDivisible ? (id === 'fractional_knapsack' ? P('Items can be split, so greedy by value/weight is optimal') : W('Never splits items, so it may leave value on the table')) : id === 'fractional_knapsack' ? F('Would cut items into pieces, which isn’t allowed here') : P('Tries "take" and "skip" for every whole item')),
      },
      { id: 'scale', label: 'Practical for your numbers', eval: (id, c) => (id === 'knapsack_01' && c.size * c.capacity > 1e8 ? W('n × W table is very large') : P('Fast enough')) },
    ],
  },
  scheduling: {
    label: 'Fit the most non-overlapping events',
    candidates: ['activity_selection'],
    fields: [
      { key: 'size', label: 'Number of events (real-world)', type: 'number', default: 20 },
      { key: 'weightedPriorities', label: 'Some events matter more than others', type: 'bool', default: false },
    ],
    criteria: [{ id: 'goal', label: 'Matches your goal', eval: (id, c) => (c.weightedPriorities ? W('Maximises the number of events, not their importance (weighted scheduling needs DP; not in this version)') : P('Maximises the number of events')) }],
  },
  sequence_similarity: {
    label: 'Compare two sequences',
    candidates: ['lcs'],
    fields: [{ key: 'size', label: 'Length of each sequence (real-world)', type: 'number', default: 100 }],
    criteria: [{ id: 'goal', label: 'Finds the longest shared subsequence', eval: () => P('Exact answer via DP') }],
  },
  coin_change: {
    label: 'Make an amount with the fewest coins',
    candidates: ['greedy_coin_change', 'coin_change'],
    fields: [
      { key: 'size', label: 'Amount to make', type: 'number', default: 30 },
      { key: 'canonical', label: 'Coin set is standard (greedy is safe)', type: 'bool', default: false, fact: true },
    ],
    criteria: [
      {
        id: 'optimal',
        label: 'Guaranteed fewest coins for your coin set',
        eval: (id, c) => {
          if (id === 'coin_change') return P('Tries every coin as the last one, so it is always optimal')
          if (c.canonical === true) return P('Checked every amount up to yours: greedy is optimal for these coins')
          if (c.counterexample) return F(`Fails: for ${c.counterexample.amount}, greedy uses ${c.counterexample.greedy} coins but ${c.counterexample.optimal} is possible`)
          return F('Only safe for standard currency-like coin sets')
        },
      },
    ],
  },
}

export const FACT_KEYS = ['sorted', 'nearlySorted', 'weighted', 'negativeWeights', 'connected', 'hasCycle', 'canonical', 'counterexample']
const FILL_KEYS = ['size', 'edges', 'capacity', 'm', 'n', 'coins']

/**
 * Merge what the student said (constraints) with what the data proves (facts).
 * Qualitative facts from the data win; sizes from the data only fill gaps, because the
 * demo data is a small sample of a bigger real-world problem.
 */
export function mergeConstraints(family, constraints = {}, facts = {}) {
  const F = FAMILIES[family]
  const merged = {}
  for (const f of F.fields) merged[f.key] = f.default
  Object.assign(merged, constraints)
  const fromData = []
  const conflicts = []
  for (const k of FACT_KEYS) {
    if (facts[k] === undefined) continue
    if (constraints[k] !== undefined && constraints[k] !== facts[k] && typeof facts[k] !== 'object') conflicts.push({ key: k, said: constraints[k], data: facts[k] })
    merged[k] = facts[k]
    fromData.push(k)
  }
  const storySize = constraints.size !== undefined && facts.size !== undefined
  for (const k of FILL_KEYS) {
    if (constraints[k] !== undefined || facts[k] === undefined) continue
    if (storySize && k === 'edges') {
      // Don't mix scales: the story gave a real-world size, the demo graph is tiny.
      // Estimate real-world links from the demo graph's links-per-node ratio.
      merged.edges = Math.max(1, Math.round((constraints.size * facts.edges) / Math.max(1, facts.size)))
      fromData.push('edges')
      continue
    }
    merged[k] = facts[k]
    fromData.push(k)
  }
  return { merged, fromData, conflicts }
}

const round = (x) => (x >= 100 ? Math.round(x).toLocaleString('en-US') : String(Math.round(x * 10) / 10))

export function scoreFamily(family, constraints = {}, facts = {}) {
  const F = FAMILIES[family]
  if (!F) throw new Error(`Unknown problem type "${family}"`)
  const { merged: c, fromData, conflicts } = mergeConstraints(family, constraints, facts)
  const rows = [...F.criteria.map(({ id, label }) => ({ id, label })), { id: 'complexity', label: 'Time complexity' }, { id: 'work', label: 'Estimated work for your size' }]
  const candidates = F.candidates.map((id, order) => {
    const A = ALGORITHMS[id]
    const cells = {}
    for (const cr of F.criteria) cells[cr.id] = cr.eval(id, c, A)
    const cost = F.cost ? F.cost(id, c, A) : A.cost(c)
    cells.complexity = I(A.complexity.time)
    cells.work = I(`≈ ${round(cost)} basic steps`)
    const fails = Object.values(cells).filter((x) => x.status === 'fail')
    const warns = Object.values(cells).filter((x) => x.status === 'warn')
    return { id, name: A.name, complexity: A.complexity, cells, cost, warns: warns.length, rejected: fails.length > 0, rejectReasons: fails.map((x) => x.text), score: cost * 2 ** warns.length, order }
  })
  const viable = candidates.filter((x) => !x.rejected).sort((a, b) => a.score - b.score || a.order - b.order)
  const rejected = candidates.filter((x) => x.rejected)
  viable.forEach((x, i) => (x.status = i === 0 ? 'best' : 'viable'))
  rejected.forEach((x) => (x.status = 'rejected'))
  const ranking = [...viable, ...rejected].map((x) => x.id)
  return {
    family,
    familyLabel: F.label,
    constraints: c,
    fromData,
    conflicts,
    rows,
    candidates: ranking.map((id) => candidates.find((x) => x.id === id)),
    best: viable[0]?.id || null,
    rankingRule: 'Rejected if any row fails. Remaining options are ranked by estimated work, doubled for each warning.',
  }
}

/** Which families can an algorithm belong to (used when the student names an algorithm directly). */
export function familiesOf(algoId) {
  return Object.entries(FAMILIES)
    .filter(([, f]) => f.candidates.includes(algoId))
    .map(([k]) => k)
}
