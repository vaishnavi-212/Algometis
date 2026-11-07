// The tutor agent inside the visualizer. It can read any step, find steps, move the
// visualizer, and re-run the algorithm on modified data. Its actions are returned to the
// browser, which applies them (jump to step / load new input).

import { runToolLoop } from './toolLoop.js'
import { TUTOR_SYSTEM } from './prompts.js'
import { ALGORITHMS } from '../../shared/registry.js'
import { GENERATORS } from '../../shared/algorithms/index.js'
import { runAlgorithm, summarizeRun } from '../../shared/evidence.js'
import { jsonSafe } from '../../shared/util.js'
import { config } from '../config.js'
import { T } from './trace.js'
import { readInput } from './tools.js'

const TOOLS = [
  { name: 'get_step', description: 'Read one step: message, why, code line, and exact variable values.', parameters: { type: 'object', required: ['index'], properties: { index: { type: 'integer', description: '0-based step index' } } } },
  {
    name: 'find_steps',
    description: 'Find steps by code line key and/or text in the step message. Returns up to 15 matches.',
    parameters: { type: 'object', properties: { lineKey: { type: 'string' }, textContains: { type: 'string' } } },
  },
  { name: 'jump_to_step', description: 'Move the student’s visualizer to a step.', parameters: { type: 'object', required: ['index'], properties: { index: { type: 'integer' } } } },
  { name: 'run_with_custom_input', description: 'Validate and run the algorithm on a different input (same JSON format as the current one); the visualizer will load it.', parameters: { type: 'object', required: ['inputJson'], properties: { inputJson: { type: 'string', description: 'New input as a JSON string' } } } },
  { name: 'get_algorithm_info', description: 'Complexity, when to use, pitfalls.', parameters: { type: 'object', properties: { topic: { type: 'string', description: 'Optional: what you want to know' } } } },
]

export async function runTutor({ llm, store, studentId, algoId, input, stepIndex, question, history = [] }) {
  const A = ALGORITHMS[algoId]
  if (!A) return { error: `Unknown algorithm ${algoId}` }
  const run = runAlgorithm(algoId, input)
  if (!run.ok) return { error: `Current input is invalid: ${run.errors.join('; ')}` }
  const steps = run.steps
  const code = GENERATORS[algoId].code.javascript
  const idx = Math.max(0, Math.min(steps.length - 1, Number(stepIndex) || 0))
  const actions = []
  const describe = (i) => {
    const s = steps[i]
    return jsonSafe({ index: i, of: steps.length, lineKey: s.line, lineNumber: code.lines[s.line], codeLine: code.code.split('\n')[code.lines[s.line] - 1]?.trim(), message: s.message, why: s.why, vars: s.vars })
  }
  const handlers = {
    get_step: ({ index }) => (index >= 0 && index < steps.length ? describe(index) : { error: `index must be 0..${steps.length - 1}` }),
    find_steps: ({ lineKey, textContains }) => {
      const t = (textContains || '').toLowerCase()
      const hits = steps
        .map((s, i) => ({ i, s }))
        .filter(({ s }) => (!lineKey || s.line === lineKey) && (!t || s.message.toLowerCase().includes(t)))
        .slice(0, 15)
        .map(({ i, s }) => ({ index: i, lineKey: s.line, message: s.message }))
      return { matches: hits, total: hits.length }
    },
    jump_to_step: ({ index }) => {
      if (!(index >= 0 && index < steps.length)) return { error: `index must be 0..${steps.length - 1}` }
      actions.push({ type: 'jump', index })
      return { ok: true, index, step: describe(index) }
    },
    run_with_custom_input: (args) => {
      const { input: newInput, error } = readInput(args)
      if (error) return { error }
      const r = runAlgorithm(algoId, newInput)
      if (r.ok) actions.push({ type: 'load_input', input: newInput })
      return summarizeRun(r)
    },
    get_algorithm_info: () => ({ name: A.name, complexity: A.complexity, whenToUse: A.whenToUse, pitfalls: A.pitfalls }),
  }
  const messages = [{ role: 'user', content: `Current input (JSON): ${JSON.stringify(input)}` }, { role: 'assistant', content: 'Got it.' }, ...history.slice(-6).map((h) => ({ role: h.role === 'tutor' ? 'assistant' : 'user', content: String(h.text).slice(0, 2000) })), { role: 'user', content: `${question}\n\n(Current step ${idx + 1}: ${steps[idx].message})` }]
  const loop = await runToolLoop({
    llm,
    system: TUTOR_SYSTEM({ name: A.name, code: code.code, lines: code.lines, stepIndex: idx, total: steps.length, complexity: A.complexity.time }),
    messages,
    tools: TOOLS,
    handlers,
    maxTurns: config.agent.maxTutorTurns,
    node: 'tutor',
    purpose: 'tutor',
    hint: () => ({ question, stepIndex: idx, inputKind: A.inputKind, input }),
  })
  store.recordTutorQuestion(studentId, algoId)
  const answer = loop.finalText || 'I looked at the steps but could not finish an answer. Try asking about a specific step.'
  return { answer, actions, trace: [...loop.trace, T.memory('tutor', 'Logged question in your profile', { algoId })] }
}
