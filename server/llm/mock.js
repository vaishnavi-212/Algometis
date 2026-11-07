// Offline demo "LLM". It is NOT AI: it is a small rule-based stand-in that speaks the same
// tool-calling protocol as a real model, so the whole agent graph (router → analyzer →
// clarify → executor tool loop → critic → explainer) runs end-to-end without an API key.
// It understands far fewer phrasings than a real LLM and uses sample data instead of
// building data from your story. Set LLM_PROVIDER + LLM_API_KEY for the real thing.

import { extractFromStory } from '../../shared/storyParser.js'

const FAMILY_PATTERNS = [
  ['ordering', /prerequisite|depends on|dependenc|before (you|we|i) can|order (of|my|the|these|our)? ?(tasks|courses|subjects|steps|modules|chapters)|course order|build order|schedule tasks with|\bbefore\b[^.]*\bbefore\b|\bneeds\b[^.]*\band\b[^.]*\bbefore\b/],
  ['mst', /connect (all|every|each)|minimum (total )?(cable|wire|pipe|cost to connect)|cable|wiring|pipeline network|lay (roads|pipes)|spanning|link all/],
  ['shortest_path', /shortest|fastest|quickest|cheapest (route|path|way)|route|path from|distance from|navigation|travel time|minimum time to reach/],
  ['traversal', /reachable|can .* reach|spread|explore|maze|connected to|friends of friends|degrees of separation|visit every|crawl/],
  ['knapsack', /knapsack|bag|backpack|capacity|budget|truck|carry|pack .* (value|worth)|maximi[sz]e (value|profit)/],
  ['scheduling', /schedul|meeting|events?|seminar|hall|booking|non-?overlapping|time ?slots?|activities/],
  ['sequence_similarity', /similar|common (part|subsequence)|plagiari|dna|\bdiff\b|diff tool|compare (two )?(strings|texts|sequences)|matching characters/],
  ['coin_change', /coins?|tokens?|denomination|change (for|of)|currency notes|make (an )?amount/],
  ['sort', /\bsort|rank|leaderboard|arrange|order (them|by|students|items)|ascending|descending/],
  ['search', /search|find|look ?up|locate|check if .* (exists|present)|is .* in the list/],
]

export function guessFamily(text) {
  const t = text.toLowerCase()
  for (const [fam, re] of FAMILY_PATTERNS) if (re.test(t)) return fam
  return null
}

const DSA_TERMS = /algorithm|bfs|dfs|dijkstra|bellman|floyd|prim|kruskal|sort|search|graph|tree|heap|stack|queue|dynamic programming|\bdp\b|greedy|complexity|big ?o|recursion|knapsack|lcs|hash/

function yesNo(text) {
  const t = text.toLowerCase()
  if (/\b(no|not|never|can't|cannot|don't|doesn't|whole|all or nothing|same|equal|hops?)\b/.test(t)) return false
  if (/\b(yes|yeah|yep|sure|they do|can|different|vary|split|partial|negative)\b/.test(t)) return true
  return null
}

function analyze(conversationText, pending = []) {
  const t = conversationText.toLowerCase()
  const family = guessFamily(t)
  const parsed = family ? extractFromStory(family, conversationText) : { input: null }
  const hasWeights = parsed.input?.edges?.some((e) => e.weight != null)
  const constraints = {}
  const missing = []
  const assumptions = []
  const lastAnswer = conversationText.split('\n').filter(Boolean).at(-1) || ''
  const sizeMatch = t.match(/\b(\d{2,7})\s+(students|places|cities|stops|hostels|items|records|users|nodes|tasks|courses|events|people|houses|towns|villages|employees|products)\b/)
  if (sizeMatch) constraints.size = Number(sizeMatch[1])
  if (family === 'shortest_path') {
    const weightWords = /minute|min\b|km|kilomet|time|cost|distance|price|fare|₹|rs\b|hours?/.test(t)
    const hopWords = /stops|hops|steps|transfers|introductions/.test(t)
    if (pending.includes('weighted')) constraints.weighted = yesNo(lastAnswer) ?? true
    else if (hasWeights || weightWords) constraints.weighted = true
    else if (hopWords) constraints.weighted = false
    else missing.push({ field: 'weighted', question: 'Do the links have different costs (like travel time or distance), or does every hop count the same?' })
    if (/negative|cashback|refund|discount|earn/.test(t)) constraints.negativeWeights = true
    if (/every pair|all pairs|between (all|every|any two)|distance table/.test(t)) constraints.allPairs = true
  }
  if (family === 'traversal') constraints.needShortestHops = /fewest|minimum (number of )?(steps|hops)|shortest|degrees/.test(t)
  if (family === 'knapsack') {
    if (pending.includes('itemsDivisible')) constraints.itemsDivisible = yesNo(lastAnswer) ?? false
    else if (/whole|all or nothing|can'?t be split|cannot be split|can'?t split|cannot split|not be split|no splitting|indivisible|can'?t be divided|cannot be divided/.test(t)) constraints.itemsDivisible = false
    else if (/split|fraction|partial|liquid|grain|kg of|litre|sand/.test(t)) constraints.itemsDivisible = true
    else missing.push({ field: 'itemsDivisible', question: 'Can an item be partly taken (like 2 kg out of 5 kg of rice), or is each item all-or-nothing?' })
  }
  if (family === 'sort') {
    if (/stable|same order|ties|equal/.test(t)) constraints.needStable = true
    if (/nearly|almost|mostly sorted|few new/.test(t)) constraints.nearlySorted = true
    if (/memory|ram|in place|in-place/.test(t)) constraints.memoryLimited = true
  }
  if (family === 'search' && /many times|repeatedly|again and again|thousands of (searches|queries)|every day/.test(t)) constraints.manyQueries = true
  if (family === 'scheduling' && /priority|important|weight|value/.test(t)) constraints.weightedPriorities = true
  if (!constraints.size) assumptions.push('No real-world size given; using a typical size for this kind of problem.')
  return { problemType: family, constraints, missing, assumptions, summary: conversationText.split('\n')[0].slice(0, 300), entities: [] }
}

const lastUserIndex = (messages) => {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') return i
  return -1
}

function executorStep(messages, hint) {
  const since = messages.slice(lastUserIndex(messages) + 1)
  const results = Object.fromEntries(since.filter((m) => m.role === 'tool').map((m) => [m.name, JSON.parse(m.content)]))
  const call = (name, args) => ({ text: '', toolCalls: [{ id: `mock_${name}_${since.length}`, name, args }] })
  // the inputJson used in the most recent validate_input call
  const lastValidateArgs = since.filter((m) => m.role === 'assistant').flatMap((m) => m.toolCalls || []).filter((t) => t.name === 'validate_input').at(-1)?.args

  if (!results.extract_data_from_story) return call('extract_data_from_story', { problemType: hint.problemType })
  const draft = results.extract_data_from_story.draftInput
  if (!results.search_catalog) return call('search_catalog', { problemType: hint.problemType, constraints: hint.constraints, ...(draft ? { inputJson: JSON.stringify(draft) } : {}) })
  const best = results.search_catalog.best
  if (!best) return { text: 'No suitable algorithm in the catalog.', toolCalls: [] }
  if (!results.get_input_schema) return call('get_input_schema', { algorithmId: best })
  const example = () => {
    const ex = structuredClone(results.get_input_schema.example)
    ex.meta = { ...(ex.meta || {}), title: hint.summary || ex.meta?.title, note: 'Example values: your message did not contain usable numbers. Edit them to match your case.' }
    return JSON.stringify(ex)
  }
  if (!results.validate_input) return call('validate_input', { algorithmId: best, inputJson: draft ? JSON.stringify(draft) : example() })
  if (!results.validate_input.valid) {
    if (lastValidateArgs.inputJson !== example()) return { text: `My parsed data fails validation (${results.validate_input.errors[0]}); I will use example values instead.`, toolCalls: [{ id: `mock_validate2_${since.length}`, name: 'validate_input', args: { algorithmId: best, inputJson: example() } }] }
    return { text: 'Even the example input failed validation.', toolCalls: [] }
  }
  const inputJson = lastValidateArgs.inputJson
  const isExample = !draft || inputJson !== JSON.stringify(draft)
  const alt = (results.search_catalog.ranking || []).find((r) => r.id !== best && r.status !== 'rejected')
  if (!results.compare_algorithms) return call('compare_algorithms', { algorithmIds: alt ? [best, alt.id] : [best], inputJson })
  return call('submit_recommendation', { algorithmId: best, inputJson, inputIsExample: isExample, alternatives: alt ? [alt.id] : [] })
}

function tutorStep(messages, hint) {
  const since = messages.slice(lastUserIndex(messages) + 1)
  const results = Object.fromEntries(since.filter((m) => m.role === 'tool').map((m) => [m.name, JSON.parse(m.content)]))
  const q = (hint.question || '').toLowerCase()
  const call = (name, args) => ({ text: '', toolCalls: [{ id: `mock_${name}_${since.length}`, name, args }] })
  const stepMatch = q.match(/step\s*(\d+)/)
  if (stepMatch && !results.jump_to_step) return call('jump_to_step', { index: Number(stepMatch[1]) - 1 })
  if (hint.inputKind?.startsWith('array') && /what if|sorted|reverse|already/.test(q) && !results.run_with_custom_input) {
    const vals = [...hint.input.values].sort((a, b) => a - b)
    if (/reverse|descending/.test(q)) vals.reverse()
    return call('run_with_custom_input', { inputJson: JSON.stringify({ ...hint.input, values: vals, itemLabels: undefined }) })
  }
  if (!results.get_step) return call('get_step', { index: stepMatch ? Number(stepMatch[1]) - 1 : hint.stepIndex })
  const s = results.get_step
  let text = `At step ${s.index + 1} (line ${s.lineNumber}): ${s.message}\n\nWhy: ${s.why}`
  const vars = Object.entries(s.vars || {}).map(([k, v]) => `${k} = ${v}`).join(', ')
  if (vars) text += `\n\nVariables right now: ${vars}.`
  if (results.run_with_custom_input) {
    const r = results.run_with_custom_input
    text = r.ok ? `I re-ran it on your modified data: ${r.summary} It took ${r.animationSteps} animation steps (stats: ${JSON.stringify(r.stats)}). The visualizer now shows that run.` : `That input is not valid: ${r.errors.join('; ')}`
  }
  if (results.jump_to_step) text = `Jumped to step ${results.jump_to_step.index + 1}. ` + text
  return { text: text + '\n\n(Offline demo tutor: answers are built from the step data. Connect an LLM for free-form explanations.)', toolCalls: [] }
}

export function createMock() {
  return {
    label: 'Offline demo mode',
    model: 'rule-based-demo',
    async chat({ messages, tools = [], purpose, hint = {} }) {
      const userText = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n')
      const call = (name, args) => ({ text: '', toolCalls: [{ id: `mock_${name}`, name, args }] })
      switch (purpose) {
        case 'router': {
          const t = (hint.latest || userText).toLowerCase()
          if (guessFamily(t)) return call('route', { kind: 'problem', reason: 'Describes a task that matches a problem pattern in the catalog.' })
          if (DSA_TERMS.test(t)) return call('route', { kind: 'concept_question', reason: 'Asks about an algorithms concept.' })
          return call('route', { kind: 'off_topic', reason: 'Not about data structures or algorithms.' })
        }
        case 'analyzer':
          return call('report_constraints', analyze(hint.conversationText || userText, hint.pendingFields || []))
        case 'executor':
          return executorStep(messages, hint)
        case 'explainer':
          return call('write_explanation', hint.template)
        case 'concept':
          return { text: `Good question. In offline demo mode I can't answer free-form questions, but you can open **Learn** to step through any algorithm with its code and a "why" for every step. ${hint.mentioned ? `For ${hint.mentioned.name}: ${hint.mentioned.whenToUse}` : ''}`, toolCalls: [] }
        case 'tutor':
          return tutorStep(messages, hint)
        default:
          return { text: 'OK.', toolCalls: [] }
      }
    },
  }
}
