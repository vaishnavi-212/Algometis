// The "Solve my problem" agent, built as a graph of stages:
//
//   memory → router ─┬─ off_topic ──────────► refuse → END
//                    ├─ concept_question ───► concept → END
//                    └─ problem → analyzer ─┬─ unknown ────► unmatched → END
//                                           ├─ missing info ► clarify (interrupt: ask student) → analyzer
//                                           └─ ok ─────────► executor (tool loop) → critic ─┬─ ok ──────► explainer → finalize → END
//                                                                     ▲                     ├─ issues ──┘(back to executor, max 2)
//                                                                     └─────────────────────┘ still bad ► repair → explainer

import { StateGraph, START, END, interrupt, MemoryCheckpointer } from './graphEngine.js'
import { T } from './trace.js'
import { runToolLoop } from './toolLoop.js'
import { EXECUTOR_TOOLS, executorHandlers } from './tools.js'
import { ROUTER_SYSTEM, ROUTE_TOOL, ANALYZER_SYSTEM, ANALYZER_TOOL, EXECUTOR_SYSTEM, EXPLAINER_SYSTEM, EXPLAINER_TOOL, CONCEPT_SYSTEM } from './prompts.js'
import { buildFactPack, checkClaims, templateExplanation } from './explain.js'
import { FAMILIES, scoreFamily, familiesOf } from '../../shared/scoring.js'
import { ALGORITHMS } from '../../shared/registry.js'
import { validateFor, buildEvidence } from '../../shared/evidence.js'
import { jsonSafe } from '../../shared/util.js'
import { config } from '../config.js'

const append = (a = [], b = []) => [...a, ...(Array.isArray(b) ? b : [b])]
const v = (def) => ({ default: def })

export const CHANNELS = {
  studentId: v(() => 'anonymous'),
  latest: v(() => ''),
  conversation: { default: () => [], reducer: append },
  trace: { default: () => [], reducer: append },
  profile: v(() => null),
  route: v(() => null),
  analysis: v(() => null),
  clarifyRounds: v(() => 0),
  pendingFields: v(() => []),
  submission: v(() => null),
  executorMessages: v(() => []),
  critique: v(() => null),
  revisions: v(() => 0),
  scoring: v(() => null),
  chosen: v(() => null),
  input: v(() => null),
  inputIsExample: v(() => false),
  evidence: v(() => null),
  explanation: v(() => null),
  response: v(() => null),
}

const studentText = (state) => state.conversation.filter((m) => m.role === 'student').map((m) => m.text).join('\n')
const transcript = (state) => state.conversation.map((m) => `${m.role === 'student' ? 'Student' : 'Assistant asked'}: ${m.text}`).join('\n')

// ---------------------------------------------------------------- nodes
async function memoryNode(state, { store }) {
  const profile = store.getProfile(state.studentId)
  const studied = Object.keys(profile.studied)
  return {
    profile,
    trace: [T.call('memory', 'get_student_profile', { studentId: state.studentId }), T.memory('memory', 'Loaded long-term memory', { studied, recentRecommendations: profile.recommended.slice(0, 3).map((r) => r.algoId), struggles: profile.struggles })],
  }
}

async function routerNode(state, { llm }) {
  const res = await llm.chat({ system: ROUTER_SYSTEM, messages: [{ role: 'user', content: state.latest }], tools: [ROUTE_TOOL], toolChoice: { name: 'route' }, purpose: 'router', hint: { latest: state.latest } })
  const args = res.toolCalls?.[0]?.args
  const route = args && ['problem', 'concept_question', 'off_topic'].includes(args.kind) ? args : { kind: 'problem', reason: 'Router gave no valid classification; defaulting to "problem".' }
  return { route, trace: [T.decision('router', `Classified as: ${route.kind}`, route.reason)] }
}

async function refuseNode() {
  return {
    response: { status: 'refused', message: 'I can only help with data structures and algorithms (DSA / DAA): searching, sorting, graphs, greedy and dynamic programming. Try describing a real-world task, like "fastest delivery route between 5 places" or "order my courses by prerequisites".' },
    trace: [T.decision('refuse', 'Out of scope: politely refused', 'Guardrail: this assistant only covers DSA/DAA topics.')],
  }
}

async function conceptNode(state, { llm }) {
  const lower = state.latest.toLowerCase()
  const hit = Object.entries(ALGORITHMS).find(([id, a]) => lower.includes(a.name.toLowerCase().split(' (')[0].replace(/'s algorithm/, '').toLowerCase()) || lower.includes(id.replace(/_/g, ' ')))
  const res = await llm.chat({ system: CONCEPT_SYSTEM, messages: [{ role: 'user', content: state.latest }], purpose: 'concept', hint: { mentioned: hit ? { id: hit[0], name: hit[1].name, whenToUse: hit[1].whenToUse } : null } })
  return { response: { status: 'answer', message: res.text, suggestAlgorithm: hit ? hit[0] : null }, trace: [T.llm('concept', 'Answered a concept question', res.text)] }
}

function sanitizeAnalysis(args) {
  const out = { problemType: 'unknown', constraints: {}, missing: [], assumptions: [], summary: '', entities: [], namedAlgorithm: null }
  if (!args) return out
  out.summary = String(args.summary || '').slice(0, 300)
  out.assumptions = (args.assumptions || []).map(String).slice(0, 6)
  out.entities = (args.entities || []).map(String).slice(0, 20)
  if (args.namedAlgorithm && ALGORITHMS[args.namedAlgorithm]) out.namedAlgorithm = args.namedAlgorithm
  let fam = FAMILIES[args.problemType] ? args.problemType : null
  if (!fam && out.namedAlgorithm) fam = familiesOf(out.namedAlgorithm)[0]
  if (!fam) return out
  out.problemType = fam
  const fields = FAMILIES[fam].fields
  for (const f of fields) {
    const val = args.constraints?.[f.key]
    if (f.type === 'bool' && typeof val === 'boolean') out.constraints[f.key] = val
    if (f.type === 'number' && typeof val === 'number' && Number.isFinite(val) && val > 0) out.constraints[f.key] = val
  }
  out.missing = (args.missing || []).filter((m) => m && fields.some((f) => f.key === m.field) && out.constraints[m.field] === undefined && m.question).slice(0, 2)
  return out
}

async function analyzerNode(state, { llm }) {
  const res = await llm.chat({
    system: ANALYZER_SYSTEM(),
    messages: [{ role: 'user', content: transcript(state) }],
    tools: [ANALYZER_TOOL],
    toolChoice: { name: 'report_constraints' },
    purpose: 'analyzer',
    hint: { conversationText: studentText(state), pendingFields: state.pendingFields },
  })
  const analysis = sanitizeAnalysis(res.toolCalls?.[0]?.args)
  const trace = [T.llm('analyzer', 'Extracted constraints from the story', { problemType: analysis.problemType, constraints: analysis.constraints, assumptions: analysis.assumptions, summary: analysis.summary })]
  if (analysis.missing.length) trace.push(T.decision('analyzer', `Missing info that would change the answer: ${analysis.missing.map((m) => m.field).join(', ')}`, analysis.missing))
  return { analysis, trace }
}

async function clarifyNode(state) {
  const questions = state.analysis.missing.map((m) => m.question)
  const fields = state.analysis.missing.map((m) => m.field)
  const answer = interrupt({ questions, fields }) // pauses the graph here until the student replies
  return {
    conversation: [
      { role: 'agent', text: questions.join(' ') },
      { role: 'student', text: String(answer) },
    ],
    clarifyRounds: state.clarifyRounds + 1,
    pendingFields: fields,
    trace: [T.interrupt('clarify', 'Paused to ask the student', questions), T.decision('clarify', 'Student answered; re-analyzing', String(answer))],
  }
}

async function unmatchedNode(state) {
  return {
    response: { status: 'unmatched', message: 'I could not match this to a problem type I can visualize yet. Could you say what you want to optimise or find? For example: the shortest route, the best order of tasks, the most events in one room, the most value in a limited bag, or sorting/searching a list.' },
    trace: [T.decision('unmatched', 'No problem type matched', state.analysis?.summary)],
  }
}

function executorBrief(state) {
  const studied = Object.keys(state.profile?.studied || {})
  return [
    `STUDENT'S PROBLEM (conversation):\n${transcript(state)}`,
    `ANALYSIS:\n${JSON.stringify({ problemType: state.analysis.problemType, constraints: state.analysis.constraints, assumptions: state.analysis.assumptions, entities: state.analysis.entities, summary: state.analysis.summary }, null, 1)}`,
    studied.length ? `The student has already studied: ${studied.join(', ')}.` : '',
    'Now follow your plan with the tools.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

async function executorNode(state, { llm }) {
  const sink = {}
  const revising = state.revisions > 0 && state.critique && !state.critique.ok
  const messages = revising
    ? [...state.executorMessages, { role: 'user', content: `CRITIC REJECTED YOUR SUBMISSION:\n- ${state.critique.issues.join('\n- ')}\nFix these issues and call submit_recommendation again.` }]
    : [{ role: 'user', content: executorBrief(state) }]
  const loop = await runToolLoop({
    llm,
    system: EXECUTOR_SYSTEM,
    messages,
    tools: EXECUTOR_TOOLS,
    handlers: executorHandlers(sink, { story: studentText(state) }),
    maxTurns: config.agent.maxExecutorTurns,
    node: 'executor',
    stopTool: 'submit_recommendation',
    purpose: 'executor',
    hint: () => ({ problemType: state.analysis.problemType, constraints: state.analysis.constraints, summary: state.analysis.summary }),
  })
  return {
    submission: sink.submission || null,
    executorMessages: loop.messages,
    trace: [T.decision('executor', revising ? `Revision ${state.revisions}: fixing critic issues` : 'Planning with tools: extract data → search → schema → build input → validate → compare → submit'), ...loop.trace],
  }
}

async function criticNode(state) {
  const sub = state.submission
  const family = state.analysis.problemType
  const issues = []
  const checks = []
  let scoring = null
  if (!sub) issues.push('No recommendation was submitted (call submit_recommendation).')
  else {
    const A = ALGORITHMS[sub.algorithmId]
    if (!A) issues.push(`"${sub.algorithmId}" is not in the catalog.`)
    else {
      if (!FAMILIES[family].candidates.includes(sub.algorithmId)) issues.push(`${A.name} does not solve "${FAMILIES[family].label}". Candidates: ${FAMILIES[family].candidates.join(', ')}.`)
      const val = validateFor(sub.algorithmId, sub.input)
      checks.push(T.check('critic', 'Input passes schema and rules', val.valid ? 'valid' : val.errors, val.valid))
      if (!val.valid) issues.push(`Input is invalid: ${val.errors.join('; ')}`)
      scoring = scoreFamily(family, state.analysis.constraints, val.valid ? val.facts : {})
      if (scoring.conflicts.length) checks.push(T.check('critic', 'Data contradicts what the analysis assumed (data wins)', scoring.conflicts, true))
      const mine = scoring.candidates.find((c) => c.id === sub.algorithmId)
      if (mine?.rejected) issues.push(`${A.name} is rejected by the rules for these constraints: ${mine.rejectReasons.join('; ')}`)
      else if (mine && scoring.best !== sub.algorithmId) issues.push(`The rules rank ${ALGORITHMS[scoring.best].name} above ${A.name} (${scoring.candidates[0].cells.work.text} vs ${mine.cells.work.text}). Choose the best-ranked algorithm.`)
      checks.push(T.check('critic', 'Chosen algorithm is the rule-ranked best', mine ? `${sub.algorithmId}: ${mine.status}` : 'n/a', mine?.status === 'best'))
    }
    const called = new Set(state.executorMessages.filter((m) => m.role === 'tool').map((m) => m.name))
    checks.push(T.check('critic', 'Process: validated before submitting', called.has('validate_input') ? 'yes' : 'no', called.has('validate_input')))
    checks.push(T.check('critic', 'Process: gathered evidence (compare/run)', called.has('compare_algorithms') || called.has('run_algorithm') ? 'yes' : 'no (evidence will be computed by code anyway)', called.has('compare_algorithms') || called.has('run_algorithm')))
  }
  const ok = issues.length === 0
  return {
    critique: { ok, issues },
    scoring: ok ? scoring : state.scoring,
    chosen: ok ? sub.algorithmId : null,
    input: ok ? sub.input : null,
    inputIsExample: ok ? !!sub.inputIsExample : false,
    revisions: ok ? state.revisions : state.revisions + 1,
    trace: [...checks, T.decision('critic', ok ? 'Approved' : `Rejected (${issues.length} issue${issues.length > 1 ? 's' : ''})`, ok ? 'All checks passed.' : issues)],
  }
}

async function repairNode(state) {
  const family = state.analysis.problemType
  const sub = state.submission
  let scoring = scoreFamily(family, state.analysis.constraints, {})
  const best = scoring.best
  let input = sub?.input
  let example = !!sub?.inputIsExample
  const val = best ? validateFor(best, input) : { valid: false }
  if (!val.valid) {
    input = structuredClone(ALGORITHMS[best].sample)
    example = true
  } else scoring = scoreFamily(family, state.analysis.constraints, val.facts)
  return {
    chosen: scoring.best,
    input,
    inputIsExample: example,
    scoring,
    trace: [T.decision('repair', 'Critic still unhappy after max revisions: falling back to the rule-ranked best', { chosen: scoring.best, usedSampleData: example })],
  }
}

async function explainerNode(state, { llm }) {
  const evidence = buildEvidence(state.scoring, state.input, state.chosen)
  const pack = buildFactPack({ analysis: state.analysis, scoring: state.scoring, evidence, chosenId: state.chosen, profile: state.profile, input: state.input })
  const template = templateExplanation(pack)
  const trace = [T.call('explainer', 'compare_algorithms (by code, for the evidence table)', evidence.rows.map((r) => r.algorithmId)), T.result('explainer', 'evidence', evidence.notes)]
  let explanation = null
  let issues = []
  const messages = [{ role: 'user', content: `FACT PACK:\n${JSON.stringify(jsonSafe(pack), null, 1)}` }]
  for (let attempt = 1; attempt <= 2 && !explanation; attempt++) {
    const res = await llm.chat({ system: EXPLAINER_SYSTEM, messages, tools: [EXPLAINER_TOOL], toolChoice: { name: 'write_explanation' }, purpose: 'explainer', hint: { template } })
    const args = res.toolCalls?.[0]?.args
    if (!args?.because) {
      issues = ['No explanation returned']
      trace.push(T.check('explainer', `Attempt ${attempt}: no explanation returned`, null, false))
      continue
    }
    const check = checkClaims([args.because, args.inYourWords, args.personalNote], pack)
    trace.push(T.check('explainer', `Fact-check of explanation (attempt ${attempt})`, check.ok ? 'Every number and complexity matches the facts' : check.issues, check.ok))
    if (check.ok) explanation = { because: args.because, inYourWords: args.inYourWords || '', personalNote: args.personalNote || '', source: llm.isMock || res.isMock ? 'rules' : 'llm', model: res.isMock ? 'offline rules' : res.label ? `${res.label} · ${res.model}` : undefined, attempts: attempt }
    else {
      issues = check.issues
      messages.push({ role: 'assistant', content: '', toolCalls: res.toolCalls }, { role: 'tool', toolCallId: res.toolCalls[0].id, name: 'write_explanation', content: JSON.stringify({ rejected: true, issues: check.issues, instruction: 'Rewrite using only facts from the fact pack.' }) })
    }
  }
  if (!explanation) {
    explanation = { ...template, source: 'rules', attempts: 2, fallbackReason: issues }
    trace.push(T.decision('explainer', 'Used the rule-based explanation (AI text failed the fact-check)', issues))
  }
  return { evidence, explanation, trace }
}

function whyNot(scoring, chosen) {
  const best = scoring.candidates.find((c) => c.id === chosen)
  return scoring.candidates
    .filter((c) => c.id !== chosen)
    .map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      reason: c.rejected ? c.rejectReasons.join(' ') : `Also works, but needs more work for your size (${c.cells.work.text} vs ${best.cells.work.text}).${Object.values(c.cells).filter((x) => x.status === 'warn').map((x) => ` ${x.text}.`).join('')}`,
    }))
}

async function finalizeNode(state, { store }) {
  const A = ALGORITHMS[state.chosen]
  store.recordRecommendation(state.studentId, state.chosen, state.analysis.summary || state.latest)
  const response = {
    status: 'done',
    message: `I recommend **${A.name}**. ${state.explanation.because}`,
    recommendation: jsonSafe({
      algorithmId: state.chosen,
      name: A.name,
      complexity: A.complexity,
      because: state.explanation.because,
      inYourWords: state.explanation.inYourWords,
      personalNote: state.explanation.personalNote,
      explanationSource: state.explanation.source,
      explanationModel: state.explanation.model,
      explanationFallbackReason: state.explanation.fallbackReason || null,
      analysis: { summary: state.analysis.summary, assumptions: state.analysis.assumptions, entities: state.analysis.entities, problemType: state.analysis.problemType },
      constraintFields: FAMILIES[state.analysis.problemType].fields,
      rawConstraints: state.analysis.constraints,
      scoring: state.scoring,
      evidence: state.evidence,
      whyNot: whyNot(state.scoring, state.chosen),
      input: state.input,
      inputIsExample: state.inputIsExample,
      critic: { ok: state.critique?.ok ?? false, revisions: state.revisions, repaired: !state.critique?.ok },
    }),
  }
  return { response, trace: [T.memory('finalize', 'Saved recommendation to long-term memory', { algoId: state.chosen })] }
}

// ---------------------------------------------------------------- wiring
export function buildSolveGraph({ checkpointer = new MemoryCheckpointer() } = {}) {
  const g = new StateGraph(CHANNELS)
  g.addNode('memory', memoryNode)
    .addNode('router', routerNode)
    .addNode('refuse', refuseNode)
    .addNode('concept', conceptNode)
    .addNode('analyzer', analyzerNode)
    .addNode('clarify', clarifyNode)
    .addNode('unmatched', unmatchedNode)
    .addNode('executor', executorNode)
    .addNode('critic', criticNode)
    .addNode('repair', repairNode)
    .addNode('explainer', explainerNode)
    .addNode('finalize', finalizeNode)
  g.addEdge(START, 'memory')
  g.addEdge('memory', 'router')
  g.addConditionalEdges('router', (s) => ({ problem: 'analyzer', concept_question: 'concept', off_topic: 'refuse' })[s.route.kind])
  g.addEdge('refuse', END)
  g.addEdge('concept', END)
  g.addConditionalEdges('analyzer', (s) => {
    if (s.analysis.problemType === 'unknown') return 'unmatched'
    if (s.analysis.missing.length && s.clarifyRounds < config.agent.maxClarifyRounds) return 'clarify'
    return 'executor'
  })
  g.addEdge('unmatched', END)
  g.addEdge('clarify', 'analyzer')
  g.addEdge('executor', 'critic')
  g.addConditionalEdges('critic', (s) => (s.critique.ok ? 'explainer' : s.revisions <= config.agent.maxRevisions ? 'executor' : 'repair'))
  g.addEdge('repair', 'explainer')
  g.addEdge('explainer', 'finalize')
  g.addEdge('finalize', END)
  return g.compile({ checkpointer })
}

/** Fresh-run input (resets per-run fields). */
export function freshInput(studentId, message) {
  return {
    studentId,
    latest: message,
    conversation: [{ role: 'student', text: message }],
    route: null,
    analysis: null,
    clarifyRounds: 0,
    pendingFields: [],
    submission: null,
    executorMessages: [],
    critique: null,
    revisions: 0,
    scoring: null,
    chosen: null,
    input: null,
    inputIsExample: false,
    evidence: null,
    explanation: null,
    response: null,
  }
}
