// Visualizer side modules: step insight, complexity card + growth graph,
// controls, how-to checklist, variables, notes, learning path.
import React, { useEffect, useMemo, useState } from 'react'
import { ALGORITHMS } from '../../shared/registry.js'
import { LEARNING } from '../../shared/learning.js'
import { familiesOf, FAMILIES } from '../../shared/scoring.js'
import { fmt } from '../../shared/util.js'
import { Icon, Kicker, Diff } from '../components/ui.jsx'

const show = (v) => (typeof v === 'number' ? fmt(v) : typeof v === 'string' ? v : JSON.stringify(v))

export function StepInsight({ step, prevStep, index, total, activeLine }) {
  const changed = Object.keys(step?.vars || {}).filter((k) => prevStep?.vars && JSON.stringify(prevStep.vars[k]) !== JSON.stringify(step.vars[k]))
  return (
    <div className="card pad panel">
      <div className="panel-h">
        <Kicker>What is happening</Kicker>
      </div>
      <div className="insight-msg fade-key" key={`m${index}`}>
        <span>{step?.message}</span>
      </div>
      <div className="insight-why fade-key" key={`w${index}`}>
        <strong>Why: </strong>
        {step?.why}
      </div>
      <div className="tiles">
        <div className="tile">
          <div className="t">Step</div>
          <div className="v">
            {index + 1} / {total}
          </div>
        </div>
        <div className="tile">
          <div className="t">Code line</div>
          <div className="v">{activeLine ?? '–'}</div>
        </div>
        <div className="tile">
          <div className="t">Changed</div>
          <div className="v" style={{ fontSize: 12.5 }}>
            {changed.length ? changed.join(', ') : 'nothing'}
          </div>
        </div>
      </div>
    </div>
  )
}

export function VariablesPanel({ step, prevStep }) {
  const entries = Object.entries(step?.vars || {})
  return (
    <div className="card pad panel">
      <div className="panel-h">
        <Kicker>Variables</Kicker>
        <span className="hint">changed values are marked</span>
      </div>
      {entries.length ? (
        <div className="vars">
          {entries.map(([k, v]) => {
            const changed = prevStep && prevStep.vars && JSON.stringify(prevStep.vars[k]) !== JSON.stringify(v)
            return (
              <React.Fragment key={k}>
                <span className="k">{k}</span>
                <span className={`v ${changed ? 'changed' : ''}`}>{show(v)}</span>
              </React.Fragment>
            )
          })}
        </div>
      ) : (
        <div className="tiny subtle">No variables at this step.</div>
      )}
    </div>
  )
}

export function ComplexityPanel({ algoId }) {
  const c = LEARNING[algoId]?.complexity
  if (!c) return null
  return (
    <div className="card pad panel">
      <div className="panel-h">
        <Kicker>Complexity</Kicker>
        <span className="hint">log scale, n = 2 … 48</span>
      </div>
      <div className="cx-grid">
        {[
          ['Best', c.best],
          ['Average', c.average],
          ['Worst', c.worst],
          ['Space', c.space],
        ].map(([k, v]) => (
          <div key={k} className="tile">
            <div className="t">{k}</div>
            <div className="v" style={{ fontSize: 13.5 }}>
              {v}
            </div>
          </div>
        ))}
      </div>
      <ComplexityGraph algoId={algoId} />
    </div>
  )
}

const PALETTE = ['var(--accent-2)', 'var(--v-compare)', 'var(--v-swap)', 'var(--v-pivot)', 'var(--warn)']

/** Growth curves of this algorithm vs. its siblings (log scale), drawn in plain SVG. */
export function ComplexityGraph({ algoId }) {
  const fam = familiesOf(algoId)[0]
  const ids = fam ? [algoId, ...FAMILIES[fam].candidates.filter((x) => x !== algoId)] : [algoId]
  const sizes = Array.from({ length: 24 }, (_, i) => 2 + i * 2)
  const series = ids.map((id) => ({ id, pts: sizes.map((n) => Math.max(1, LEARNING[id].growth(n))) }))
  const maxY = Math.max(...series.flatMap((s) => s.pts))
  const W = 560
  const H = 190
  const L = 46
  const B = 28
  const xs = (i) => L + (i / (sizes.length - 1)) * (W - L - 10)
  const ys = (v) => H - B - (Math.log10(v) / Math.log10(maxY)) * (H - B - 12)
  const ticks = []
  for (let p = 0; 10 ** p <= maxY * 1.01; p++) ticks.push(10 ** p)
  return (
    <div className="cx-graph">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }} role="img" aria-label="complexity growth chart">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - 10} y1={ys(t)} y2={ys(t)} style={{ stroke: 'var(--border)' }} />
            <text x={L - 6} y={ys(t) + 4} textAnchor="end" style={{ fill: 'var(--subtle)', fontSize: 10 }}>
              {t >= 1000 ? `${t / 1000}k` : t}
            </text>
          </g>
        ))}
        {[0, 7, 15, 23].map((i) => (
          <text key={i} x={xs(i)} y={H - 8} textAnchor="middle" style={{ fill: 'var(--subtle)', fontSize: 10 }}>
            n={sizes[i]}
          </text>
        ))}
        {series
          .slice()
          .reverse()
          .map((s) => {
            const idx = ids.indexOf(s.id)
            const d = s.pts.map((v, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(' ')
            return <path key={s.id} d={d} style={{ fill: 'none', stroke: PALETTE[idx % PALETTE.length], strokeWidth: s.id === algoId ? 2.75 : 1.5, opacity: s.id === algoId ? 1 : 0.7, strokeDasharray: s.id === algoId ? 'none' : '4 4' }} />
          })}
      </svg>
      <div className="legend">
        {ids.map((id, i) => (
          <span key={id} style={{ fontWeight: id === algoId ? 700 : 400 }}>
            <i style={{ background: PALETTE[i % PALETTE.length] }} />
            {ALGORITHMS[id].name} ({LEARNING[id].complexity.average})
          </span>
        ))}
      </div>
    </div>
  )
}

export function HowTo({ started, stepped, finished }) {
  const steps = [
    ['Look at the data on the stage', true],
    ['Press Play or step with → ', started],
    ['Read the “why” and watch the code line', stepped],
    ['Reach the result, then try your own data', finished],
  ]
  return (
    <div className="card pad howto">
      <Kicker muted>How to use</Kicker>
      <div style={{ marginTop: 8 }}>
        {steps.map(([label, done], i) => (
          <div key={i} className={`s ${done ? 'done' : ''}`}>
            <span className="n">{done ? '✓' : i + 1}</span>
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}

export function ControlsBar({ pb, mode, setMode }) {
  return (
    <div className="card controls-bar">
      <div className="ctrl-buttons">
        <button className="btn icon" onClick={() => pb.goTo(0)} title="Restart" aria-label="Restart">
          <Icon name="reset" />
        </button>
        <button className="btn icon" onClick={pb.prev} title="Previous (←)" aria-label="Previous step">
          <Icon name="prev" />
        </button>
        {mode === 'auto' ? (
          pb.playing ? (
            <button className="btn primary icon-wide" onClick={pb.pause} aria-label="Pause">
              <Icon name="pause" /> Pause
            </button>
          ) : (
            <button className="btn primary icon-wide" onClick={pb.play} aria-label="Play">
              <Icon name="play" /> Play
            </button>
          )
        ) : (
          <button className="btn primary icon-wide" onClick={pb.next} aria-label="Next step">
            Next step
          </button>
        )}
        <button className="btn icon" onClick={pb.next} title="Next (→)" aria-label="Next step">
          <Icon name="next" />
        </button>
      </div>
      <div className="ctrl-track">
        <span className="ctrl-count mono">
          {String(pb.index + 1).padStart(String(pb.total).length, '0')} / {pb.total}
        </span>
        <input className="scrub" type="range" min="0" max={Math.max(0, pb.total - 1)} value={pb.index} onChange={(e) => pb.goTo(Number(e.target.value))} aria-label="Step position" style={{ '--pct': `${pb.total > 1 ? (pb.index / (pb.total - 1)) * 100 : 0}%` }} />
      </div>
      <div className="ctrl-speed">
        <span className="label">Speed</span>
        <input type="range" min="0.25" max="4" step="0.25" value={pb.speed} onChange={(e) => pb.setSpeed(Number(e.target.value))} aria-label="Speed" />
        <span className="mono ctrl-x">{pb.speed}×</span>
      </div>
      <div className="seg ctrl-mode">
        <button className={mode === 'auto' ? 'on' : ''} onClick={() => setMode('auto')}>
          Auto
        </button>
        <button
          className={mode === 'step' ? 'on' : ''}
          onClick={() => {
            setMode('step')
            pb.pause()
          }}
        >
          Step
        </button>
      </div>
    </div>
  )
}

export function KeyHint() {
  return (
    <span className="key-hint">
      <span className="kbd">space</span> play / pause <span className="kbd">←</span> <span className="kbd">→</span> step
    </span>
  )
}

function loadNotes(key) {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

export function NotesPanel({ algoId }) {
  const L = LEARNING[algoId]
  const key = `algometis.notes.${algoId}`
  const [mine, setMine] = useState(() => loadNotes(key))
  const [tab, setTab] = useState('learn')
  useEffect(() => {
    setMine(loadNotes(key))
  }, [key])
  useEffect(() => {
    try {
      if (mine) localStorage.setItem(key, mine)
      else localStorage.removeItem(key)
    } catch {
      /* storage unavailable */
    }
  }, [key, mine])
  return (
    <div className="card pad panel">
      <div className="panel-h">
        <Kicker>Notes</Kicker>
        <div className="seg" style={{ width: 180 }}>
          <button className={tab === 'learn' ? 'on' : ''} onClick={() => setTab('learn')}>
            Key ideas
          </button>
          <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>
            My notes
          </button>
        </div>
      </div>
      {tab === 'learn' ? (
        <div className="stack-sm small">
          <div style={{ color: 'var(--text)' }}>{L.intuition}</div>
          <div>
            <div className="tiny subtle" style={{ marginBottom: 4 }}>
              Key steps
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--muted)' }}>
              {L.keySteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
          <div>
            <div className="tiny subtle" style={{ marginBottom: 4 }}>
              Used in the real world
            </div>
            <div className="row" style={{ gap: 6 }}>
              {L.realWorld.map((r) => (
                <span key={r} className="chip">
                  {r}
                </span>
              ))}
            </div>
          </div>
          <div className="watch-out">
            Watch out: {ALGORITHMS[algoId].pitfalls}
          </div>
        </div>
      ) : (
        <>
          <textarea data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" className="text notes-area" value={mine} onChange={(e) => setMine(e.target.value)} placeholder="Write what you understood in your own words… (saved in this browser)" aria-label="My notes" />
          {mine && (
            <button className="btn sm ghost" onClick={() => setMine('')} style={{ alignSelf: 'flex-start' }}>
              Clear notes
            </button>
          )}
        </>
      )}
    </div>
  )
}

export function LearningPath({ algoId }) {
  const next = LEARNING[algoId]?.next || []
  return (
    <div className="card pad panel">
      <div className="panel-h">
        <Kicker>Learn next</Kicker>
        <span className="hint">builds directly on this one</span>
      </div>
      <div className="next-list">
        {next.map((id) => (
          <a key={id} href={`#/visualize/${id}`}>
            <span className="nl-main">
              <span className="nl-title">
                {ALGORITHMS[id].name}
                <Diff level={LEARNING[id].difficulty} />
              </span>
              <span className="nl-text">{LEARNING[id].intuition}</span>
            </span>
            <Icon name="arrow" />
          </a>
        ))}
      </div>
    </div>
  )
}

export function useSiblings(algoId, input, validateFor) {
  return useMemo(() => {
    const fams = familiesOf(algoId)
    const ids = [...new Set(fams.flatMap((f) => FAMILIES[f].candidates))].filter((x) => x !== algoId)
    return ids.filter((id) => validateFor(id, input).valid)
  }, [algoId, input, validateFor])
}
