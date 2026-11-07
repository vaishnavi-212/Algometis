import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ALGORITHMS, CATEGORIES } from '../../shared/registry.js'
import { LEARNING } from '../../shared/learning.js'
import { validateFor } from '../../shared/evidence.js'
import { familiesOf, FAMILIES } from '../../shared/scoring.js'
import { api, takeHandoff } from '../api.js'
import { SoloVisualizer, CompactVisualizer, runSteps } from '../visualizer/Visualizer.jsx'
import { TutorPanel } from '../visualizer/TutorPanel.jsx'
import { InputPanel } from '../visualizer/InputPanel.jsx'
import { PredictGame } from '../practice/PredictGame.jsx'
import { Kicker, Diff, Tabs, Icon } from '../components/ui.jsx'

function CompareView({ algoId, input, withId, setWith }) {
  const siblings = useMemo(() => {
    const ids = [...new Set(familiesOf(algoId).flatMap((f) => FAMILIES[f].candidates))].filter((x) => x !== algoId)
    return ids.filter((id) => validateFor(id, input).valid)
  }, [algoId, input])
  const other = siblings.includes(withId) ? withId : siblings[0]
  const ra = useMemo(() => runSteps(algoId, input), [algoId, input])
  const rb = useMemo(() => (other ? runSteps(other, input) : null), [other, input])
  const total = Math.max(ra.steps.length, rb?.steps.length || 0)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const t = useRef(null)
  useEffect(() => {
    setIndex(0)
  }, [other, input])
  useEffect(() => {
    if (!playing) return undefined
    if (index >= total - 1) {
      setPlaying(false)
      return undefined
    }
    t.current = setTimeout(() => setIndex((i) => i + 1), 650)
    return () => clearTimeout(t.current)
  }, [playing, index, total])
  if (!other) return <div className="card pad muted">No other algorithm in this family can run on the current data. Try another data set in Solo mode.</div>
  const race = [
    [algoId, ra],
    [other, rb],
  ]
  return (
    <div className="stack">
      <div className="card pad row">
        <Kicker>Compare with</Kicker>
        <select className="text" style={{ width: 260 }} value={other} onChange={(e) => setWith(e.target.value)} aria-label="Compare with">
          {siblings.map((id) => (
            <option key={id} value={id}>
              {ALGORITHMS[id].name}
            </option>
          ))}
        </select>
        <span className="grow" />
        <button className="btn sm" onClick={() => (setPlaying(false), setIndex(0))} aria-label="Restart">
          <Icon name="reset" />
        </button>
        <button className="btn sm" onClick={() => (setPlaying(false), setIndex((i) => Math.max(0, i - 1)))} aria-label="Previous">
          <Icon name="prev" />
        </button>
        {playing ? (
          <button className="btn cyan sm" onClick={() => setPlaying(false)}>
            <Icon name="pause" /> Pause
          </button>
        ) : (
          <button className="btn cyan sm" onClick={() => (index >= total - 1 && setIndex(0), setPlaying(true))}>
            <Icon name="play" /> Race both
          </button>
        )}
        <button className="btn sm" onClick={() => (setPlaying(false), setIndex((i) => Math.min(total - 1, i + 1)))} aria-label="Next">
          <Icon name="next" />
        </button>
      </div>
      <div className="card pad stack-sm">
        <Kicker muted>Progress: same data, one step per tick</Kicker>
        {race.map(([id, r]) => {
          const done = index >= r.steps.length - 1
          return (
            <div key={id} className="row small">
              <span style={{ width: 200, fontWeight: 600 }}>{ALGORITHMS[id].name}</span>
              <div className="progress grow" style={{ height: 8 }}>
                <span style={{ width: `${(Math.min(index, r.steps.length - 1) / Math.max(1, r.steps.length - 1)) * 100}%` }} />
              </div>
              <span className={`chip ${done ? 'ok' : ''}`} style={{ width: 120, justifyContent: 'center' }}>
                {done ? `done in ${r.steps.length} steps` : `${Math.min(index, r.steps.length - 1) + 1}/${r.steps.length}`}
              </span>
            </div>
          )
        })}
      </div>
      <div className="compare-grid">
        {race.map(([id, r]) => (
          <div key={id} className="stack-sm">
            <div className="row">
              <h3 style={{ fontSize: 16 }}>{ALGORITHMS[id].name}</h3>
              <span className="chip">{LEARNING[id].complexity.average}</span>
            </div>
            <CompactVisualizer algoId={id} input={input} index={index} />
            {index >= r.steps.length - 1 && r.result && (
              <div className="banner ok small">
                {r.result.summary}{' '}
                <span className="tiny">
                  ({Object.entries(r.result.stats)
                    .map(([k, v]) => `${k} ${v}`)
                    .join(', ')}
                  )
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function VisualizePage({ algoId, mode = 'solo', withId }) {
  const A = ALGORITHMS[algoId]
  const L = LEARNING[algoId]
  // input is stored together with the algorithm it belongs to, so switching algorithms
  // never renders one algorithm with another algorithm's data
  const fresh = () => ({ algoId, input: takeHandoff(`viz:${algoId}`) || (A ? structuredClone(A.sample) : null) })
  const [store, setStore] = useState(fresh)
  const current = store.algoId === algoId ? store : null
  const fallback = useMemo(() => (current ? null : fresh()), [algoId, current]) // eslint-disable-line react-hooks/exhaustive-deps
  const input = (current || fallback)?.input
  const setInput = (v) => setStore({ algoId, input: v })
  const [jump, setJump] = useState(null)
  useEffect(() => {
    if (!A) return
    if (store.algoId !== algoId) setStore(fallback || fresh())
    api.studied(algoId)
  }, [algoId]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!A) return <div className="card pad">Unknown algorithm “{algoId}”. <a href="#/explore">Back to visualizers</a></div>
  const cat = CATEGORIES.find((c) => c.id === A.category)
  const setMode = (m) => (window.location.hash = m === 'solo' ? `#/visualize/${algoId}` : `#/visualize/${algoId}/${m}`)

  return (
    <div className="vpage">
      <div className="page-head">
        <div className="page-head-main">
          <nav className="crumbs" aria-label="Breadcrumb">
            <a href="#/explore">Visualizers</a>
            <span>/</span>
            <span>{cat.label}</span>
          </nav>
          <div className="title-row">
            <h1>{A.name}</h1>
            <Diff level={L.difficulty} />
          </div>
        </div>
        <Tabs
          value={mode}
          onChange={setMode}
          items={[
            { value: 'solo', label: 'Solo' },
            { value: 'compare', label: 'Compare' },
            { value: 'predict', label: 'Predict', badge: 'quiz' },
          ]}
        />
      </div>
      {mode === 'compare' ? (
        <CompareView algoId={algoId} input={input} withId={withId} setWith={(w) => (window.location.hash = `#/visualize/${algoId}/compare/${w}`)} />
      ) : mode === 'predict' ? (
        <PredictGame key={`${algoId}-${JSON.stringify(input).length}`} algoId={algoId} input={input} />
      ) : (
        <SoloVisualizer
          algoId={algoId}
          input={input}
          jump={jump}
          renderInput={() => (
            <InputPanel
              key={algoId}
              algoId={algoId}
              input={input}
              onApply={(v) => {
                setInput(v)
                setJump(null)
              }}
            />
          )}
          renderTutor={({ pb }) => (
            <TutorPanel
              key={`t-${algoId}`}
              algoId={algoId}
              input={input}
              stepIndex={pb.index}
              onJump={(i) => setJump({ index: i, at: Date.now() })}
              onLoadInput={(v) => {
                setInput(v)
                setJump(null)
              }}
            />
          )}
        />
      )}
    </div>
  )
}
