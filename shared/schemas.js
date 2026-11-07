// Input schemas (JSON Schema, given to the LLM) + a strict validator (run by our code).
// The validator is the "guardrail": the agent can propose any input, but only input that
// passes here ever reaches a visualizer.

const meta = {
  type: 'object',
  description: 'Display info: title of the scenario and the unit of numbers (e.g. "min", "km", "₹").',
  properties: { title: { type: 'string' }, unit: { type: 'string' }, note: { type: 'string' } },
}

export const INPUT_KINDS = {
  array_search: {
    label: 'List of numbers + target',
    limits: { minItems: 2, maxItems: 16 },
    schema: {
      type: 'object',
      required: ['values', 'target'],
      properties: {
        values: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 16 },
        target: { type: 'number' },
        itemLabels: { type: 'array', items: { type: 'string' }, description: 'Optional name for each value, same length as values.' },
        meta,
      },
    },
  },
  array_sort: {
    label: 'List of numbers',
    limits: { minItems: 2, maxItems: 16 },
    schema: {
      type: 'object',
      required: ['values'],
      properties: {
        values: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 16 },
        itemLabels: { type: 'array', items: { type: 'string' }, description: 'Optional name for each value (e.g. student names), same length as values.' },
        meta,
      },
    },
  },
  graph: {
    label: 'Graph (nodes + edges)',
    limits: { minNodes: 2, maxNodes: 10, maxEdges: 30 },
    schema: {
      type: 'object',
      required: ['nodes', 'edges', 'directed'],
      properties: {
        nodes: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 10, description: 'Short unique names, e.g. "Kitchen", "Hostel A".' },
        edges: {
          type: 'array',
          maxItems: 30,
          items: {
            type: 'object',
            required: ['from', 'to'],
            properties: { from: { type: 'string' }, to: { type: 'string' }, weight: { type: 'number' } },
          },
        },
        directed: { type: 'boolean', description: 'true for one-way links (prerequisites, one-way roads).' },
        source: { type: 'string', description: 'Start node (needed for traversal and shortest paths).' },
        target: { type: 'string', description: 'Optional destination node.' },
        meta,
      },
    },
  },
  knapsack: {
    label: 'Items with weight and value + capacity',
    limits: { maxItems: 8, maxCapacity: 30 },
    schema: {
      type: 'object',
      required: ['items', 'capacity'],
      properties: {
        items: {
          type: 'array',
          minItems: 1,
          maxItems: 8,
          items: { type: 'object', required: ['name', 'weight', 'value'], properties: { name: { type: 'string' }, weight: { type: 'integer', minimum: 1 }, value: { type: 'number', exclusiveMinimum: 0 } } },
        },
        capacity: { type: 'integer', minimum: 1, maximum: 30 },
        meta,
      },
    },
  },
  activities: {
    label: 'Events with start and end times',
    limits: { maxItems: 12 },
    schema: {
      type: 'object',
      required: ['activities'],
      properties: {
        activities: {
          type: 'array',
          minItems: 1,
          maxItems: 12,
          items: { type: 'object', required: ['name', 'start', 'end'], properties: { name: { type: 'string' }, start: { type: 'number' }, end: { type: 'number' } } },
        },
        meta,
      },
    },
  },
  strings: {
    label: 'Two short strings',
    limits: { maxLength: 10 },
    schema: {
      type: 'object',
      required: ['a', 'b'],
      properties: { a: { type: 'string', minLength: 1, maxLength: 10 }, b: { type: 'string', minLength: 1, maxLength: 10 }, meta },
    },
  },
  coins: {
    label: 'Coin values + amount',
    limits: { maxCoins: 6, maxAmount: 40 },
    schema: {
      type: 'object',
      required: ['coins', 'amount'],
      properties: {
        coins: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 50 }, minItems: 1, maxItems: 6 },
        amount: { type: 'integer', minimum: 1, maximum: 40 },
        meta,
      },
    },
  },
}

// ---------- generic JSON-schema subset checker (type/required/min/max/items) ----------
function checkSchema(value, schema, path, errors) {
  const t = schema.type
  const here = path || 'input'
  if (t === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return errors.push(`${here} must be an object`)
    for (const k of schema.required || []) if (value[k] === undefined) errors.push(`${here}.${k} is required`)
    for (const [k, sub] of Object.entries(schema.properties || {})) if (value[k] !== undefined) checkSchema(value[k], sub, `${here}.${k}`, errors)
    return
  }
  if (t === 'array') {
    if (!Array.isArray(value)) return errors.push(`${here} must be a list`)
    if (schema.minItems != null && value.length < schema.minItems) errors.push(`${here} needs at least ${schema.minItems} item(s)`)
    if (schema.maxItems != null && value.length > schema.maxItems) errors.push(`${here} can have at most ${schema.maxItems} items (keeps the animation readable)`)
    value.forEach((v, i) => checkSchema(v, schema.items, `${here}[${i}]`, errors))
    return
  }
  if (t === 'number' || t === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return errors.push(`${here} must be a number`)
    if (t === 'integer' && !Number.isInteger(value)) errors.push(`${here} must be a whole number`)
    if (schema.minimum != null && value < schema.minimum) errors.push(`${here} must be ≥ ${schema.minimum}`)
    if (schema.maximum != null && value > schema.maximum) errors.push(`${here} must be ≤ ${schema.maximum}`)
    if (schema.exclusiveMinimum != null && value <= schema.exclusiveMinimum) errors.push(`${here} must be > ${schema.exclusiveMinimum}`)
    return
  }
  if (t === 'string') {
    if (typeof value !== 'string') return errors.push(`${here} must be text`)
    if (schema.minLength != null && value.length < schema.minLength) errors.push(`${here} is too short`)
    if (schema.maxLength != null && value.length > schema.maxLength) errors.push(`${here} can be at most ${schema.maxLength} characters`)
    return
  }
  if (t === 'boolean' && typeof value !== 'boolean') errors.push(`${here} must be true or false`)
}

// ---------- facts derived from the data (used to override guesses in scoring) ----------
function inversions(a) {
  let c = 0
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[i] > a[j]) c++
  return c
}

function graphFacts(g) {
  const V = g.nodes.length
  const E = g.edges.length
  const weighted = g.edges.some((e) => e.weight != null && e.weight !== 1)
  const negativeWeights = g.edges.some((e) => (e.weight ?? 1) < 0)
  const maxE = g.directed ? V * (V - 1) : (V * (V - 1)) / 2
  // connectivity (undirected view) and directed cycle detection
  const und = Object.fromEntries(g.nodes.map((n) => [n, []]))
  const dir = Object.fromEntries(g.nodes.map((n) => [n, []]))
  for (const e of g.edges) {
    if (!(e.from in und) || !(e.to in und)) continue
    und[e.from].push(e.to)
    und[e.to].push(e.from)
    dir[e.from].push(e.to)
  }
  const seen = new Set([g.nodes[0]])
  const st = [g.nodes[0]]
  while (st.length) for (const v of und[st.pop()]) if (!seen.has(v)) seen.add(v), st.push(v)
  let cycle = null
  if (g.directed) {
    const color = {}
    const stack = []
    const visit = (u) => {
      color[u] = 1
      stack.push(u)
      for (const v of dir[u]) {
        if (cycle) return
        if (color[v] === 1) cycle = [...stack.slice(stack.indexOf(v)), v]
        else if (!color[v]) visit(v)
      }
      stack.pop()
      color[u] = 2
    }
    for (const n of g.nodes) if (!color[n] && !cycle) visit(n)
  }
  return { size: V, V, edges: E, directed: !!g.directed, weighted, negativeWeights, connected: seen.size === V, density: maxE ? Math.round((E / maxE) * 100) / 100 : 0, hasCycle: !!cycle, cycle }
}

function canonicalCoins(coins, upTo) {
  // greedy == optimal for every amount 1..upTo ?  (checked by brute force, deterministic)
  const desc = [...coins].sort((a, b) => b - a)
  const dp = Array(upTo + 1).fill(Infinity)
  dp[0] = 0
  for (let x = 1; x <= upTo; x++) for (const c of coins) if (c <= x) dp[x] = Math.min(dp[x], dp[x - c] + 1)
  for (let x = 1; x <= upTo; x++) {
    let left = x
    let cnt = 0
    for (const c of desc) while (left >= c) (left -= c), cnt++
    const g = left === 0 ? cnt : Infinity
    if (g !== dp[x]) return { canonical: false, counterexample: { amount: x, greedy: g, optimal: dp[x] } }
  }
  return { canonical: true }
}

export function deriveFacts(kind, input) {
  try {
    if (kind === 'array_search' || kind === 'array_sort') {
      const v = input.values
      const inv = inversions(v)
      const sorted = inv === 0
      return { size: v.length, sorted, nearlySorted: sorted || inv <= Math.max(1, Math.floor(v.length / 4)), inversions: inv }
    }
    if (kind === 'graph') return graphFacts(input)
    if (kind === 'knapsack') return { size: input.items.length, capacity: input.capacity }
    if (kind === 'activities') return { size: input.activities.length }
    if (kind === 'strings') return { size: Math.max(input.a.length, input.b.length), m: input.a.length, n: input.b.length }
    if (kind === 'coins') return { size: input.amount, amount: input.amount, coins: [...input.coins], ...canonicalCoins(input.coins, input.amount) }
  } catch {
    return {}
  }
  return {}
}

/**
 * Validate input for one algorithm. `rules` comes from the registry entry.
 * Returns { valid, errors, warnings, facts }.
 */
export function validateInput(kind, input, rules = {}) {
  const def = INPUT_KINDS[kind]
  const errors = []
  const warnings = []
  if (!def) return { valid: false, errors: [`Unknown input kind "${kind}"`], warnings, facts: {} }
  checkSchema(input, def.schema, 'input', errors)
  if (errors.length) return { valid: false, errors, warnings, facts: {} }

  if (kind === 'array_search' || kind === 'array_sort') {
    if (input.itemLabels && input.itemLabels.length !== input.values.length) errors.push('itemLabels must have the same length as values')
    if (rules.sorted) {
      const bad = input.values.findIndex((x, i) => i > 0 && input.values[i - 1] > x)
      if (bad > 0) errors.push(`values must be sorted ascending for this algorithm (index ${bad - 1} has ${input.values[bad - 1]} > ${input.values[bad]})`)
    }
  }

  if (kind === 'graph') {
    const names = new Set()
    for (const n of input.nodes) {
      if (!n.trim()) errors.push('node names cannot be empty')
      if (names.has(n)) errors.push(`duplicate node name "${n}"`)
      names.add(n)
    }
    input.edges.forEach((e, i) => {
      if (!names.has(e.from)) errors.push(`edges[${i}].from "${e.from}" is not in nodes`)
      if (!names.has(e.to)) errors.push(`edges[${i}].to "${e.to}" is not in nodes`)
      if (e.from === e.to) errors.push(`edges[${i}] is a self-loop (${e.from} → ${e.to})`)
      if (rules.weighted && e.weight == null) warnings.push(`edges[${i}] has no weight; using 1`)
    })
    if (rules.maxNodes && input.nodes.length > rules.maxNodes) errors.push(`this algorithm is limited to ${rules.maxNodes} nodes so the animation stays readable`)
    if (rules.needsSource) {
      if (input.source == null) errors.push('source (start node) is required')
      else if (!names.has(input.source)) errors.push(`source "${input.source}" is not in nodes`)
    }
    if (input.target != null && !names.has(input.target)) errors.push(`target "${input.target}" is not in nodes`)
    if (rules.directed === true && !input.directed) errors.push('this algorithm needs a directed graph (set directed: true)')
    if (rules.directed === false && input.directed) errors.push('this algorithm needs an undirected graph (set directed: false)')
    if (errors.length) return { valid: false, errors, warnings, facts: {} }
    const facts = graphFacts(input)
    if (rules.noNegative && facts.negativeWeights) errors.push('negative edge weights are not allowed for this algorithm (its greedy "settle" step would be wrong)')
    if (rules.negativeNeedsDirected && facts.negativeWeights && !input.directed) errors.push('a negative weight on an undirected edge is a negative cycle by itself; make the graph directed')
    if (rules.connected && !facts.connected) errors.push('the graph must be connected (every node reachable) to build a spanning tree')
    if (rules.acyclicWarn && facts.hasCycle) warnings.push(`the graph has a cycle (${facts.cycle.join(' → ')}); the algorithm will detect it and stop`)
    return { valid: errors.length === 0, errors, warnings, facts }
  }

  if (kind === 'knapsack') {
    const names = new Set()
    input.items.forEach((it) => {
      if (names.has(it.name)) errors.push(`duplicate item name "${it.name}"`)
      names.add(it.name)
    })
  }
  if (kind === 'activities') {
    input.activities.forEach((a, i) => {
      if (!(a.end > a.start)) errors.push(`activities[${i}] (${a.name}) must end after it starts`)
    })
  }
  if (kind === 'coins') {
    if (new Set(input.coins).size !== input.coins.length) errors.push('coin values must be unique')
    if (!input.coins.includes(1)) warnings.push('without a coin of value 1 some amounts may be impossible')
  }
  return { valid: errors.length === 0, errors, warnings, facts: errors.length ? {} : deriveFacts(kind, input) }
}
