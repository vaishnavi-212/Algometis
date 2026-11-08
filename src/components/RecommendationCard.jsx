import React, { useEffect, useRef, useState } from 'react'
import { api, setHandoff } from '../api.js'
import { ALGORITHMS } from '../../shared/registry.js'
import { validateFor } from '../../shared/evidence.js'
import { TracePanel } from './TracePanel.jsx'

const MARK = { pass: '✓', fail: '✗', warn: '!', info: '·' }

export function ScoreMatrix({ scoring, chosen }) {
  return (
    <div className="scroll-x">
      <table className="matrix">
        <thead>
          <tr>
            <th className="rowh">Criterion</th>
            {scoring.candidates.map((c) => (
              <th key={c.id}>
                {c.name}
                <div>
                  <span className={`chip ${c.id === chosen ? 'ok' : c.status === 'rejected' ? 'bad' : ''}`}>{c.id === chosen ? 'best fit' : c.status}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scoring.rows.map((r) => (
            <tr key={r.id}>
              <th className="rowh">{r.label}</th>
              {scoring.candidates.map((c) => {
                const cell = c.cells[r.id]
                return (
                  <td key={c.id} className={c.id === chosen ? 'best' : ''}>
                    <div className="cell">
                      <span className={`mark ${cell.status}`}>{MARK[cell.status]}</span>
                      <span>{cell.text}</span>
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tiny muted">Rule: {scoring.rankingRule} This table is computed by code, not AI, so the same constraints always give the same result.</p>
    </div>
  )
}

export function EvidenceTable({ evidence }) {
  if (!evidence) return <p className="muted">No measurements for this combination yet.</p>
  return (
    <div className="stack">
      <div className="scroll-x">
        <table className="matrix">
          <thead>
            <tr>
              <th>Algorithm</th>
              <th>Role</th>
              <th>Answer on your data</th>
              <th>Animation steps</th>
              <th>Work counters</th>
              <th>Same answer as #1?</th>
            </tr>
          </thead>
          <tbody>
            {evidence.rows.map((r) => (
              <tr key={r.algorithmId}>
                <td>
                  <strong>{r.name || r.algorithmId}</strong>
                </td>
                <td>
                  <span className={`chip ${r.status === 'chosen' ? 'ok' : r.status === 'rejected' ? 'bad' : ''}`}>{r.status}</span>
                </td>
                <td>{r.ok ? r.summary : <span className="err">{r.errors?.join('; ')}</span>}</td>
                <td className="mono">{r.animationSteps ?? '–'}</td>
                <td className="mono tiny">{r.stats ? Object.entries(r.stats).map(([k, v]) => `${k}: ${v}`).join(', ') : '–'}</td>
                <td>{r.sameAnswerAsFirst == null ? '–' : r.sameAnswerAsFirst ? <span className="chip ok">yes</span> : <span className="chip bad">no</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {evidence.notes?.map((n) => (
        <div key={n} className="banner info">
          {n}
        </div>
      ))}
    </div>
  )
}

function ConstraintEditor({ fields, values, fromData, whatIf, onChange, onWhatIf, conflicts }) {
  return (
    <div className="stack">
      <div className="fields">
        {fields.map((f) => {
          const locked = f.fact && fromData.includes(f.key) && !whatIf
          return (
            <div key={f.key} className="field">
              <label htmlFor={`f-${f.key}`}>
                {f.label}
                {locked && <span className="chip cyan" style={{ marginLeft: 8 }}>from your data</span>}
                {!f.fact && fromData.includes(f.key) && <span className="chip" style={{ marginLeft: 8 }}>taken from the demo data: type your real size</span>}
              </label>
              {f.type === 'bool' ? (
                <button id={`f-${f.key}`} className={`toggle ${values[f.key] ? 'on' : ''}`} disabled={locked} onClick={() => onChange(f.key, !values[f.key])} aria-pressed={!!values[f.key]} aria-label={f.label} />
              ) : (
                <input className="text" id={`f-${f.key}`} type="number" min="1" value={values[f.key] ?? ''} onChange={(e) => onChange(f.key, e.target.value === '' ? undefined : Number(e.target.value))} />
              )}
            </div>
          )
        })}
      </div>
      {conflicts?.length > 0 && (
        <div className="banner warn">
          Your data disagrees with the story for: {conflicts.map((c) => `${c.key} (you said ${c.said}, data shows ${c.data})`).join(', ')}. The data wins.
        </div>
      )}
      <div className="field whatif">
        <label onClick={onWhatIf} style={{ cursor: 'pointer' }}>
          <strong>What-if mode</strong>
          <span className="tiny subtle" style={{ display: 'block' }}>
            Ignore facts measured from the data so you can explore hypotheticals, e.g. “what if some costs were negative?”
          </span>
        </label>
        <button className={`toggle ${whatIf ? 'on' : ''}`} onClick={onWhatIf} aria-pressed={whatIf} aria-label="What-if mode" />
      </div>
    </div>
  )
}

export function RecommendationCard({ rec, trace, path }) {
  const [state, setState] = useState(() => ({ scoring: rec.scoring, evidence: rec.evidence, chosen: rec.algorithmId, values: { ...rec.scoring.constraints }, whatIf: false, changedFrom: null, evidenceNote: null, busy: false }))
  const first = useRef(true)

  useEffect(() => {
    setState({ scoring: rec.scoring, evidence: rec.evidence, chosen: rec.algorithmId, values: { ...rec.scoring.constraints }, whatIf: false, changedFrom: null, evidenceNote: null, busy: false })
    first.current = true
  }, [rec])

  const rescore = async (values, whatIf) => {
    setState((s) => ({ ...s, values, whatIf, busy: true }))
    try {
      const r = await api.rescore({ problemType: rec.analysis.problemType, constraints: values, input: rec.input, whatIf })
      setState((s) => ({ ...s, scoring: r.scoring, evidence: r.evidence, chosen: r.chosen, evidenceNote: r.evidenceNote, changedFrom: r.chosen !== rec.algorithmId ? rec.algorithmId : null, busy: false }))
    } catch (e) {
      setState((s) => ({ ...s, busy: false, evidenceNote: e.message }))
    }
  }

  const chosen = state.chosen
  const A = chosen ? ALGORITHMS[chosen] : null
  const inputOk = chosen && validateFor(chosen, rec.input).valid
  const alt = state.scoring.candidates.find((c) => c.id !== chosen && validateFor(c.id, rec.input).valid)

  const openViz = (algoId) => {
    const input = validateFor(algoId, rec.input).valid ? rec.input : structuredClone(ALGORITHMS[algoId].sample)
    setHandoff(`viz:${algoId}`, input)
    window.location.hash = `#/visualize/${algoId}`
  }
  const openCompare = () => {
    setHandoff(`viz:${chosen}`, rec.input)
    window.location.hash = `#/visualize/${chosen}/compare/${alt.id}`
  }

  const whyNot = state.scoring.candidates
    .filter((c) => c.id !== chosen)
    .map((c) => {
      const best = state.scoring.candidates.find((x) => x.id === chosen)
      const warns = Object.values(c.cells).filter((x) => x.status === 'warn').map((x) => x.text)
      return { ...c, reason: c.rejected ? c.rejectReasons.join(' ') : `Also works, but more work for your size (${c.cells.work.text} vs ${best?.cells.work.text}).${warns.map((w) => ` ${w}.`).join('')}` }
    })

  return (
    <div className="card">
      <div className="rec-hero">
        <div className="row">
          <span className="kicker">Best fit for: {rec.scoring.familyLabel.toLowerCase()}</span>
          <span className="grow" />
          <span className={`chip ${rec.explanationSource === 'llm' ? 'ok' : 'info'}`} title={rec.explanationFallbackReason ? `AI text failed fact-check: ${rec.explanationFallbackReason.join('; ')}` : ''}>
            {rec.explanationSource === 'llm' ? `Written by ${rec.explanationModel || 'AI'}, numbers fact-checked` : 'Rule-generated explanation'}
          </span>
          <span className={`chip ${rec.critic.repaired ? 'warn' : 'ok'}`}>{rec.critic.repaired ? 'critic: auto-repaired' : `critic approved${rec.critic.revisions ? ` after ${rec.critic.revisions} revision(s)` : ''}`}</span>
        </div>
        {state.changedFrom && (
          <div className="banner warn">
            Recalculated by rules (no AI): with your edits the best fit changed from <strong>{ALGORITHMS[state.changedFrom].name}</strong> to <strong>{A ? A.name : 'nothing'}</strong>.
          </div>
        )}
        <h2>{A ? A.name : 'No algorithm fits these constraints'}</h2>
        {!state.changedFrom && <div className="because">{rec.because}</div>}
        {!state.changedFrom && rec.inYourWords && <div className="muted">{rec.inYourWords}</div>}
        {!state.changedFrom && rec.personalNote && <div className="personal">{rec.personalNote}</div>}
        {A && (
          <div className="row tiny">
            <span className="chip">time {A.complexity.time}</span>
            <span className="chip">space {A.complexity.space}</span>
            {rec.inputIsExample && <span className="chip warn">example data: edit it in the visualizer</span>}
          </div>
        )}
        {rec.analysis.assumptions?.length > 0 && <div className="tiny muted">Assumptions: {rec.analysis.assumptions.join(' · ')}</div>}
      </div>

      <details className="sec" open>
        <summary>
          What I understood <span className="sum-note">{state.busy ? 'recalculating…' : 'edit anything to recalculate instantly'}</span>
        </summary>
        <div className="sec-body stack">
          <div className="muted">“{rec.analysis.summary}”</div>
          <ConstraintEditor
            fields={rec.constraintFields}
            values={state.values}
            fromData={state.scoring.fromData}
            conflicts={state.scoring.conflicts}
            whatIf={state.whatIf}
            onChange={(k, v) => rescore({ ...state.values, [k]: v }, state.whatIf)}
            onWhatIf={() => rescore(state.values, !state.whatIf)}
          />
        </div>
      </details>

      <details className="sec" open>
        <summary>
          How every option scored <span className="sum-note">{state.scoring.candidates.length} candidates from the catalog</span>
        </summary>
        <div className="sec-body">
          <ScoreMatrix scoring={state.scoring} chosen={chosen} />
        </div>
      </details>

      <details className="sec" open>
        <summary>
          Tested on your data <span className="sum-note">real runs, real counts</span>
        </summary>
        <div className="sec-body">
          {state.evidenceNote && <div className="banner warn">{state.evidenceNote}</div>}
          <EvidenceTable evidence={state.evidence} />
        </div>
      </details>

      <details className="sec">
        <summary>
          Why not the others <span className="sum-note">{whyNot.length} alternatives</span>
        </summary>
        <div className="sec-body stack">
          {whyNot.map((w) => (
            <div key={w.id} className="row" style={{ alignItems: 'flex-start' }}>
              <span className={`chip ${w.rejected ? 'bad' : ''}`}>{w.rejected ? 'rejected' : 'works, slower'}</span>
              <div className="grow">
                <strong>{w.name}</strong>: {w.reason}
              </div>
              <button className="btn sm ghost" onClick={() => openViz(w.id)}>
                Visualize
              </button>
            </div>
          ))}
        </div>
      </details>

      <details className="sec">
        <summary>
          How I decided (full agent trace) <span className="sum-note">{trace.length} events, path: {path?.join(' → ')}</span>
        </summary>
        <div className="sec-body">
          <TracePanel trace={trace} />
        </div>
      </details>

      <div className="actions">
        {A && (
          <button className="btn cyan" onClick={() => openViz(chosen)}>
            Visualize {inputOk ? 'with my data' : 'with sample data'}
          </button>
        )}
        {A && alt && inputOk && (
          <button className="btn" onClick={openCompare}>
            Compare visually with {alt.name}
          </button>
        )}
      </div>
    </div>
  )
}
