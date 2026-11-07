// Fact pack + claim checker + rule-based fallback explanation.
// The LLM may only phrase things; every number and complexity it writes is checked here.

import { ALGORITHMS } from '../../shared/registry.js'
import { LEARNING } from '../../shared/learning.js'

export function buildFactPack({ analysis, scoring, evidence, chosenId, profile, input }) {
  const A = ALGORITHMS[chosenId]
  const studied = Object.keys(profile?.studied || {})
  const relatedFrom = Object.entries(A.related || {}).find(([id]) => studied.includes(id))
  return {
    goal: analysis?.summary || '',
    problemType: scoring.family,
    familyLabel: scoring.familyLabel,
    constraints: scoring.constraints,
    constraintsFromData: scoring.fromData,
    assumptions: analysis?.assumptions || [],
    chosen: { id: chosenId, name: A.name, complexity: A.complexity, whenToUse: A.whenToUse, pitfalls: A.pitfalls },
    scoreMatrix: scoring.candidates.map((c) => ({
      name: c.name,
      status: c.status,
      cells: Object.fromEntries(scoring.rows.map((r) => [r.label, `${c.cells[r.id].status}: ${c.cells[r.id].text}`])),
    })),
    evidence: evidence ? { rows: evidence.rows.map(({ name, status, animationSteps, stats, summary, metric, sameAnswerAsFirst, ok, errors }) => ({ name, status, ok, errors, animationSteps, stats, summary, metric, sameAnswerAsFirst })), notes: evidence.notes } : null,
    scenario: { title: input?.meta?.title || '', unit: input?.meta?.unit || '', entities: analysis?.entities || [] },
    relatedNote: relatedFrom ? { studied: ALGORITHMS[relatedFrom[0]].name, note: relatedFrom[1] } : null,
  }
}

/** Find every O(...) expression, handling nested parentheses like O((V + E) log V). */
export function extractBigO(text) {
  const out = []
  for (let i = text.indexOf('O('); i >= 0; i = text.indexOf('O(', i + 1)) {
    let depth = 0
    for (let j = i + 1; j < text.length; j++) {
      if (text[j] === '(') depth++
      else if (text[j] === ')') {
        depth--
        if (depth === 0) {
          out.push(text.slice(i, j + 1))
          break
        }
      }
    }
  }
  return out
}

const normO = (s) => s.replace(/\s+/g, '').replace(/²/g, '^2').replace(/³/g, '^3').replace(/·|\*/g, '').toLowerCase()
const stripCommas = (s) => s.replace(/(\d),(?=\d{3}\b)/g, '$1')
const numbersIn = (s) => (stripCommas(s).match(/-?\d+(\.\d+)?/g) || []).map((x) => String(Number(x)))

export function checkClaims(texts, factPack) {
  const issues = []
  const packStr = JSON.stringify(factPack)
  const allowedNums = new Set([...numbersIn(packStr), ...Array.from({ length: 11 }, (_, i) => String(i))])
  const allowedO = new Set()
  for (const a of [...Object.values(ALGORITHMS).map((x) => x.complexity), ...Object.values(LEARNING).map((x) => x.complexity)]) for (const v of Object.values(a)) extractBigO(v).forEach((o) => allowedO.add(normO(o)))
  for (const t of texts.filter(Boolean)) {
    const bigOs = extractBigO(t)
    for (const o of bigOs) if (!allowedO.has(normO(o))) issues.push(`Complexity "${o}" does not match any complexity in the catalog.`)
    let rest = t
    for (const o of bigOs) rest = rest.replace(o, ' ')
    rest = rest.replace(/log2/gi, 'log')
    for (const n of numbersIn(rest)) if (!allowedNums.has(n)) issues.push(`The number ${n} does not appear in the measured facts.`)
  }
  return { ok: issues.length === 0, issues: [...new Set(issues)] }
}

/** Deterministic explanation used in offline mode or when the LLM's text fails the check. */
export function templateExplanation(factPack) {
  const best = factPack.scoreMatrix.find((c) => c.name === factPack.chosen.name)
  const reasons = Object.values(best?.cells || {})
    .filter((x) => x.startsWith('pass: '))
    .map((x) => x.slice(6).replace(/\.$/, ''))
  const because = `${factPack.chosen.name} fits best for "${factPack.familyLabel.toLowerCase()}"${reasons.length ? `: ${reasons.slice(0, 3).join('; ').toLowerCase()}.` : '.'}`
  const ev = factPack.evidence?.rows?.[0]
  const inYourWords = [
    `${factPack.chosen.whenToUse}`,
    ev?.ok ? `Measured on your data: ${ev.summary}` : '',
    factPack.evidence?.notes?.[0] || '',
  ]
    .filter(Boolean)
    .join(' ')
  return { because, inYourWords, personalNote: factPack.relatedNote ? factPack.relatedNote.note : '' }
}
