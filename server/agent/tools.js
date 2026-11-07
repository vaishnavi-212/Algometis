// Tools the solve-agent can call. The LLM decides WHEN to call them; our code decides
// WHAT they return. This is how the agent stays grounded in real, checkable facts.

import { ALGORITHMS } from '../../shared/registry.js'
import { FAMILIES, scoreFamily } from '../../shared/scoring.js'
import { INPUT_KINDS, deriveFacts } from '../../shared/schemas.js'
import { extractFromStory, FAMILY_KIND } from '../../shared/storyParser.js'
import { validateFor, runAlgorithm, summarizeRun, compareAlgorithms } from '../../shared/evidence.js'

const familyIds = Object.keys(FAMILIES)
const algoIds = Object.keys(ALGORITHMS)

// Inputs travel as JSON strings: every provider (incl. Gemini, which rejects untyped
// "object" parameters) accepts a plain string. Plain objects are accepted too.
const INPUT_PARAM = { type: 'string', description: 'The input as a JSON string, exactly matching the schema from get_input_schema.' }
export function readInput(args) {
  if (args.input && typeof args.input === 'object') return { input: args.input }
  const raw = args.inputJson ?? args.input
  if (typeof raw !== 'string') return { error: 'Missing inputJson (a JSON string).' }
  try {
    return { input: JSON.parse(raw) }
  } catch (e) {
    return { error: `inputJson is not valid JSON: ${e.message}` }
  }
}
const CONSTRAINT_PROPS = Object.fromEntries(Object.values(FAMILIES).flatMap((f) => f.fields.map((x) => [x.key, { type: x.type === 'bool' ? 'boolean' : 'number', description: x.label }])))

const ruleText = (r = {}) =>
  [
    r.sorted && 'values must be sorted ascending',
    r.needsSource && 'needs "source"',
    r.noNegative && 'no negative weights',
    r.negativeNeedsDirected && 'negative weights only on directed graphs',
    r.directed === true && 'graph must be directed',
    r.directed === false && 'graph must be undirected',
    r.connected && 'graph must be connected',
    r.maxNodes && `at most ${r.maxNodes} nodes`,
    r.weighted && 'every edge should have a weight',
  ].filter(Boolean)

export const EXECUTOR_TOOLS = [
  {
    name: 'extract_data_from_story',
    description: 'Run the deterministic story parser on the student’s text. Returns a draft input built from the names and numbers they actually wrote (links like "A to B 4", number lists, items with weight/value, time slots, coins), plus what is missing. Call this first.',
    parameters: { type: 'object', required: ['problemType'], properties: { problemType: { type: 'string', enum: familyIds } } },
  },
  {
    name: 'search_catalog',
    description: 'Score every algorithm in the catalog for a problem type and constraints. Returns a ranking computed by deterministic rules (best / viable / rejected, with reasons). Pass inputJson too if you have data: facts measured from the data (sorted? negative weights? …) override guesses.',
    parameters: {
      type: 'object',
      required: ['problemType', 'constraints'],
      properties: {
        problemType: { type: 'string', enum: familyIds },
        constraints: { type: 'object', description: 'Constraint values from the analysis.', properties: CONSTRAINT_PROPS },
        inputJson: { type: 'string', description: 'Optional: the draft input as a JSON string, so facts from the data are used.' },
      },
    },
  },
  {
    name: 'get_input_schema',
    description: 'Get the exact JSON input format, size limits, rules and an example for one algorithm.',
    parameters: { type: 'object', required: ['algorithmId'], properties: { algorithmId: { type: 'string', enum: algoIds } } },
  },
  {
    name: 'validate_input',
    description: 'Check an input against the algorithm’s schema and rules. Returns errors to fix, warnings, and facts derived from the data (e.g. sorted, negative weights).',
    parameters: { type: 'object', required: ['algorithmId', 'inputJson'], properties: { algorithmId: { type: 'string', enum: algoIds }, inputJson: INPUT_PARAM } },
  },
  {
    name: 'run_algorithm',
    description: 'Actually run one algorithm on an input and get its result and work counters.',
    parameters: { type: 'object', required: ['algorithmId', 'inputJson'], properties: { algorithmId: { type: 'string', enum: algoIds }, inputJson: INPUT_PARAM } },
  },
  {
    name: 'compare_algorithms',
    description: 'Run 2–3 algorithms on the same input and compare answers and work done. Use it to produce evidence for your recommendation.',
    parameters: {
      type: 'object',
      required: ['algorithmIds', 'inputJson'],
      properties: { algorithmIds: { type: 'array', items: { type: 'string', enum: algoIds }, description: '1 to 3 algorithm ids' }, inputJson: INPUT_PARAM },
    },
  },
  {
    name: 'submit_recommendation',
    description: 'Finish: submit the chosen algorithm and the validated input built from the student’s scenario. A critic will check it.',
    parameters: {
      type: 'object',
      required: ['algorithmId', 'inputJson'],
      properties: {
        algorithmId: { type: 'string', enum: algoIds },
        inputJson: INPUT_PARAM,
        inputIsExample: { type: 'boolean', description: 'true if you invented example numbers because the student gave none' },
        alternatives: { type: 'array', items: { type: 'string', enum: algoIds } },
      },
    },
  },
]

/** Handlers bound to one run. `sink` collects the submission. */
export function executorHandlers(sink, { story = '' } = {}) {
  return {
    extract_data_from_story({ problemType }) {
      if (!FAMILIES[problemType]) return { error: `Unknown problemType "${problemType}"` }
      const r = extractFromStory(problemType, story)
      return {
        complete: !!r.input,
        draftInput: r.input,
        found: r.found,
        missing: r.missing,
        factsFromData: r.input ? deriveFacts(FAMILY_KIND[problemType], r.input) : {},
        note: r.input ? 'Draft built only from what the student wrote. Check it, fix names if needed, and keep their numbers.' : 'The story does not contain enough data. Build small realistic example values and mark inputIsExample=true.',
      }
    },
    search_catalog(args) {
      const { problemType, constraints } = args
      if (!FAMILIES[problemType]) return { error: `Unknown problemType "${problemType}". Valid: ${familyIds.join(', ')}` }
      let facts = {}
      if (args.inputJson || (args.input && typeof args.input === 'object')) {
        const { input } = readInput(args)
        if (input) facts = deriveFacts(FAMILY_KIND[problemType], input)
      }
      const s = scoreFamily(problemType, constraints || {}, facts)
      return {
        problemType,
        familyLabel: s.familyLabel,
        constraintsUsed: s.constraints,
        factsFromData: s.fromData,
        rankingRule: s.rankingRule,
        best: s.best,
        ranking: s.candidates.map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          complexity: c.complexity.time,
          estimatedWork: c.cells.work.text,
          rejectReasons: c.rejectReasons,
          warnings: Object.values(c.cells).filter((x) => x.status === 'warn').map((x) => x.text),
        })),
      }
    },
    get_input_schema({ algorithmId }) {
      const A = ALGORITHMS[algorithmId]
      if (!A) return { error: `Unknown algorithm "${algorithmId}"` }
      const K = INPUT_KINDS[A.inputKind]
      return { algorithmId, inputKind: A.inputKind, description: K.label, schema: K.schema, limits: K.limits, rules: ruleText(A.rules), example: A.sample }
    },
    validate_input(args) {
      const { input, error } = readInput(args)
      if (error) return { valid: false, errors: [error] }
      const v = validateFor(args.algorithmId, input)
      return { valid: v.valid, errors: v.errors, warnings: v.warnings, factsFromData: v.facts }
    },
    run_algorithm(args) {
      const { input, error } = readInput(args)
      if (error) return { error }
      return summarizeRun(runAlgorithm(args.algorithmId, input))
    },
    compare_algorithms(args) {
      const { input, error } = readInput(args)
      if (error) return { error }
      return compareAlgorithms((args.algorithmIds || []).slice(0, 3), input)
    },
    submit_recommendation(args) {
      const { input, error } = readInput(args)
      if (error) return { error }
      const v = validateFor(args.algorithmId, input)
      sink.submission = { algorithmId: args.algorithmId, input, inputIsExample: !!args.inputIsExample, alternatives: args.alternatives || [], validAtSubmit: v.valid }
      sink.submissions = (sink.submissions || 0) + 1
      return v.valid ? { received: true, note: 'Submitted. A critic will now check it against the rules.' } : { received: true, warning: `Input is invalid: ${v.errors.join('; ')}. The critic will reject this.` }
    },
  }
}
