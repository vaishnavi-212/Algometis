// Runs algorithms for real on the student's data and summarises the measurements.
// This is the "proof on your data" part of every recommendation.

import { ALGORITHMS } from './registry.js'
import { GENERATORS } from './algorithms/index.js'
import { validateInput } from './schemas.js'
import { deepEqual, jsonSafe } from './util.js'

export function validateFor(algoId, input) {
  const A = ALGORITHMS[algoId]
  if (!A) return { valid: false, errors: [`Unknown algorithm "${algoId}"`], warnings: [], facts: {} }
  return validateInput(A.inputKind, input, A.rules)
}

/** Validate + run. Returns steps too (callers that send results over the wire should drop them). */
export function runAlgorithm(algoId, input) {
  const v = validateFor(algoId, input)
  if (!v.valid) return { ok: false, algoId, errors: v.errors, warnings: v.warnings }
  const out = GENERATORS[algoId].run(structuredClone(input))
  return { ok: true, algoId, steps: out.steps, result: out.result, warnings: v.warnings, facts: v.facts }
}

export function summarizeRun(run) {
  if (!run.ok) return { algorithmId: run.algoId, ok: false, errors: run.errors }
  return jsonSafe({
    algorithmId: run.algoId,
    name: ALGORITHMS[run.algoId].name,
    ok: true,
    animationSteps: run.steps.length,
    stats: run.result.stats,
    summary: run.result.summary,
    metric: run.result.metric,
    answer: run.result.answer,
  })
}

export function compareAlgorithms(algoIds, input) {
  const runs = algoIds.map((id) => runAlgorithm(id, input))
  const okRuns = runs.filter((r) => r.ok)
  const first = okRuns[0]
  const rows = runs.map((r) => ({ ...summarizeRun(r), sameAnswerAsFirst: r.ok && first ? deepEqual(r.result.compare, first.result.compare) : null }))
  return { input: jsonSafe(input), rows }
}

/**
 * Evidence for the recommendation card: the chosen algorithm, the best alternative, and
 * (when it can run on this data) one rejected option, to show concretely why it loses.
 */
export function buildEvidence(scoring, input, chosenId) {
  const chosen = chosenId || scoring.best
  if (!chosen) return null
  const viable = scoring.candidates.filter((c) => !c.rejected && c.id !== chosen).map((c) => c.id)
  const rejected = scoring.candidates.filter((c) => c.rejected && c.id !== chosen).map((c) => c.id)
  const ids = [chosen]
  if (viable[0]) ids.push(viable[0])
  const runnableRejected = rejected.find((id) => validateFor(id, input).valid)
  if (runnableRejected) ids.push(runnableRejected)
  const cmp = compareAlgorithms(ids, input)
  const statusOf = Object.fromEntries(scoring.candidates.map((c) => [c.id, c.status]))
  cmp.rows.forEach((r) => (r.status = r.algorithmId === chosen ? 'chosen' : statusOf[r.algorithmId]))
  const notes = []
  const base = cmp.rows[0]
  for (const r of cmp.rows.slice(1)) {
    if (!r.ok) continue
    if (r.sameAnswerAsFirst) {
      notes.push(`${r.name} reaches the same answer in ${r.animationSteps} steps vs ${base.animationSteps} for ${base.name}.`)
    } else {
      const m = r.metric && base.metric ? ` (${r.metric.label}: ${r.metric.value} vs ${base.metric.value})` : ''
      notes.push(`${r.name} gives a different answer on your data${m}: ${r.summary}`)
    }
  }
  return { ...cmp, notes }
}
