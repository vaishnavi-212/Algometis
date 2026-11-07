// Deterministic story parser: pulls real data (names, numbers, links, items, time slots)
// out of a student's plain-English description. Used by
//   - the agent's `extract_data_from_story` tool (real LLM and offline mode), and
//   - the friendly input boxes in the visualizer ("Kitchen-Market 4, Market-Park 2").
// It never invents values: anything it can't find is reported as missing.

const NUM = String.raw`-?\d+(?:\.\d+)?`
const UNIT_RE = /\b(minutes?|mins?|hours?|hrs?|km|kilometres?|kilometers?|metres?|meters?|kg|kilograms?|rupees|rs|₹|\$|dollars?|seconds?|secs?)\b|₹|\$/i
const UNIT_NORMAL = { minute: 'min', minutes: 'min', min: 'min', mins: 'min', hour: 'h', hours: 'h', hr: 'h', hrs: 'h', km: 'km', kilometre: 'km', kilometres: 'km', kilometer: 'km', kilometers: 'km', metre: 'm', metres: 'm', meter: 'm', meters: 'm', kg: 'kg', kilogram: 'kg', kilograms: 'kg', rupees: '₹', rs: '₹', '₹': '₹', $: '$', dollar: '$', dollars: '$', second: 's', seconds: 's', sec: 's', secs: 's' }
const STOP = new Set('a an the i we my our me us to from and or of in on at by for with is are be it its this that there their them they then than so if but as each every all any some can could would should will shall do does need needs want wants find get go going via through route routes road roads path paths way ways time times cost costs takes take distance between also please what which who how many much fastest shortest cheapest quickest best minimum maximum min max total km kg hours hour minutes minute mins m rs one two three four five six seven eight nine ten link links connect connected edge edges node nodes'.split(' '))

const titleCase = (s) =>
  s
    .trim()
    .replace(/^(the|a|an)\s+/i, '')
    .split(/\s+/)
    .map((w) => (w.length <= 3 && /^[A-Z0-9]+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')

const toNum = (s) => {
  if (s == null) return null
  const t = String(s).replace(',', '.')
  if (/^\d{1,2}[:.]\d{2}$/.test(t) && t.includes(':')) {
    const [h, m] = t.split(':').map(Number)
    return h + m / 60
  }
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function detectUnit(text) {
  const m = text.match(UNIT_RE)
  if (!m) return undefined
  return UNIT_NORMAL[(m[1] || m[0]).toLowerCase()] || undefined
}

const firstSentence = (text) => text.split(/(?<=[.!?])\s|\n/)[0].trim().slice(0, 90)

/** Split text into small clauses (commas, semicolons, new lines, " and ", " while "). */
function clauses(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/[;\n]|,(?!\d)|\.\s|\band\b(?=\s+[A-Za-z][\w' ]{0,30}\s+(?:to|->|→|-|–|before|after|needs|requires|is|are)\b)|\bwhile\b/i)
    .map((c) => c.trim())
    .filter(Boolean)
}

// A name = 1–3 words, each starting with a letter ("Kitchen", "Hostel A", "Maths II", "H1").
const NAME = String.raw`([A-Za-z][\w']*(?:\s+[A-Za-z][\w']*){0,2})`
const END_STOP = new Set('is are was to takes take costs cost of in on at min mins minute minutes km m kg hour hours hrs the and with from by for'.split(' '))
const cleanName = (n) => {
  const words = n.trim().replace(/[.?!:;]+$/, '').split(/\s+/)
  while (words.length && STOP.has(words[0].toLowerCase())) words.shift()
  while (words.length && END_STOP.has(words[words.length - 1].toLowerCase())) words.pop()
  if (!words.length || words.length > 3) return null
  return titleCase(words.join(' '))
}
const FROM_TO = new RegExp(`from\\s+(?:the\\s+)?${NAME}\\s+to\\s+(?:the\\s+)?${NAME}`, 'i')

// ---------------------------------------------------------------- numbers
export function parseNumberList(text) {
  // longest run of numbers separated by commas/spaces (at least 2)
  const runs = text.match(new RegExp(`${NUM}(?:\\s*(?:,|\\s)\\s*${NUM})+`, 'g')) || []
  let best = []
  for (const r of runs) {
    const nums = r.split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite)
    if (nums.length > best.length) best = nums
  }
  return best
}

/** "Asha 72, Ben 45, Chen 88" → labels + values */
export function parseLabeledNumbers(text) {
  const re = new RegExp(`([A-Za-z][\\w']*(?:\\s[A-Za-z][\\w']*)?)\\s*(?:[:=-]|got|scored|has|with)?\\s*(${NUM})\\b`, 'g')
  const labels = []
  const values = []
  let m
  while ((m = re.exec(text))) {
    const name = cleanName(m[1])
    if (!name) continue
    labels.push(name)
    values.push(Number(m[2]))
  }
  return labels.length >= 2 ? { itemLabels: labels, values } : null
}

// ---------------------------------------------------------------- graphs
export function parseEdges(text, { requireWeight = false } = {}) {
  const edges = []
  const seen = new Set()
  const add = (a, b, w) => {
    const from = cleanName(a)
    const to = cleanName(b)
    if (!from || !to || from === to) return
    const key = `${from}|${to}`
    if (seen.has(key) || seen.has(`${to}|${from}`)) return
    if (requireWeight && w == null) return
    seen.add(key)
    edges.push(w == null ? { from, to } : { from, to, weight: w })
  }
  // 1) "from X to Y" with no number is the question (source/target), not a link
  let rest = text.replace(new RegExp(`from\\s+(?:the\\s+)?${NAME}\\s+to\\s+(?:the\\s+)?${NAME}(?![\\s\\w]*?(?:is|=|:|takes|costs)?\\s*\\d)`, 'gi'), ' ')
  // 2) "between A and B (is) 5"
  rest = rest.replace(new RegExp(`between\\s+${NAME}\\s+and\\s+${NAME}[^\\d,;.]{0,20}?(${NUM})`, 'gi'), (_m, a, b, w) => {
    add(a, b, Number(w))
    return ' ; '
  })
  for (const c of clauses(rest)) {
    let m
    // 3) "Asha is friends with Ben", "A knows B", "A is connected to B"
    if ((m = c.match(new RegExp(`${NAME}\\s+(?:is\\s+|are\\s+)?(?:friends with|knows|connected (?:to|with)|linked (?:to|with)|connects to|next to|adjacent to)\\s+${NAME}(?:\\D{0,12}(${NUM}))?`, 'i')))) {
      add(m[1], m[2], m[3] != null ? Number(m[3]) : null)
      continue
    }
    // 4) "A to/->/- B (is|takes|costs|:)? 5"
    if ((m = c.match(new RegExp(`${NAME}\\s*(?:\\bto\\b|->|→|–|—|-(?!\\d))\\s*${NAME}\\s*(?:\\(|:|=)?\\s*(?:₹|rs\\.?|\\$)?\\s*(${NUM})?`, 'i')))) add(m[1], m[2], m[3] != null ? Number(m[3]) : null)
  }
  return edges
}

export function parsePrerequisites(text) {
  const edges = []
  const seen = new Set()
  const add = (a, b) => {
    const from = cleanName(a)
    const to = cleanName(b)
    if (!from || !to || from === to || seen.has(`${from}|${to}`)) return
    seen.add(`${from}|${to}`)
    edges.push({ from, to })
  }
  const many = (s) => s.split(/\s*(?:,|\band\b|&)\s*/).filter(Boolean)
  const sentences = text.replace(/\s+/g, ' ').split(/[;\n]|\.\s|,\s*(?=[A-Za-z][\w' ]{0,30}\s+(?:before|after|needs|requires|depends|->|→))/)
  for (const c of sentences) {
    let m
    if ((m = c.match(new RegExp(`${NAME}\\s+(?:comes\\s+|must\\s+come\\s+|is\\s+|goes\\s+)?before\\s+(.+)`, 'i')))) many(m[2]).forEach((t) => add(m[1], t))
    else if ((m = c.match(new RegExp(`${NAME}\\s+(?:comes\\s+|is\\s+)?after\\s+(.+)`, 'i')))) many(m[2]).forEach((t) => add(t, m[1]))
    else if ((m = c.match(new RegExp(`${NAME}\\s+(?:needs|requires|depends on)\\s+(.+)`, 'i')))) many(m[2]).forEach((t) => add(t, m[1]))
    else if ((m = c.match(new RegExp(`${NAME}\\s*(?:->|→)\\s*${NAME}`, 'i')))) add(m[1], m[2])
  }
  return edges
}

function graphFrom(text, family) {
  const ordering = family === 'ordering'
  const edges = ordering ? parsePrerequisites(text) : parseEdges(text)
  if (edges.length < 2) return null
  const nodes = [...new Set(edges.flatMap((e) => [e.from, e.to]))]
  const input = { nodes, edges, directed: ordering || /one[- ]way|directed/i.test(text) }
  const st = text.match(FROM_TO)
  const find = (raw) => {
    const n = raw && cleanName(raw)
    if (!n) return null
    return nodes.find((x) => x.toLowerCase() === n.toLowerCase()) || nodes.find((x) => x.toLowerCase().startsWith(n.toLowerCase().split(' ')[0])) || null
  }
  if (!ordering) {
    input.source = (st && find(st[1])) || find((text.match(new RegExp(`(?:from|start(?:ing)? at)\\s+(?:the\\s+)?${NAME}`, 'i')) || [])[1]) || nodes[0]
    const tgt = st && find(st[2])
    if (tgt && tgt !== input.source) input.target = tgt
  }
  return input
}

// ---------------------------------------------------------------- items, activities, strings, coins
export function parseItems(text) {
  const items = []
  const re = new RegExp(`${NAME}\\s*[(:,-]?\\s*(?:weighs\\s*|weight\\s*)?(${NUM})\\s*(?:kg|kgs|units?|lbs?)?\\s*[,;/]?\\s*(?:and\\s*)?(?:value|worth|price|profit|₹|rs\\.?|\\$|v)\\s*(?:of\\s*|is\\s*|=\\s*|:\\s*)?(?:₹|rs\\.?|\\$)?\\s*(${NUM})`, 'gi')
  for (const m of text.matchAll(re)) {
    const name = cleanName(m[1])
    if (!name || items.some((i) => i.name === name)) continue
    const weight = Math.round(Number(m[2]))
    const value = Number(m[3])
    if (weight >= 1 && value > 0) items.push({ name, weight, value })
  }
  return items
}

export function parseCapacity(text) {
  const m = text.match(new RegExp(`(?:capacity|limit|max(?:imum)?|budget|up to|holds?|carry)\\s*(?:of|is|=|:)?\\s*(?:₹|rs\\.?|\\$)?\\s*(${NUM})`, 'i')) || text.match(new RegExp(`(${NUM})\\s*(?:kg|kgs)?\\s*(?:bag|truck|backpack|knapsack|capacity|budget|box)`, 'i'))
  return m ? Math.round(Number(m[1])) : null
}

export function parseActivities(text) {
  const acts = []
  const T = String.raw`(\d{1,2}(?:[:.]\d{1,2})?)\s*(am|pm)?`
  const re = new RegExp(`${NAME}\\s*[(:,]?\\s*(?:from\\s+|at\\s+)?${T}\\s*(?:-|–|—|to|until|till)\\s*${T}`, 'gi')
  const conv = (v, ap) => {
    let n = toNum(v.includes(':') ? v : v.replace(/^(\d{1,2})\.(\d{2})$/, (_, h, mm) => `${h}:${mm}`))
    if (ap && /pm/i.test(ap) && n < 12) n += 12
    return n
  }
  for (const m of text.matchAll(re)) {
    const name = cleanName(m[1])
    if (!name || acts.some((a) => a.name === name)) continue
    const start = conv(m[2], m[3])
    const end = conv(m[4], m[5] || m[3])
    if (start != null && end != null && end > start) acts.push({ name, start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100 })
  }
  return acts
}

export function parseTwoStrings(text) {
  const q = [...text.matchAll(/["“']([^"”']{1,10})["”']/g)].map((m) => m[1])
  if (q.length >= 2) return { a: q[0], b: q[1] }
  const caps = text.match(/\b[A-Z]{3,10}\b/g) || []
  if (caps.length >= 2) return { a: caps[0], b: caps[1] }
  return null
}

export function parseCoins(text) {
  const m = text.match(new RegExp(`(?:coins?|tokens?|notes?|denominations?|stamps?)\\s*(?:of|worth|are|with values?|valued|:)?\\s*(?:₹|rs\\.?)?\\s*((?:${NUM}\\s*(?:,|and|or|\\s)\\s*)+${NUM})`, 'i'))
  const coins = m ? [...new Set(m[1].split(/[^\d]+/).filter(Boolean).map(Number))].filter((x) => x >= 1).sort((a, b) => a - b) : []
  const a = text.match(new RegExp(`(?:change (?:of|for)|make|amount(?: of)?|pay|total of|sum of)\\s*(?:₹|rs\\.?)?\\s*(${NUM})`, 'i'))
  return { coins, amount: a ? Math.round(Number(a[1])) : null }
}

// ---------------------------------------------------------------- main entry
export const FAMILY_KIND = { search: 'array_search', sort: 'array_sort', traversal: 'graph', shortest_path: 'graph', mst: 'graph', ordering: 'graph', knapsack: 'knapsack', scheduling: 'activities', sequence_similarity: 'strings', coin_change: 'coins' }

/**
 * Extract an input for a problem family from free text.
 * Returns { input | null, found: [strings], missing: [strings] }.
 */
export function extractFromStory(family, text) {
  const kind = FAMILY_KIND[family]
  const found = []
  const missing = []
  const meta = { title: firstSentence(text) }
  const unit = detectUnit(text)
  if (unit) meta.unit = unit
  let input = null

  if (kind === 'array_search' || kind === 'array_sort') {
    const labeled = parseLabeledNumbers(text)
    const list = parseNumberList(text.replace(new RegExp(`(?:find|search(?: for)?|look(?:ing)? for|locate|target|is)\\s+${NUM}\\s*\\??\\s*$`, 'i'), ''))
    const values = list.length >= 2 ? list : labeled?.values
    if (values && values.length >= 2) {
      input = { values: values.slice(0, 16), meta }
      if (labeled && labeled.values.length === values.length && labeled.values.every((v, i) => v === values[i])) input.itemLabels = labeled.itemLabels.slice(0, 16)
      found.push(`${input.values.length} values`)
    } else missing.push('a list of numbers')
    if (kind === 'array_search') {
      const t = text.match(new RegExp(`(?:find|search(?: for)?|look(?:ing)? for|locate|target(?: is)?|check (?:if|whether))\\s*(?:roll(?: number)?|number|id|value|item|price)?\\s*(?:₹|rs\\.?)?\\s*(${NUM})`, 'i'))
      if (t && input) {
        input.target = Number(t[1])
        found.push(`target ${input.target}`)
      } else if (input) {
        missing.push('the value to search for')
        input = null
      }
    }
  } else if (kind === 'graph') {
    input = graphFrom(text, family)
    if (input) {
      input.meta = meta
      found.push(`${input.nodes.length} places`, `${input.edges.length} links`)
      if (input.source) found.push(`start ${input.source}`)
      if (input.target) found.push(`destination ${input.target}`)
    } else missing.push(family === 'ordering' ? 'prerequisite pairs like "A before B"' : 'links like "Kitchen to Market 4 min"')
  } else if (kind === 'knapsack') {
    const items = parseItems(text)
    const capacity = parseCapacity(text)
    if (items.length && capacity) {
      input = { items: items.slice(0, 8), capacity: Math.min(30, capacity), meta: { ...meta, unit: unit === '₹' ? '₹' : 'kg' } }
      found.push(`${input.items.length} items`, `capacity ${input.capacity}`)
    } else {
      if (!items.length) missing.push('items with weight and value (e.g. "laptop 5 kg value 10")')
      if (!capacity) missing.push('the capacity')
    }
  } else if (kind === 'activities') {
    const acts = parseActivities(text)
    if (acts.length >= 2) {
      input = { activities: acts.slice(0, 12), meta: { ...meta, unit: 'h' } }
      found.push(`${input.activities.length} events`)
    } else missing.push('events with times (e.g. "Quiz 9-10")')
  } else if (kind === 'strings') {
    const s = parseTwoStrings(text)
    if (s) {
      input = { ...s, meta }
      found.push(`"${s.a}" and "${s.b}"`)
    } else missing.push('two sequences in quotes')
  } else if (kind === 'coins') {
    const { coins, amount } = parseCoins(text)
    if (coins.length && amount) {
      input = { coins: coins.slice(0, 6), amount: Math.min(40, amount), meta }
      found.push(`coins ${coins.join(', ')}`, `amount ${amount}`)
    } else {
      if (!coins.length) missing.push('the coin values')
      if (!amount) missing.push('the amount')
    }
  }
  return { input, found, missing }
}

/** Parse the friendly input box in the visualizer, by input kind. */
export function parseFriendly(kind, text, base = {}) {
  if (kind === 'array_sort' || kind === 'array_search') {
    const labeled = /[A-Za-z]/.test(text) ? parseLabeledNumbers(text) : null
    const values = labeled ? labeled.values : parseNumberList(text)
    if (values.length < 2) return { error: 'Type at least two numbers, e.g. "5, 3, 8, 1" or "Asha 72, Ben 45".' }
    const out = { ...base, values }
    delete out.itemLabels
    if (labeled) out.itemLabels = labeled.itemLabels
    return { input: out }
  }
  if (kind === 'graph') {
    const directed = !!base.directed
    const lines = text.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean)
    const edges = []
    for (const l of lines) {
      const m = l.match(new RegExp(`^(.+?)\\s*(?:->|→|-|–|\\bto\\b)\\s*(.+?)(?:\\s+(${NUM}))?$`, 'i'))
      if (!m) return { error: `Could not read "${l}". Use "A - B 4" (one link per line).` }
      const e = { from: m[1].trim(), to: m[2].trim() }
      if (m[3] != null) e.weight = Number(m[3])
      edges.push(e)
    }
    const nodes = [...new Set(edges.flatMap((e) => [e.from, e.to]))]
    const out = { ...base, nodes, edges, directed }
    if (out.source && !nodes.includes(out.source)) out.source = nodes[0]
    if (out.target && !nodes.includes(out.target)) delete out.target
    if ('source' in base || base.source === undefined) out.source = out.source || nodes[0]
    return { input: out }
  }
  return { error: 'Use the JSON editor for this input type.' }
}

/** Inverse of parseFriendly: show the current input as editable text. */
export function toFriendly(kind, input) {
  try {
    if (kind === 'array_sort' || kind === 'array_search') return input.itemLabels ? input.values.map((v, i) => `${input.itemLabels[i]} ${v}`).join(', ') : input.values.join(', ')
    if (kind === 'graph') return input.edges.map((e) => `${e.from} - ${e.to}${e.weight != null ? ` ${e.weight}` : ''}`).join('\n')
  } catch {
    return null
  }
  return null
}
