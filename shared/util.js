// Shared helpers used by the step generators, the server and the browser.

/**
 * Source code is written with line markers like `//@settle` (JS) or `#@settle`
 * (Python) at the end of a line. parseSource strips the markers and returns the
 * clean code plus a { key: lineNumber } map, so line highlighting can never drift
 * out of sync with the code text.
 */
export function parseSource(src, marker) {
  const lines = src.replace(/^\n/, '').replace(/\s+$/, '').split('\n')
  const map = {}
  const re = new RegExp(`\\s*${marker.replace(/[/#]/g, (c) => '\\' + c)}@([\\w-]+)\\s*$`)
  const clean = lines.map((line, i) => {
    const m = line.match(re)
    if (!m) return line
    if (!(m[1] in map)) map[m[1]] = i + 1
    return line.slice(0, m.index).replace(/\s+$/, '')
  })
  return { code: clean.join('\n'), lines: map }
}

export function sources(js, py) {
  return { javascript: parseSource(js, '//'), python: parseSource(py, '#') }
}

export const clone = (v) => (v === undefined ? undefined : structuredClone(v))

/** Records animation steps. Each step = one moment in the algorithm. */
export function recorder() {
  const steps = []
  return {
    steps,
    add(line, message, why, vars = {}, view = {}) {
      steps.push({ line, message, why, vars: clone(vars), view: clone(view) })
    },
  }
}

export const fmt = (x) => (x === Infinity ? '∞' : x === -Infinity ? '-∞' : Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100))

export const unitOf = (input) => (input?.meta?.unit ? ` ${input.meta.unit}` : '')

/** JSON can't carry Infinity, so replace it before sending anything over the wire / to the LLM. */
export function jsonSafe(value) {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (v === Infinity ? '∞' : v === -Infinity ? '-∞' : Number.isNaN(v) ? null : v))
  )
}

export function deepEqual(a, b) {
  return JSON.stringify(jsonSafe(a)) === JSON.stringify(jsonSafe(b))
}

/** Adjacency list: { node: [{ v, w, ei }] } where ei is the index of the edge in input.edges. */
export function adjacency(nodes, edges, directed) {
  const adj = Object.fromEntries(nodes.map((n) => [n, []]))
  edges.forEach((e, ei) => {
    const w = e.weight ?? 1
    adj[e.from].push({ v: e.to, w, ei })
    if (!directed) adj[e.to].push({ v: e.from, w, ei })
  })
  return adj
}
