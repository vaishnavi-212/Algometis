import React, { useEffect, useMemo, useState } from 'react'
import { GENERATORS } from '../../shared/algorithms/index.js'
import { ALGORITHMS } from '../../shared/registry.js'
import { validateFor } from '../../shared/evidence.js'
import { useStepPlayback } from './useStepPlayback.js'
import { StepView, RecursionTree } from './views.jsx'
import { CodePanel } from './CodePanel.jsx'
import { StepInsight, VariablesPanel, ComplexityPanel, ControlsBar, KeyHint, NotesPanel, LearningPath } from './panels.jsx'
import { Kicker } from '../components/ui.jsx'
import { ErrorBoundary } from '../components/ErrorBoundary.jsx'

const Safe = ({ name, k, children }) => (
  <ErrorBoundary level="panel" name={name} resetKey={k}>
    {children}
  </ErrorBoundary>
)

export function runSteps(algoId, input) {
  const v = validateFor(algoId, input)
  if (!v.valid) return { error: v.errors, steps: [], result: null }
  const out = GENERATORS[algoId].run(structuredClone(input))
  return { steps: out.steps, result: out.result, warnings: v.warnings }
}

const STATE_LABEL = (step) => (step ? step.line.replace(/([A-Z])/g, ' $1').toLowerCase() : 'ready')

/** The stage card: data structure + (for divide & conquer) the recursion tree. */
export function Stage({ step, input, compact, title, hideState }) {
  return (
    <div className="card canvas-card">
      <div className="panel-h">
        <h3 className="card-title">{title || input.meta?.title || 'Data'}</h3>
        {input.meta?.unit && <span className="chip">unit: {input.meta.unit}</span>}
        <span className="grow" />
        {!hideState && <span className="chip cyan">{STATE_LABEL(step)}</span>}
      </div>
      {input.meta?.note && !compact && <span className="chip warn">{input.meta.note}</span>}
      <div className="stage">
        <StepView view={step?.view} compact={compact} />
      </div>
      {step?.view?.tree && !compact && (
        <div className="stack-sm">
          <Kicker muted>Recursion tree</Kicker>
          <RecursionTree tree={step.view.tree} />
        </div>
      )}
    </div>
  )
}

/**
 * Full visualizer layout, in symmetric bands:
 *   stage | code  →  controls bar  →  insight | variables | data  →  tutor | notes  →  complexity | next
 * `renderInput` and `renderTutor` let the page supply the data editor and the AI tutor.
 */
export function SoloVisualizer({ algoId, input, jump, renderInput, renderTutor }) {
  const A = ALGORITHMS[algoId]
  const run = useMemo(() => runSteps(algoId, input), [algoId, input])
  const pb = useStepPlayback(run.steps)
  const [lang, setLang] = useState('javascript')
  const [mode, setMode] = useState('auto')
  const code = GENERATORS[algoId].code[lang]

  useEffect(() => {
    if (jump) pb.goTo(jump.index)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump])
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return
      if (e.key === ' ') {
        e.preventDefault()
        pb.playing ? pb.pause() : pb.play()
      } else if (e.key === 'ArrowRight') pb.next()
      else if (e.key === 'ArrowLeft') pb.prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pb])

  if (run.error)
    return (
      <div className="card pad">
        <div className="err">This data can’t run on {A.name}:</div>
        <ul className="err">
          {run.error.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
        <div style={{ marginTop: 16 }}>{renderInput?.()}</div>
      </div>
    )

  const step = pb.step
  const prev = run.steps[pb.index - 1]
  const activeLine = step ? code.lines[step.line] : null

  return (
    <div className="vlayout">
      <div className="band band-work">
        <Safe name="Visualization" k={algoId}>
          <Stage step={step} input={input} />
        </Safe>
        <Safe name="Code" k={algoId}>
          <CodePanel code={code.code} lang={lang} onLang={setLang} activeLine={activeLine} title={A.name} />
        </Safe>
      </div>
      <ControlsBar pb={pb} mode={mode} setMode={setMode} />
      {pb.isLast && run.result ? (
        <div className="banner ok">
          <strong>Result: </strong>
          {run.result.summary}{' '}
          <span className="tiny">
            ({Object.entries(run.result.stats)
              .map(([k, v]) => `${k} ${v}`)
              .join(', ')}
            )
          </span>
        </div>
      ) : (
        <div className="band-note">
          <KeyHint />
        </div>
      )}
      <div className="band band-3">
        <Safe name="Step insight" k={algoId}>
          <StepInsight step={step} prevStep={prev} index={pb.index} total={pb.total} activeLine={activeLine} />
        </Safe>
        <Safe name="Variables" k={algoId}>
          <VariablesPanel step={step} prevStep={prev} />
        </Safe>
        <Safe name="Your data" k={algoId}>
          {renderInput?.()}
        </Safe>
      </div>
      <div className="band band-2">
        <Safe name="AI tutor" k={algoId}>
          {renderTutor?.({ pb })}
        </Safe>
        <Safe name="Notes" k={algoId}>
          <NotesPanel algoId={algoId} />
        </Safe>
      </div>
      <div className="band band-2">
        <Safe name="Complexity" k={algoId}>
          <ComplexityPanel algoId={algoId} />
        </Safe>
        <Safe name="Next steps" k={algoId}>
          <LearningPath algoId={algoId} />
        </Safe>
      </div>
    </div>
  )
}

/** Small visualizer driven from outside (compare mode, landing preview, games). */
export function CompactVisualizer({ algoId, input, index, showCode = true, showMessage = true, title }) {
  const run = useMemo(() => runSteps(algoId, input), [algoId, input])
  const [lang, setLang] = useState('javascript')
  if (run.error) return <div className="card pad err">{run.error.join('; ')}</div>
  const i = Math.min(index, run.steps.length - 1)
  const step = run.steps[i]
  const code = GENERATORS[algoId].code[lang]
  return (
    <div className="stack-sm">
      <Stage step={step} input={input} compact title={title} />
      {showMessage && (
        <div className="card pad">
          <div className="small" style={{ color: 'var(--text-strong)', fontWeight: 600 }}>
            {step.message}
          </div>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            {step.why}
          </div>
        </div>
      )}
      {showCode && <CodePanel code={code.code} lang={lang} onLang={setLang} activeLine={code.lines[step.line]} title={ALGORITHMS[algoId].name} />}
    </div>
  )
}
