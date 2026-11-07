import React, { useEffect, useState } from 'react'
import { ALGORITHMS } from '../../shared/registry.js'
import { validateFor } from '../../shared/evidence.js'
import { INPUT_KINDS } from '../../shared/schemas.js'
import { parseFriendly, toFriendly } from '../../shared/storyParser.js'
import { Kicker } from '../components/ui.jsx'

const randomArray = (n, sorted) => {
  const a = Array.from({ length: n }, () => Math.floor(Math.random() * 90) + 5)
  return sorted ? [...new Set(a)].sort((x, y) => x - y) : a
}

/** Custom input: friendly text for lists/graphs + full JSON editor. */
export function InputPanel({ algoId, input, onApply }) {
  const A = ALGORITHMS[algoId]
  const kind = A.inputKind
  const friendlyOk = toFriendly(kind, input) != null
  const [tab, setTab] = useState(friendlyOk ? 'simple' : 'json')
  const [text, setText] = useState(toFriendly(kind, input) || '')
  const [json, setJson] = useState(JSON.stringify(input, null, 2))
  const [target, setTarget] = useState(input.target ?? '')
  const [source, setSource] = useState(input.source ?? '')
  const [errors, setErrors] = useState([])
  const [warnings, setWarnings] = useState([])

  useEffect(() => {
    setText(toFriendly(kind, input) || '')
    setJson(JSON.stringify(input, null, 2))
    setTarget(input.target ?? '')
    setSource(input.source ?? '')
  }, [input, kind])

  const check = (obj) => {
    const v = validateFor(algoId, obj)
    setErrors(v.errors)
    setWarnings(v.warnings)
    if (v.valid) onApply(obj)
  }

  const applySimple = () => {
    const r = parseFriendly(kind, text, input)
    if (r.error) return setErrors([r.error])
    const obj = r.input
    if (kind === 'array_search' && target !== '') obj.target = Number(target)
    if (kind === 'graph' && source && obj.nodes.includes(source)) obj.source = source
    check(obj)
  }
  const applyJson = () => {
    try {
      check(JSON.parse(json))
    } catch (e) {
      setErrors([`Not valid JSON: ${e.message}`])
    }
  }
  const randomize = () => {
    if (kind === 'array_sort') check({ ...input, values: randomArray(8), itemLabels: undefined })
    else if (kind === 'array_search') {
      const values = randomArray(10, !!A.rules.sorted)
      check({ ...input, values, target: values[Math.floor(Math.random() * values.length)], itemLabels: undefined })
    }
  }

  return (
    <div className="card pad stack-sm">
      <div className="row">
        <Kicker>Your data</Kicker>
        <span className="grow" />
        <div className="seg" style={{ width: 170 }}>
          {friendlyOk && (
            <button className={tab === 'simple' ? 'on' : ''} onClick={() => setTab('simple')}>
              Simple
            </button>
          )}
          <button className={tab === 'json' ? 'on' : ''} onClick={() => setTab('json')}>
            JSON
          </button>
        </div>
      </div>
      <div className="tiny subtle">{INPUT_KINDS[kind].label}. Checked by the same validator the AI mentor uses.</div>
      {tab === 'simple' && friendlyOk ? (
        <>
          <textarea data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" className="text" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="Data" placeholder={kind === 'graph' ? 'Kitchen - Market 4\nMarket - Park 2' : '5, 3, 8, 1  or  Asha 72, Ben 45'} />
          <div className="tiny subtle">{kind === 'graph' ? 'One link per line: “A - B 4” (weight optional).' : 'Numbers separated by commas, or “Name number” pairs.'}</div>
          {kind === 'array_search' && (
            <label className="row small">
              Search for <input className="text" style={{ width: 110 }} type="number" value={target} onChange={(e) => setTarget(e.target.value)} />
            </label>
          )}
          {kind === 'graph' && 'source' in input && (
            <label className="row small">
              Start at <input className="text" style={{ width: 160 }} value={source} onChange={(e) => setSource(e.target.value)} />
            </label>
          )}
        </>
      ) : (
        <textarea data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" className="text" style={{ minHeight: 200 }} value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} aria-label="Input JSON" />
      )}
      {errors.length > 0 && (
        <ul className="err" style={{ margin: 0, paddingLeft: 18 }}>
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && <div className="tiny" style={{ color: 'var(--amber)' }}>{warnings.join('; ')}</div>}
      <div className="row">
        <button className="btn cyan sm" onClick={tab === 'simple' && friendlyOk ? applySimple : applyJson}>
          Validate & run
        </button>
        <button className="btn sm" onClick={() => check(structuredClone(A.sample))}>
          Sample
        </button>
        {kind.startsWith('array') && (
          <button className="btn sm" onClick={randomize}>
            Random
          </button>
        )}
      </div>
    </div>
  )
}
