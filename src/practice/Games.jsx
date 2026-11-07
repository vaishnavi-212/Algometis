import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ALGORITHMS } from '../../shared/registry.js'
import { FAMILIES, scoreFamily } from '../../shared/scoring.js'
import { deriveFacts } from '../../shared/schemas.js'
import { validateFor } from '../../shared/evidence.js'
import { runSteps, Stage } from '../visualizer/Visualizer.jsx'
import { Kicker, Icon } from '../components/ui.jsx'
import { recordGame } from './stats.js'

const pick = (a) => a[Math.floor(Math.random() * a.length)]
const shuffle = (a) => [...a].sort(() => Math.random() - 0.5)

// ================================================================ Guess the algorithm
const GUESS_FAMILIES = ['sort', 'search', 'shortest_path', 'traversal', 'mst', 'knapsack', 'coin_change']

function makeRound() {
  for (let tries = 0; tries < 20; tries++) {
    const fam = pick(GUESS_FAMILIES)
    const cands = FAMILIES[fam].candidates
    const input = cands.map((id) => ALGORITHMS[id].sample).find((s) => cands.every((id) => validateFor(id, s).valid))
    if (!input) continue
    const answer = pick(cands)
    return { fam, answer, input: { ...input, meta: { title: 'Mystery algorithm' } }, options: shuffle(cands) }
  }
  return null
}

const ROUNDS = 6
const SECONDS = 25

export function GuessGame() {
  const [round, setRound] = useState(() => makeRound())
  const [n, setN] = useState(1)
  const [tick, setTick] = useState(0)
  const [time, setTime] = useState(SECONDS)
  const [picked, setPicked] = useState(null)
  const [score, setScore] = useState({ points: 0, right: 0, streak: 0, best: 0 })
  const [over, setOver] = useState(false)
  const run = useMemo(() => runSteps(round.answer, round.input), [round])
  const timer = useRef(null)

  useEffect(() => {
    if (picked || over) return undefined
    timer.current = setInterval(() => {
      setTick((t) => (t + 1) % Math.max(1, run.steps.length))
      setTime((t) => Math.max(0, t - 0.5))
    }, 500)
    return () => clearInterval(timer.current)
  }, [picked, over, run])
  useEffect(() => {
    if (time === 0 && !picked) setPicked('__timeout')
  }, [time, picked])

  const answer = (id) => {
    if (picked) return
    setPicked(id)
    const ok = id === round.answer
    setScore((s) => {
      const streak = ok ? s.streak + 1 : 0
      return { points: s.points + (ok ? 100 + Math.round(time * 4) : 0), right: s.right + (ok ? 1 : 0), streak, best: Math.max(s.best, streak) }
    })
  }
  const next = () => {
    if (n >= ROUNDS) {
      setOver(true)
      recordGame('guess', { right: score.right, total: ROUNDS, best: score.best })
      return
    }
    setRound(makeRound())
    setN(n + 1)
    setTick(0)
    setTime(SECONDS)
    setPicked(null)
  }
  const restart = () => {
    setRound(makeRound())
    setN(1)
    setTick(0)
    setTime(SECONDS)
    setPicked(null)
    setOver(false)
    setScore({ points: 0, right: 0, streak: 0, best: 0 })
  }

  return (
    <div className="vgrid">
      <div className="stack">
        <Stage step={run.steps[Math.min(tick, run.steps.length - 1)]} input={round.input} compact hideState title={`Round ${n}/${ROUNDS} · ${FAMILIES[round.fam].label}`} />
        <div className="timer">
          <span style={{ width: `${(time / SECONDS) * 100}%` }} />
        </div>
      </div>
      <div className="stack">
        <div className="card pad stack-sm">
          <Kicker>Guess the algorithm</Kicker>
          <div className="small muted">Watch how the data changes. The name, code and messages are hidden. Which algorithm is this?</div>
          {over ? (
            <>
              <div className="banner ok">
                Game over: {score.right}/{ROUNDS} correct, {score.points} points, best streak {score.best}.
              </div>
              <button className="btn cyan" onClick={restart}>
                Play again
              </button>
            </>
          ) : (
            <>
              {round.options.map((id) => (
                <button key={id} className={`quiz-opt ${picked ? (id === round.answer ? 'right' : picked === id ? 'wrong' : '') : ''}`} disabled={!!picked} onClick={() => answer(id)}>
                  {ALGORITHMS[id].name}
                </button>
              ))}
              {picked && (
                <div className={`banner ${picked === round.answer ? 'ok' : 'warn'}`}>
                  {picked === '__timeout' ? 'Time is up. ' : picked === round.answer ? 'Correct! ' : 'Not this time. '}
                  It was <strong>{ALGORITHMS[round.answer].name}</strong>: {ALGORITHMS[round.answer].whenToUse}
                </div>
              )}
              <button className="btn cyan" onClick={next} disabled={!picked}>
                {n >= ROUNDS ? 'See results' : 'Next round'} <Icon name="arrow" />
              </button>
            </>
          )}
        </div>
        <div className="score-tiles">
          {[
            ['Points', score.points],
            ['Correct', score.right],
            ['Streak', score.streak],
            ['Time', `${Math.ceil(time)}s`],
          ].map(([k, v]) => (
            <div key={k} className="tile">
              <div className="t">{k}</div>
              <div className="v">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ================================================================ Which algorithm fits? (uses the same rules as the agent)
const COINSETS = [
  [1, 2, 5, 10],
  [1, 3, 4],
  [1, 5, 10, 25],
  [1, 7, 10],
  [1, 6, 9],
]
const SIZES = [8, 60, 5000, 200000]
const FIT_FAMILIES = ['search', 'sort', 'traversal', 'shortest_path', 'mst', 'knapsack', 'coin_change']

function makeScenario() {
  for (let tries = 0; tries < 50; tries++) {
    const fam = pick(FIT_FAMILIES)
    const F = FAMILIES[fam]
    const c = {}
    let facts = {}
    for (const f of F.fields) {
      if (f.type === 'bool') c[f.key] = Math.random() < 0.45
      else if (f.key === 'size') c.size = pick(SIZES)
      else if (f.key === 'edges') c.edges = Math.round((c.size || 50) * pick([1.2, 3, (c.size || 50) / 3]))
      else if (f.key === 'capacity') c.capacity = pick([10, 20, 30])
    }
    if (fam === 'coin_change') {
      const coins = pick(COINSETS)
      const amount = 10 + Math.floor(Math.random() * 20)
      facts = deriveFacts('coins', { coins, amount })
      c.size = amount
      delete c.canonical
      c._coins = coins
    }
    const scoring = scoreFamily(fam, c, facts)
    if (!scoring.best) continue
    return { fam, c, scoring, options: shuffle(F.candidates) }
  }
  return null
}

export function FitsGame() {
  const [sc, setSc] = useState(() => makeScenario())
  const [picked, setPicked] = useState(null)
  const [score, setScore] = useState({ right: 0, total: 0, streak: 0, best: 0 })
  const F = FAMILIES[sc.fam]
  const best = sc.scoring.best
  const cand = (id) => sc.scoring.candidates.find((x) => x.id === id)
  const answer = (id) => {
    if (picked) return
    setPicked(id)
    const ok = id === best
    setScore((s) => {
      const streak = ok ? s.streak + 1 : 0
      const n = { right: s.right + (ok ? 1 : 0), total: s.total + 1, streak, best: Math.max(s.best, streak) }
      if (n.total % 5 === 0) recordGame('fits', { right: n.right, total: n.total, best: n.best })
      return n
    })
  }
  const facts = F.fields.filter((f) => f.key !== 'canonical')
  return (
    <div className="vgrid">
      <div className="stack">
        <div className="card pad stack-sm">
          <Kicker>Scenario</Kicker>
          <h3 style={{ fontSize: 20 }}>{F.label}</h3>
          <div className="fields">
            {facts.map((f) => (
              <div key={f.key} className="field">
                <label>{f.label}</label>
                <strong style={{ color: f.type === 'bool' ? (sc.c[f.key] ? 'var(--emerald)' : 'var(--rose)') : 'var(--text-strong)' }}>{f.type === 'bool' ? (sc.c[f.key] ? 'Yes' : 'No') : sc.c[f.key]?.toLocaleString('en-US')}</strong>
              </div>
            ))}
            {sc.c._coins && (
              <div className="field">
                <label>Coin values</label>
                <strong>{sc.c._coins.join(', ')}</strong>
              </div>
            )}
          </div>
        </div>
        {picked && (
          <div className="card pad stack-sm">
            <Kicker>Why (the same rules the AI agent uses)</Kicker>
            {sc.scoring.candidates.map((x) => (
              <div key={x.id} className="row small" style={{ alignItems: 'flex-start' }}>
                <span className={`chip ${x.id === best ? 'ok' : x.rejected ? 'bad' : ''}`}>{x.id === best ? 'best' : x.rejected ? 'rejected' : 'slower'}</span>
                <div className="grow">
                  <strong>{x.name}</strong>
                  <span className="muted">
                    {' '}
                    ·{' '}
                    {x.rejected
                      ? x.rejectReasons.join(' ')
                      : x.id === best
                        ? Object.values(x.cells)
                            .filter((v) => v.status === 'pass')
                            .map((v) => v.text)
                            .join('; ') || x.cells.work.text
                        : `${x.cells.work.text} vs ${cand(best).cells.work.text}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="stack">
        <div className="card pad stack-sm">
          <Kicker>Which algorithm fits best?</Kicker>
          {sc.options.map((id) => (
            <button key={id} className={`quiz-opt ${picked ? (id === best ? 'right' : picked === id ? 'wrong' : '') : ''}`} disabled={!!picked} onClick={() => answer(id)}>
              {ALGORITHMS[id].name} <span className="tiny subtle">· {ALGORITHMS[id].complexity.time}</span>
            </button>
          ))}
          {picked && <div className={`banner ${picked === best ? 'ok' : 'warn'}`}>{picked === best ? 'Correct!' : `Best fit: ${ALGORITHMS[best].name}.`}</div>}
          <button
            className="btn cyan"
            disabled={!picked}
            onClick={() => {
              setSc(makeScenario())
              setPicked(null)
            }}
          >
            Next scenario <Icon name="arrow" />
          </button>
        </div>
        <div className="score-tiles">
          {[
            ['Correct', score.right],
            ['Answered', score.total],
            ['Streak', score.streak],
            ['Best', score.best],
          ].map(([k, v]) => (
            <div key={k} className="tile">
              <div className="t">{k}</div>
              <div className="v">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
