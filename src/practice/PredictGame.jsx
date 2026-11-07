import React, { useMemo, useState } from 'react'
import { GENERATORS } from '../../shared/algorithms/index.js'
import { ALGORITHMS } from '../../shared/registry.js'
import { runSteps, Stage } from '../visualizer/Visualizer.jsx'
import { CodePanel } from '../visualizer/CodePanel.jsx'
import { Kicker, Icon } from '../components/ui.jsx'
import { recordGame } from './stats.js'

// deterministic shuffle so options don't jump around on re-render
function seeded(seed) {
  let s = seed % 2147483647 || 1
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}
function shuffle(arr, seed) {
  const r = seeded(seed)
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Build a question about what happens between step i and step i+1. */
export function makeQuestion(steps, i, code) {
  const next = steps[i + 1]
  if (!next) return null
  const codeLines = code.code.split('\n')
  const lineType = i % 2 === 0
  if (lineType) {
    const correct = code.lines[next.line]
    const others = [...new Set(Object.values(code.lines))].filter((l) => l !== correct)
    const picks = shuffle(others, i * 7 + 3).slice(0, 3)
    const options = shuffle([correct, ...picks], i * 13 + 5).map((ln) => ({ id: `L${ln}`, label: `line ${ln}: ${codeLines[ln - 1].trim()}`, correct: ln === correct }))
    return { prompt: 'Which line of code runs next?', options, explain: next.why }
  }
  const pool = [...new Set(steps.map((s) => s.message))].filter((m) => m !== next.message && m !== steps[i].message)
  const picks = shuffle(pool, i * 11 + 1).slice(0, 2)
  const options = shuffle([next.message, ...picks], i * 17 + 9).map((m, k) => ({ id: `M${k}`, label: m, correct: m === next.message }))
  return { prompt: 'What happens next?', options, explain: next.why }
}

export function PredictGame({ algoId, input }) {
  const A = ALGORITHMS[algoId]
  const run = useMemo(() => runSteps(algoId, input), [algoId, input])
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState(null)
  const [score, setScore] = useState({ right: 0, total: 0, streak: 0, best: 0 })
  const [lang, setLang] = useState('javascript')
  const code = GENERATORS[algoId].code[lang]
  const jsCode = GENERATORS[algoId].code.javascript
  const q = useMemo(() => (run.steps.length ? makeQuestion(run.steps, index, jsCode) : null), [run, index, jsCode])
  if (run.error) return <div className="card pad err">{run.error.join('; ')}</div>
  const step = run.steps[index]
  const done = index >= run.steps.length - 1

  const answer = (opt) => {
    if (picked) return
    setPicked(opt.id)
    setScore((s) => {
      const right = s.right + (opt.correct ? 1 : 0)
      const streak = opt.correct ? s.streak + 1 : 0
      return { right, total: s.total + 1, streak, best: Math.max(s.best, streak) }
    })
  }
  const advance = () => {
    setPicked(null)
    const ni = index + 1
    setIndex(ni)
    if (ni >= run.steps.length - 1) recordGame('predict', { right: score.right, total: score.total, best: score.best })
  }

  return (
    <div className="vgrid">
      <div className="stack">
        <Stage step={step} input={input} />
        <CodePanel code={code.code} lang={lang} onLang={setLang} activeLine={code.lines[step.line]} title={A.name} />
      </div>
      <div className="stack">
        <div className="card pad stack-sm">
          <div className="row">
            <Kicker>Predict the next step</Kicker>
            <span className="grow" />
            <span className="chip cyan">
              step {index + 1}/{run.steps.length}
            </span>
          </div>
          <div className="small muted">Now: {step.message}</div>
          {!done && q ? (
            <>
              <h3 style={{ fontSize: 17, marginTop: 6 }}>{q.prompt}</h3>
              <div className="stack-sm">
                {q.options.map((o) => (
                  <button key={o.id} className={`quiz-opt ${picked ? (o.correct ? 'right' : picked === o.id ? 'wrong' : '') : ''}`} onClick={() => answer(o)} disabled={!!picked}>
                    {o.label}
                  </button>
                ))}
              </div>
              {picked && (
                <div className={`banner ${q.options.find((o) => o.id === picked).correct ? 'ok' : 'warn'}`}>
                  <strong>{q.options.find((o) => o.id === picked).correct ? 'Correct! ' : 'Not quite. '}</strong>
                  {q.explain}
                </div>
              )}
              <button className="btn cyan" onClick={advance} disabled={!picked}>
                Reveal next step <Icon name="arrow" />
              </button>
            </>
          ) : (
            <div className="banner ok">
              Finished! You predicted {score.right} of {score.total} steps correctly{score.total ? ` (${Math.round((100 * score.right) / score.total)}%)` : ''}. Best streak: {score.best}.
            </div>
          )}
        </div>
        <div className="score-tiles">
          {[
            ['Correct', score.right],
            ['Answered', score.total],
            ['Streak', score.streak],
            ['Best streak', score.best],
          ].map(([k, v]) => (
            <div key={k} className="tile">
              <div className="t">{k}</div>
              <div className="v">{v}</div>
            </div>
          ))}
        </div>
        <button
          className="btn ghost sm"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => {
            setIndex(0)
            setPicked(null)
            setScore({ right: 0, total: 0, streak: 0, best: 0 })
          }}
        >
          <Icon name="reset" /> Restart
        </button>
      </div>
    </div>
  )
}
