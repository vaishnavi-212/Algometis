import { recorder, sources, adjacency, fmt, unitOf } from '../util.js'

// ---------- helpers ----------
function makeGraphView(input) {
  const ns = {}
  const es = {}
  let badges = {}
  let aux = []
  const snap = (extra = {}) => ({
    kind: 'graph',
    nodes: input.nodes,
    edges: input.edges,
    directed: !!input.directed,
    nodeState: { ...ns },
    edgeState: { ...es },
    badges: { ...badges },
    aux: aux.map((a) => ({ title: a.title, items: [...a.items] })),
    ...extra,
  })
  return {
    ns,
    es,
    snap,
    setBadges: (b) => (badges = b),
    setAux: (a) => (aux = a),
  }
}

function pathTo(prev, source, target) {
  if (target == null || (prev[target] === undefined && target !== source)) return null
  const nodes = [target]
  const edges = []
  let cur = target
  while (cur !== source) {
    const p = prev[cur]
    if (!p) return null
    edges.push(p.ei)
    cur = p.u
    nodes.push(cur)
  }
  return { nodes: nodes.reverse(), edges: edges.reverse() }
}

const distBadges = (nodes, dist) => Object.fromEntries(nodes.map((n) => [n, fmt(dist[n])]))

// ---------- BFS ----------
export const bfs = {
  id: 'bfs',
  code: sources(
    `
function bfs(graph, source) {                 //@start
  const dist = { [source]: 0 };               //@init
  const queue = [source];
  while (queue.length > 0) {
    const u = queue.shift();                  //@dequeue
    for (const v of graph[u]) {
      if (!(v in dist)) {                     //@check
        dist[v] = dist[u] + 1;                //@visit
        queue.push(v);
      }
    }
  }
  return dist;                                //@done
}`,
    `
from collections import deque

def bfs(graph, source):              #@start
    dist = {source: 0}               #@init
    queue = deque([source])
    while queue:
        u = queue.popleft()          #@dequeue
        for v in graph[u]:
            if v not in dist:        #@check
                dist[v] = dist[u] + 1  #@visit
                queue.append(v)
    return dist                      #@done`
  ),
  run(input) {
    const { nodes, edges, directed, source, target } = input
    const adj = adjacency(nodes, edges, directed)
    const G = makeGraphView(input)
    const R = recorder()
    const hops = { [source]: 0 }
    const wdist = { [source]: 0 } // weight along the BFS route (to compare with weighted algorithms)
    const prev = {}
    const order = []
    const queue = [source]
    let edgeChecks = 0
    const sync = () => {
      G.setBadges(Object.fromEntries(nodes.map((n) => [n, n in hops ? `${hops[n]} hop${hops[n] === 1 ? '' : 's'}` : '?'])))
      G.setAux([{ title: 'Queue (front → back)', items: queue }, { title: 'Visit order', items: order }])
      for (const k of Object.keys(G.es)) delete G.es[k]
      for (const v in prev) G.es[prev[v].ei] = 'tree'
    }
    sync()
    R.add('start', `Breadth-first search from ${source}.`, 'BFS explores in rings: first everything 1 hop away, then 2 hops, and so on. Edge weights are ignored.', { source }, G.snap())
    G.ns[source] = 'frontier'
    sync()
    R.add('init', `Mark ${source} as discovered (0 hops) and put it in the queue.`, 'The queue keeps nodes in the order they were discovered: first in, first out.', { queue: queue.join(', ') }, G.snap())
    while (queue.length) {
      const u = queue.shift()
      order.push(u)
      G.ns[u] = 'current'
      sync()
      R.add('dequeue', `Take ${u} from the front of the queue (${hops[u]} hops from ${source}).`, 'Nodes leave the queue in order of distance, so the first time we reach a node is via the fewest hops.', { u, 'dist[u]': hops[u], queue: queue.join(', ') || '(empty)' }, G.snap())
      for (const { v, w, ei } of adj[u]) {
        edgeChecks++
        const fresh = !(v in hops)
        R.add('check', `Look at neighbour ${v}: ${fresh ? 'not seen yet' : 'already discovered'}.`, fresh ? 'A new node, so it is 1 hop further than u.' : 'Already has a shorter-or-equal hop count, skip it.', { u, v, edgeChecks }, G.snap({ edgeState: { ...G.snap().edgeState, [ei]: 'considered' } }))
        if (fresh) {
          hops[v] = hops[u] + 1
          wdist[v] = wdist[u] + w
          prev[v] = { u, ei }
          queue.push(v)
          G.ns[v] = 'frontier'
          sync()
          R.add('visit', `${v} is ${hops[v]} hop(s) away; add it to the back of the queue.`, 'It will be expanded after every node that is closer.', { v, 'dist[v]': hops[v], queue: queue.join(', ') }, G.snap())
        }
      }
      G.ns[u] = 'settled'
      sync()
    }
    const path = pathTo(prev, source, target)
    if (path) {
      path.nodes.forEach((n) => (G.ns[n] = 'path'))
      path.edges.forEach((e) => (G.es[e] = 'path'))
    }
    const unit = unitOf(input)
    const weighted = edges.some((e) => e.weight != null && e.weight !== 1)
    R.add('done', path ? `Fewest-hop route to ${target}: ${path.nodes.join(' → ')} (${hops[target]} hops${weighted ? `, total weight ${fmt(wdist[target])}${unit}` : ''}).` : `Visited ${order.length} node(s): ${order.join(', ')}.`, weighted ? 'BFS minimises the number of hops, not the total weight, so on weighted graphs it may not give the cheapest route.' : 'On unweighted graphs, fewest hops = shortest path.', { visited: order.length, edgeChecks }, G.snap())
    const compare = Object.fromEntries(nodes.map((n) => [n, n in wdist ? wdist[n] : Infinity]))
    return {
      steps: R.steps,
      result: {
        answer: { hops, order, path: path?.nodes || null },
        compare,
        summary: path ? `Route ${path.nodes.join(' → ')} with ${hops[target]} hop(s)${weighted ? `, weight ${fmt(wdist[target])}${unit}` : ''}.` : `Reachable from ${source}: ${order.join(', ')}.`,
        stats: { edgeChecks, nodesVisited: order.length },
        metric: target != null ? { label: `Cost of route to ${target}`, value: wdist[target] ?? Infinity } : null,
      },
    }
  },
}

// ---------- DFS ----------
export const dfs = {
  id: 'dfs',
  code: sources(
    `
function dfs(graph, u, visited = new Set()) { //@start
  visited.add(u);                             //@visit
  for (const v of graph[u]) {
    if (!visited.has(v)) {                    //@check
      dfs(graph, v, visited);                 //@recurse
    }
  }
  return visited;                             //@backtrack
}`,
    `
def dfs(graph, u, visited=None):     #@start
    if visited is None:
        visited = set()
    visited.add(u)                   #@visit
    for v in graph[u]:
        if v not in visited:         #@check
            dfs(graph, v, visited)   #@recurse
    return visited                   #@backtrack`
  ),
  run(input) {
    const { nodes, edges, directed, source, target } = input
    const adj = adjacency(nodes, edges, directed)
    const G = makeGraphView(input)
    const R = recorder()
    const visited = new Set()
    const order = []
    const stack = []
    const prev = {}
    let edgeChecks = 0
    const sync = () => {
      G.setAux([{ title: 'Call stack (bottom → top)', items: stack }, { title: 'Visit order', items: order }])
      G.setBadges(Object.fromEntries(order.map((n, i) => [n, `#${i + 1}`])))
      for (const k of Object.keys(G.es)) delete G.es[k]
      for (const v in prev) G.es[prev[v].ei] = 'tree'
    }
    sync()
    R.add('start', `Depth-first search from ${source}.`, 'DFS goes as deep as possible along one branch before backing up. It uses a stack (here: the recursion).', { source }, G.snap())
    const go = (u, depth) => {
      visited.add(u)
      order.push(u)
      stack.push(u)
      G.ns[u] = 'current'
      sync()
      R.add('visit', `Visit ${u} (depth ${depth}).`, 'Mark it visited so we never process it twice, even if the graph has cycles.', { u, depth, stack: stack.join(' → ') }, G.snap())
      for (const { v, ei } of adj[u]) {
        edgeChecks++
        const fresh = !visited.has(v)
        R.add('check', `From ${u}, look at ${v}: ${fresh ? 'unvisited, go deeper' : 'already visited'}.`, fresh ? 'DFS dives immediately instead of finishing u’s other neighbours first.' : 'Skipping prevents infinite loops.', { u, v, edgeChecks }, G.snap({ edgeState: { ...G.snap().edgeState, [ei]: 'considered' } }))
        if (fresh) {
          prev[v] = { u, ei }
          G.ns[u] = 'frontier'
          sync()
          R.add('recurse', `Recurse into ${v}.`, `${u} waits on the stack until ${v}'s whole branch is explored.`, { u, v }, G.snap())
          go(v, depth + 1)
          G.ns[u] = 'current'
          sync()
        }
      }
      stack.pop()
      G.ns[u] = 'settled'
      sync()
      R.add('backtrack', `Finished ${u}; backtrack${stack.length ? ` to ${stack.at(-1)}` : ''}.`, 'All neighbours of this node are explored.', { u, stack: stack.join(' → ') || '(empty)' }, G.snap())
    }
    go(source, 0)
    const path = pathTo(prev, source, target)
    if (path) {
      path.nodes.forEach((n) => (G.ns[n] = 'path'))
      path.edges.forEach((e) => (G.es[e] = 'path'))
      R.add('backtrack', `DFS reached ${target} via ${path.nodes.join(' → ')}. This is *a* path, not necessarily the shortest.`, 'DFS finds whether a path exists; it does not optimise its length.', { visited: order.length }, G.snap())
    }
    let wd = 0
    if (path) path.edges.forEach((e) => (wd += edges[e].weight ?? 1))
    return {
      steps: R.steps,
      result: {
        answer: { order, path: path?.nodes || null },
        compare: order,
        summary: path ? `Found a path ${path.nodes.join(' → ')}.` : `Visit order: ${order.join(', ')}.`,
        stats: { edgeChecks, nodesVisited: order.length },
        metric: target != null && path ? { label: `Cost of route to ${target}`, value: wd } : null,
      },
    }
  },
}

// ---------- Dijkstra ----------
export const dijkstra = {
  id: 'dijkstra',
  code: sources(
    `
function dijkstra(graph, source) {                   //@start
  const dist = {};                                   //@init
  for (const v in graph) dist[v] = Infinity;
  dist[source] = 0;
  const pq = [[0, source]]; // use a binary min-heap in real code
  const done = new Set();
  while (pq.length > 0) {
    pq.sort((a, b) => a[0] - b[0]);
    const [d, u] = pq.shift();                       //@pop
    if (done.has(u)) continue;                       //@skip
    done.add(u);                                     //@settle
    for (const [v, w] of graph[u]) {
      if (d + w < dist[v]) {                         //@check
        dist[v] = d + w;                             //@relax
        pq.push([dist[v], v]);
      }
    }
  }
  return dist;                                       //@done
}`,
    `
import heapq

def dijkstra(graph, source):                 #@start
    dist = {v: float('inf') for v in graph}  #@init
    dist[source] = 0
    pq = [(0, source)]
    done = set()
    while pq:
        d, u = heapq.heappop(pq)             #@pop
        if u in done:                        #@skip
            continue
        done.add(u)                          #@settle
        for v, w in graph[u]:
            if d + w < dist[v]:              #@check
                dist[v] = d + w              #@relax
                heapq.heappush(pq, (dist[v], v))
    return dist                              #@done`
  ),
  run(input) {
    const { nodes, edges, directed, source, target } = input
    const adj = adjacency(nodes, edges, directed)
    const G = makeGraphView(input)
    const R = recorder()
    const U = unitOf(input)
    const dist = Object.fromEntries(nodes.map((n) => [n, Infinity]))
    const prev = {}
    const done = new Set()
    const pq = []
    const stats = { pops: 0, edgeChecks: 0, relaxations: 0 }
    const sync = () => {
      G.setBadges(distBadges(nodes, dist))
      G.setAux([{ title: 'Priority queue (smallest first)', items: [...pq].sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1])).map(([d, v]) => `${v}:${fmt(d)}`) }])
      for (const k of Object.keys(G.es)) delete G.es[k]
      for (const v in prev) G.es[prev[v].ei] = 'tree'
    }
    sync()
    R.add('start', `Find the cheapest routes from ${source}.`, 'Dijkstra always expands the closest not-yet-final node. With no negative edges, that node’s distance can never improve later.', { source }, G.snap())
    dist[source] = 0
    pq.push([0, source])
    G.ns[source] = 'frontier'
    sync()
    R.add('init', `All distances start at ∞ except ${source} = 0.`, '∞ means "no route found yet".', { source, 'dist[source]': 0 }, G.snap())
    while (pq.length) {
      pq.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]))
      const [d, u] = pq.shift()
      stats.pops++
      sync()
      R.add('pop', `Take the closest entry from the queue: ${u} at ${fmt(d)}${U}.`, 'The priority queue always hands us the smallest tentative distance.', { u, d, pops: stats.pops }, G.snap({ nodeState: { ...G.ns, [u]: 'current' } }))
      if (done.has(u)) {
        R.add('skip', `${u} is already final; this was an outdated, longer entry.`, 'When a distance improves we push a new entry instead of editing the old one, so stale entries get skipped here.', { u, d }, G.snap())
        continue
      }
      done.add(u)
      G.ns[u] = 'current'
      sync()
      R.add('settle', `${u} is now final: ${fmt(d)}${U}.`, 'Every other unsettled node is at least this far away, and edges can’t be negative, so no detour can beat it.', { u, 'dist[u]': d, settled: done.size }, G.snap())
      for (const { v, w, ei } of adj[u]) {
        stats.edgeChecks++
        const cand = d + w
        const better = cand < dist[v]
        R.add('check', `Edge ${u} → ${v} (${fmt(w)}${U}): ${fmt(d)} + ${fmt(w)} = ${fmt(cand)} ${better ? '<' : '≥'} current ${fmt(dist[v])}.`, better ? `Going through ${u} is cheaper than anything known for ${v}.` : `The known route to ${v} is already as good or better.`, { u, v, w, 'd+w': cand, 'dist[v]': dist[v], edgeChecks: stats.edgeChecks }, G.snap({ edgeState: { ...G.snap().edgeState, [ei]: 'considered' } }))
        if (better) {
          dist[v] = cand
          prev[v] = { u, ei }
          pq.push([cand, v])
          stats.relaxations++
          if (!done.has(v)) G.ns[v] = 'frontier'
          sync()
          R.add('relax', `Update ${v}: ${fmt(cand)}${U} (via ${u}).`, 'This is called "relaxing" an edge: tightening the best known distance.', { v, 'dist[v]': cand, relaxations: stats.relaxations }, G.snap())
        }
      }
      G.ns[u] = 'settled'
      sync()
    }
    const path = pathTo(prev, source, target)
    if (path) {
      path.nodes.forEach((n) => (G.ns[n] = 'path'))
      path.edges.forEach((e) => (G.es[e] = 'path'))
    }
    R.add('done', path ? `Cheapest route to ${target}: ${path.nodes.join(' → ')} = ${fmt(dist[target])}${U}.` : `Final distances from ${source} are shown on each node.`, 'Each node settled exactly once, which is why Dijkstra is O((V + E) log V) with a heap.', { ...stats }, G.snap())
    return {
      steps: R.steps,
      result: {
        answer: { dist, path: path?.nodes || null },
        compare: { ...dist },
        summary: path ? `Cheapest route ${path.nodes.join(' → ')} costs ${fmt(dist[target])}${U}.` : `Distances: ${nodes.map((n) => `${n}=${fmt(dist[n])}`).join(', ')}.`,
        stats,
        metric: target != null ? { label: `Cost of route to ${target}`, value: dist[target] } : null,
      },
    }
  },
}

// ---------- Bellman-Ford ----------
export const bellman_ford = {
  id: 'bellman_ford',
  code: sources(
    `
function bellmanFord(nodes, edges, source) {       //@start
  const dist = {};                                 //@init
  for (const v of nodes) dist[v] = Infinity;
  dist[source] = 0;
  for (let i = 0; i < nodes.length - 1; i++) {     //@round
    for (const { from, to, weight } of edges) {
      if (dist[from] + weight < dist[to]) {        //@check
        dist[to] = dist[from] + weight;            //@relax
      }
    }
  }
  for (const { from, to, weight } of edges) {
    if (dist[from] + weight < dist[to]) {          //@cycle
      throw new Error('negative cycle');
    }
  }
  return dist;                                     //@done
}`,
    `
def bellman_ford(nodes, edges, source):          #@start
    dist = {v: float('inf') for v in nodes}      #@init
    dist[source] = 0
    for _ in range(len(nodes) - 1):              #@round
        for u, v, w in edges:
            if dist[u] + w < dist[v]:            #@check
                dist[v] = dist[u] + w            #@relax
    for u, v, w in edges:
        if dist[u] + w < dist[v]:                #@cycle
            raise ValueError("negative cycle")
    return dist                                  #@done`
  ),
  run(input) {
    const { nodes, edges, directed, source, target } = input
    // Undirected edges are treated as two directed edges.
    const list = []
    edges.forEach((e, ei) => {
      list.push({ from: e.from, to: e.to, w: e.weight ?? 1, ei })
      if (!directed) list.push({ from: e.to, to: e.from, w: e.weight ?? 1, ei })
    })
    const G = makeGraphView(input)
    const R = recorder()
    const U = unitOf(input)
    const dist = Object.fromEntries(nodes.map((n) => [n, Infinity]))
    const prev = {}
    const stats = { rounds: 0, edgeChecks: 0, relaxations: 0 }
    const sync = () => {
      G.setBadges(distBadges(nodes, dist))
      for (const k of Object.keys(G.es)) delete G.es[k]
      for (const v in prev) G.es[prev[v].ei] = 'tree'
    }
    sync()
    R.add('start', `Bellman-Ford from ${source}.`, 'Instead of picking the closest node, relax every edge, V−1 times. Slower, but it works even with negative edges.', { source }, G.snap())
    dist[source] = 0
    G.ns[source] = 'frontier'
    sync()
    R.add('init', `dist[${source}] = 0, all others ∞.`, 'Any shortest path uses at most V−1 edges, so V−1 rounds are always enough.', { source }, G.snap())
    for (let i = 0; i < nodes.length - 1; i++) {
      stats.rounds++
      R.add('round', `Round ${i + 1} of ${nodes.length - 1}: relax every edge.`, `After round k, every shortest path that uses ≤ k edges is correct.`, { round: i + 1, relaxations: stats.relaxations }, G.snap())
      for (const { from, to, w, ei } of list) {
        stats.edgeChecks++
        const cand = dist[from] + w
        const better = cand < dist[to]
        if (dist[from] === Infinity) continue // nothing to learn from an unreached node (still counted as a check)
        R.add('check', `${from} → ${to} (${fmt(w)}${U}): ${fmt(dist[from])} + ${fmt(w)} = ${fmt(cand)} ${better ? '<' : '≥'} ${fmt(dist[to])}.`, better ? 'Cheaper route found.' : 'No improvement.', { round: i + 1, from, to, w, edgeChecks: stats.edgeChecks }, G.snap({ edgeState: { ...G.snap().edgeState, [ei]: 'considered' } }))
        if (better) {
          dist[to] = cand
          prev[to] = { u: from, ei }
          stats.relaxations++
          G.ns[to] = 'frontier'
          sync()
          R.add('relax', `Update ${to} = ${fmt(cand)}${U}.`, 'Relaxing an edge can make a node cheaper even if it was updated before; nothing is "final" until the end.', { to, 'dist[to]': cand, relaxations: stats.relaxations }, G.snap())
        }
      }
    }
    let negativeCycle = false
    for (const { from, to, w, ei } of list) {
      if (dist[from] !== Infinity && dist[from] + w < dist[to]) {
        negativeCycle = true
        R.add('cycle', `Edge ${from} → ${to} can still be relaxed after V−1 rounds: negative cycle!`, 'If costs keep dropping forever, there is no "cheapest" route.', { from, to }, G.snap({ edgeState: { ...G.snap().edgeState, [ei]: 'rejected' } }))
        break
      }
    }
    if (negativeCycle) {
      return { steps: R.steps, result: { answer: { negativeCycle: true }, compare: 'negative-cycle', summary: 'The graph has a negative cycle, so shortest paths are undefined.', stats, metric: null } }
    }
    R.add('cycle', 'Extra pass: no edge improves any more, so there is no negative cycle.', 'This check is what makes Bellman-Ford safe for graphs with negative edges.', { ...stats }, G.snap())
    const path = pathTo(prev, source, target)
    if (path) {
      path.nodes.forEach((n) => (G.ns[n] = 'path'))
      path.edges.forEach((e) => (G.es[e] = 'path'))
    }
    nodes.forEach((n) => G.ns[n] !== 'path' && dist[n] !== Infinity && (G.ns[n] = 'settled'))
    R.add('done', path ? `Cheapest route to ${target}: ${path.nodes.join(' → ')} = ${fmt(dist[target])}${U}.` : 'Final distances are shown on each node.', `It checked ${stats.edgeChecks} edges: that's the O(V·E) cost of not trusting any distance early.`, { ...stats }, G.snap())
    return {
      steps: R.steps,
      result: {
        answer: { dist, path: path?.nodes || null },
        compare: { ...dist },
        summary: path ? `Cheapest route ${path.nodes.join(' → ')} costs ${fmt(dist[target])}${U}.` : `Distances: ${nodes.map((n) => `${n}=${fmt(dist[n])}`).join(', ')}.`,
        stats,
        metric: target != null ? { label: `Cost of route to ${target}`, value: dist[target] } : null,
      },
    }
  },
}

// ---------- Floyd-Warshall ----------
export const floyd_warshall = {
  id: 'floyd_warshall',
  code: sources(
    `
function floydWarshall(dist) {                       //@start
  // dist[i][j] = edge weight, 0 on diagonal, Infinity if no edge //@init
  const n = dist.length;
  for (let k = 0; k < n; k++) {                      //@k
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (dist[i][k] + dist[k][j] < dist[i][j]) {  //@check
          dist[i][j] = dist[i][k] + dist[k][j];      //@update
        }
      }
    }
  }
  return dist;                                       //@done
}`,
    `
def floyd_warshall(dist):                            #@start
    # dist[i][j] = edge weight, 0 on diagonal, inf if no edge  #@init
    n = len(dist)
    for k in range(n):                               #@k
        for i in range(n):
            for j in range(n):
                if dist[i][k] + dist[k][j] < dist[i][j]:  #@check
                    dist[i][j] = dist[i][k] + dist[k][j]  #@update
    return dist                                      #@done`
  ),
  run(input) {
    const { nodes, edges, directed, source, target } = input
    const n = nodes.length
    const idx = Object.fromEntries(nodes.map((v, i) => [v, i]))
    const D = nodes.map((_, i) => nodes.map((_, j) => (i === j ? 0 : Infinity)))
    edges.forEach((e) => {
      const w = e.weight ?? 1
      const a = idx[e.from]
      const b = idx[e.to]
      D[a][b] = Math.min(D[a][b], w)
      if (!directed) D[b][a] = Math.min(D[b][a], w)
    })
    const R = recorder()
    const U = unitOf(input)
    const stats = { checks: 0, updates: 0 }
    const view = (hl = {}, k = null) => ({
      kind: 'table',
      caption: k == null ? 'Distance matrix (row = from, column = to)' : `Allowing ${nodes[k]} as a stop-over`,
      rowHeaders: nodes,
      colHeaders: nodes,
      cells: D.map((r) => r.map((x) => fmt(x))),
      highlight: hl,
      focusRow: k,
      focusCol: k,
    })
    R.add('start', `Floyd-Warshall on ${n} nodes: cheapest route between every pair.`, 'Try every node k as a possible stop-over between every pair (i, j).', { n }, view())
    R.add('init', 'Start with direct edges only: 0 on the diagonal, ∞ where there is no direct edge.', 'At this point the matrix allows no intermediate stops.', {}, view())
    for (let k = 0; k < n; k++) {
      R.add('k', `Now allow routes through ${nodes[k]}.`, `After this round, dist[i][j] is the best route using only stop-overs from {${nodes.slice(0, k + 1).join(', ')}}.`, { k: nodes[k], updates: stats.updates }, view({}, k))
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          stats.checks++
          if (i === j || i === k || j === k || D[i][k] === Infinity || D[k][j] === Infinity) continue
          const cand = D[i][k] + D[k][j]
          const better = cand < D[i][j]
          R.add('check', `${nodes[i]} → ${nodes[k]} → ${nodes[j]}: ${fmt(D[i][k])} + ${fmt(D[k][j])} = ${fmt(cand)} ${better ? '<' : '≥'} ${fmt(D[i][j])}.`, better ? `Going via ${nodes[k]} is cheaper.` : 'The current route is already as good.', { k: nodes[k], i: nodes[i], j: nodes[j], checks: stats.checks }, view({ [`${i},${k}`]: 'source', [`${k},${j}`]: 'source', [`${i},${j}`]: 'current' }, k))
          if (better) {
            D[i][j] = cand
            stats.updates++
            R.add('update', `dist[${nodes[i]}][${nodes[j]}] = ${fmt(cand)}${U}.`, 'Improved by allowing one more stop-over node.', { updates: stats.updates }, view({ [`${i},${j}`]: 'found' }, k))
          }
        }
      }
    }
    R.add('done', `All-pairs distances ready (${stats.checks} checks, ${stats.updates} updates).`, `Always n³ = ${n ** 3} checks, whichever pairs you actually need.`, { ...stats }, view())
    const s = source != null ? idx[source] : 0
    const rowDist = Object.fromEntries(nodes.map((v, j) => [v, D[s][j]]))
    return {
      steps: R.steps,
      result: {
        answer: { matrix: D, nodes },
        compare: rowDist,
        summary: target != null ? `Cheapest ${source} → ${target} = ${fmt(D[s][idx[target]])}${U} (plus every other pair).` : 'Computed cheapest routes between every pair.',
        stats,
        metric: target != null ? { label: `Cost of route to ${target}`, value: D[s][idx[target]] } : null,
      },
    }
  },
}

// ---------- Prim ----------
export const prim = {
  id: 'prim',
  code: sources(
    `
function prim(graph, start) {                       //@start
  const inTree = new Set([start]);                  //@init
  const pq = graph[start].map(([v, w]) => [w, start, v]);
  let total = 0;
  while (pq.length > 0) {
    pq.sort((a, b) => a[0] - b[0]); // a heap in real code
    const [w, u, v] = pq.shift();                   //@pop
    if (inTree.has(v)) continue;                    //@skip
    inTree.add(v);                                  //@add
    total += w;
    for (const [x, wx] of graph[v]) {
      if (!inTree.has(x)) pq.push([wx, v, x]);      //@push
    }
  }
  return total;                                     //@done
}`,
    `
import heapq

def prim(graph, start):                         #@start
    in_tree = {start}                           #@init
    pq = [(w, start, v) for v, w in graph[start]]
    heapq.heapify(pq)
    total = 0
    while pq:
        w, u, v = heapq.heappop(pq)             #@pop
        if v in in_tree:                        #@skip
            continue
        in_tree.add(v)                          #@add
        total += w
        for x, wx in graph[v]:
            if x not in in_tree:                #@push
                heapq.heappush(pq, (wx, v, x))
    return total                                #@done`
  ),
  run(input) {
    const { nodes, edges } = input
    const start = input.source ?? nodes[0]
    const adj = adjacency(nodes, edges, false)
    const G = makeGraphView(input)
    const R = recorder()
    const U = unitOf(input)
    const inTree = new Set([start])
    const tree = []
    let pq = adj[start].map(({ v, w, ei }) => [w, start, v, ei])
    let total = 0
    const stats = { pops: 0, pushes: pq.length }
    const sorter = (a, b) => a[0] - b[0] || a[2].localeCompare(b[2])
    const sync = () => {
      G.setAux([{ title: 'Candidate edges (cheapest first)', items: [...pq].sort(sorter).map(([w, u, v]) => `${u}-${v}:${fmt(w)}`) }, { title: 'Tree edges', items: tree.map((ei) => `${edges[ei].from}-${edges[ei].to}`) }])
      G.setBadges({})
      for (const k of Object.keys(G.es)) delete G.es[k]
      tree.forEach((ei) => (G.es[ei] = 'tree'))
    }
    sync()
    R.add('start', `Prim's algorithm: grow one tree from ${start}.`, 'Repeatedly add the cheapest edge that connects the tree to a new node. That edge is always safe to include (the "cut property").', { start }, G.snap())
    G.ns[start] = 'settled'
    sync()
    R.add('init', `Tree = {${start}}. Its edges become candidates.`, 'Only edges touching the tree are candidates.', { inTree: inTree.size }, G.snap())
    while (pq.length) {
      pq.sort(sorter)
      const [w, u, v, ei] = pq.shift()
      stats.pops++
      sync()
      R.add('pop', `Cheapest candidate: ${u}-${v} (${fmt(w)}${U}).`, 'Choosing the cheapest crossing edge can never make the final tree worse.', { u, v, w, pops: stats.pops }, G.snap({ edgeState: { ...G.snap().edgeState, [ei]: 'considered' } }))
      if (inTree.has(v)) {
        R.add('skip', `${v} is already in the tree; this edge would create a cycle.`, 'A spanning tree has no cycles, so skip it.', { v }, G.snap({ edgeState: { ...G.snap().edgeState, [ei]: 'rejected' } }))
        continue
      }
      inTree.add(v)
      tree.push(ei)
      total += w
      G.ns[v] = 'settled'
      sync()
      R.add('add', `Add ${u}-${v}. Tree now has ${inTree.size} node(s); total = ${fmt(total)}${U}.`, `${v} is now connected at the lowest possible extra cost.`, { total, treeNodes: inTree.size }, G.snap())
      const before = pq.length
      for (const { v: x, w: wx, ei: ex } of adj[v]) if (!inTree.has(x)) pq.push([wx, v, x, ex])
      stats.pushes += pq.length - before
      sync()
      if (pq.length > before) R.add('push', `New candidate edges from ${v}: ${pq.length - before}.`, 'The tree touches more nodes now, so more edges cross the cut.', { candidates: pq.length }, G.snap())
    }
    const connected = inTree.size === nodes.length
    R.add('done', connected ? `Minimum spanning tree: ${tree.length} edges, total ${fmt(total)}${U}.` : `Graph is disconnected: only ${inTree.size}/${nodes.length} nodes reachable.`, 'A spanning tree on V nodes always has exactly V−1 edges.', { total, ...stats }, G.snap())
    return {
      steps: R.steps,
      result: {
        answer: { total, edges: tree.map((ei) => edges[ei]) },
        compare: total,
        summary: `Minimum total ${fmt(total)}${U} using ${tree.length} connections.`,
        stats,
        metric: { label: 'Total cost of network', value: total },
      },
    }
  },
}

// ---------- Kruskal ----------
export const kruskal = {
  id: 'kruskal',
  code: sources(
    `
function kruskal(nodes, edges) {                           //@start
  const parent = {};                                       //@init
  for (const v of nodes) parent[v] = v;
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  edges.sort((a, b) => a.weight - b.weight);               //@sort
  let total = 0;
  for (const { from, to, weight } of edges) {
    const a = find(from), b = find(to);                    //@find
    if (a !== b) {                                         //@check
      parent[a] = b;                                       //@union
      total += weight;
    }
  }
  return total;                                            //@done
}`,
    `
def kruskal(nodes, edges):                     #@start
    parent = {v: v for v in nodes}             #@init
    def find(x):
        if parent[x] != x:
            parent[x] = find(parent[x])
        return parent[x]
    edges.sort(key=lambda e: e[2])             #@sort
    total = 0
    for u, v, w in edges:
        a, b = find(u), find(v)                #@find
        if a != b:                             #@check
            parent[a] = b                      #@union
            total += w
    return total                               #@done`
  ),
  run(input) {
    const { nodes, edges } = input
    const G = makeGraphView(input)
    const R = recorder()
    const U = unitOf(input)
    const parent = Object.fromEntries(nodes.map((v) => [v, v]))
    let finds = 0
    const find = (x) => {
      finds++
      return parent[x] === x ? x : (parent[x] = find(parent[x]))
    }
    const order = edges.map((e, ei) => ({ ...e, w: e.weight ?? 1, ei })).sort((a, b) => a.w - b.w || a.ei - b.ei)
    const tree = []
    let total = 0
    let considered = 0
    const groups = () => {
      const g = {}
      for (const v of nodes) {
        let r = v
        while (parent[r] !== r) r = parent[r]
        ;(g[r] ||= []).push(v)
      }
      return Object.values(g).map((m) => `{${m.join(',')}}`)
    }
    const sync = () => {
      G.setAux([{ title: 'Components (union-find)', items: groups() }, { title: 'Edges by weight', items: order.map((e) => `${e.from}-${e.to}:${fmt(e.w)}`) }])
      for (const k of Object.keys(G.es)) delete G.es[k]
      tree.forEach((ei) => (G.es[ei] = 'tree'))
    }
    sync()
    R.add('start', `Kruskal's algorithm on ${nodes.length} nodes, ${edges.length} edges.`, 'Take edges from cheapest to most expensive; keep an edge unless it would close a cycle.', { V: nodes.length, E: edges.length }, G.snap())
    R.add('init', 'Each node starts in its own component.', 'Union-find tracks which nodes are already connected.', {}, G.snap())
    R.add('sort', `Sort edges by weight: ${order.map((e) => fmt(e.w)).join(', ')}.`, 'Sorting is the main cost: O(E log E).', {}, G.snap())
    for (const e of order) {
      considered++
      const a = find(e.from)
      const b = find(e.to)
      R.add('find', `Edge ${e.from}-${e.to} (${fmt(e.w)}${U}): ${e.from} is in group ${a}, ${e.to} is in group ${b}.`, 'find() returns the representative of a node’s component.', { edge: `${e.from}-${e.to}`, w: e.w, considered }, G.snap({ edgeState: { ...G.snap().edgeState, [e.ei]: 'considered' } }))
      if (a !== b) {
        R.add('check', 'Different groups → no cycle. Keep it.', 'Connecting two separate components can never form a cycle.', { a, b }, G.snap({ edgeState: { ...G.snap().edgeState, [e.ei]: 'considered' } }))
        parent[a] = b
        tree.push(e.ei)
        total += e.w
        G.ns[e.from] = 'settled'
        G.ns[e.to] = 'settled'
        sync()
        R.add('union', `Merge the groups. Total = ${fmt(total)}${U}.`, `The tree has ${tree.length} of ${nodes.length - 1} edges.`, { total, treeEdges: tree.length }, G.snap())
      } else {
        R.add('check', 'Same group → this edge would create a cycle. Skip.', 'The two ends are already connected by cheaper edges.', { a, b }, G.snap({ edgeState: { ...G.snap().edgeState, [e.ei]: 'rejected' } }))
      }
    }
    sync()
    R.add('done', `Minimum spanning tree: ${tree.length} edges, total ${fmt(total)}${U}.`, 'Same total as Prim. Both are optimal; they just build the tree in a different order.', { total, considered, finds }, G.snap())
    return {
      steps: R.steps,
      result: {
        answer: { total, edges: tree.map((ei) => edges[ei]) },
        compare: total,
        summary: `Minimum total ${fmt(total)}${U} using ${tree.length} connections.`,
        stats: { edgesConsidered: considered, finds },
        metric: { label: 'Total cost of network', value: total },
      },
    }
  },
}

// ---------- Topological sort (Kahn) ----------
export const topological_sort = {
  id: 'topological_sort',
  code: sources(
    `
function topoSort(graph) {                          //@start
  const indeg = {};                                 //@init
  for (const u in graph) indeg[u] = 0;
  for (const u in graph) for (const v of graph[u]) indeg[v]++;
  const queue = Object.keys(graph).filter((v) => indeg[v] === 0); //@seed
  const order = [];
  while (queue.length > 0) {
    const u = queue.shift();                        //@take
    order.push(u);
    for (const v of graph[u]) {
      indeg[v]--;                                   //@reduce
      if (indeg[v] === 0) queue.push(v);            //@ready
    }
  }
  if (order.length < Object.keys(graph).length) throw new Error('cycle'); //@cycle
  return order;                                     //@done
}`,
    `
from collections import deque

def topo_sort(graph):                                #@start
    indeg = {u: 0 for u in graph}                    #@init
    for u in graph:
        for v in graph[u]:
            indeg[v] += 1
    queue = deque(v for v in graph if indeg[v] == 0) #@seed
    order = []
    while queue:
        u = queue.popleft()                          #@take
        order.append(u)
        for v in graph[u]:
            indeg[v] -= 1                            #@reduce
            if indeg[v] == 0:                        #@ready
                queue.append(v)
    if len(order) < len(graph):                      #@cycle
        raise ValueError("cycle")
    return order                                     #@done`
  ),
  run(input) {
    const { nodes, edges } = input
    const adj = adjacency(nodes, edges, true)
    const G = makeGraphView({ ...input, directed: true })
    const R = recorder()
    const indeg = Object.fromEntries(nodes.map((n) => [n, 0]))
    edges.forEach((e) => indeg[e.to]++)
    const queue = []
    const order = []
    const sync = () => {
      G.setBadges(Object.fromEntries(nodes.map((n) => [n, `in:${indeg[n]}`])))
      G.setAux([{ title: 'Ready queue (in-degree 0)', items: queue }, { title: 'Order so far', items: order }])
    }
    sync()
    R.add('start', `Order ${nodes.length} tasks so every prerequisite comes first.`, 'Kahn’s algorithm repeatedly takes a task that has no unfinished prerequisites.', { V: nodes.length, E: edges.length }, G.snap())
    R.add('init', 'Count prerequisites (in-degree) for each task.', 'in:k on a node = k arrows point into it = k things must happen before it.', { ...indeg }, G.snap())
    nodes.forEach((n) => indeg[n] === 0 && queue.push(n))
    queue.forEach((n) => (G.ns[n] = 'frontier'))
    sync()
    R.add('seed', `Tasks with no prerequisites: ${queue.join(', ') || 'none'}.`, 'These can be done right away.', { queue: queue.join(', ') }, G.snap())
    let reductions = 0
    while (queue.length) {
      const u = queue.shift()
      order.push(u)
      G.ns[u] = 'current'
      sync()
      R.add('take', `Do ${u} next (position ${order.length}).`, 'All of its prerequisites are already in the order.', { u, order: order.join(' → ') }, G.snap())
      for (const { v, ei } of adj[u]) {
        indeg[v]--
        reductions++
        sync()
        R.add('reduce', `${u} is done, so ${v} has one prerequisite fewer (in:${indeg[v]}).`, 'Finishing a task removes its outgoing arrows.', { v, 'indeg[v]': indeg[v] }, G.snap({ edgeState: { ...G.es, [ei]: 'considered' } }))
        G.es[ei] = 'tree'
        if (indeg[v] === 0) {
          queue.push(v)
          G.ns[v] = 'frontier'
          sync()
          R.add('ready', `${v} has no prerequisites left; it joins the ready queue.`, 'It can be scheduled any time from now on.', { queue: queue.join(', ') }, G.snap())
        }
      }
      G.ns[u] = 'settled'
      sync()
    }
    const ok = order.length === nodes.length
    R.add(ok ? 'done' : 'cycle', ok ? `Valid order: ${order.join(' → ')}.` : `Only ${order.length}/${nodes.length} tasks could be ordered: there is a cycle of prerequisites.`, ok ? 'Each task appears after everything it depends on. O(V + E).' : 'Tasks in a cycle all wait on each other, so none can start.', { reductions }, G.snap())
    return {
      steps: R.steps,
      result: {
        answer: ok ? order : { cycle: true, partial: order },
        compare: ok ? order : 'cycle',
        summary: ok ? `Do the tasks in this order: ${order.join(' → ')}.` : 'There is a cycle of prerequisites; no valid order exists.',
        stats: { reductions, nodesOrdered: order.length },
        metric: null,
      },
    }
  },
}
