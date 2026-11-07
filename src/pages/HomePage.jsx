import React, { useEffect, useMemo, useState } from 'react'
import { ALGORITHMS, CATEGORIES } from '../../shared/registry.js'
import { LEARNING, DIFFICULTIES } from '../../shared/learning.js'
import { GENERATORS } from '../../shared/algorithms/index.js'
import { runSteps } from '../visualizer/Visualizer.jsx'
import { StepView } from '../visualizer/views.jsx'
import { CodeLines } from '../visualizer/CodePanel.jsx'
import { Icon, Diff, Tabs, CATEGORY_ACCENT } from '../components/ui.jsx'

const DEMOS = [
  ['dijkstra', 'Dijkstra'],
  ['merge_sort', 'Merge sort'],
  ['knapsack_01', '0/1 Knapsack'],
  ['activity_selection', 'Scheduling'],
]

function HeroPreview() {
  const [demo, setDemo] = useState(0)
  const [tick, setTick] = useState(0)
  const id = DEMOS[demo][0]
  const run = useMemo(() => runSteps(id, ALGORITHMS[id].sample), [id])
  useEffect(() => {
    const t = setInterval(() => {
      setTick((k) => {
        if (k + 1 >= run.steps.length + 4) {
          setDemo((d) => (d + 1) % DEMOS.length)
          return 0
        }
        return k + 1
      })
    }, 650)
    return () => clearInterval(t)
  }, [run])
  const step = run.steps[Math.min(tick, run.steps.length - 1)]
  const code = GENERATORS[id].code.javascript
  return (
    <div className="preview reveal reveal-2">
      <div className="preview-bar">
        <span className="dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="grow" />
        <div className="tabs tabs-sm">
          {DEMOS.map(([k, label], i) => (
            <button
              key={k}
              className={i === demo ? 'on' : ''}
              onClick={() => {
                setDemo(i)
                setTick(0)
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="preview-body">
        <div className="preview-canvas">
          <div className="row">
            <span className="tiny subtle">{ALGORITHMS[id].sample.meta?.title}</span>
            <span className="grow" />
            <span className="chip mono">
              {Math.min(tick, run.steps.length - 1) + 1}/{run.steps.length}
            </span>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <div style={{ width: '100%' }}>
              <StepView view={step.view} compact />
            </div>
          </div>
          <div className="preview-msg fade-key" key={tick}>
            {step.message}
          </div>
        </div>
        <div className="preview-code">
          <CodeLines code={code.code} lang="javascript" activeLine={code.lines[step.line]} />
        </div>
      </div>
    </div>
  )
}

const PIPE = [
  ['Memory', 'Recalls what you studied before', false],
  ['Analyzer', 'Turns your story into constraints', true],
  ['Clarify', 'Asks only if it changes the answer', true],
  ['Planner + tools', 'Parses your data, searches, validates, compares', true],
  ['Critic', 'Rule-checks the pick, sends it back if wrong', false],
  ['Explainer', 'Writes the why; every number fact-checked', true],
]

const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]))
// 10 cards: 5 columns × 2 rows on wide screens, 4 × 2 (first 8) on laptops, 3 × 2 (first 6) on tablets
const FEATURED = ['binary_search', 'merge_sort', 'quick_sort', 'bfs', 'dijkstra', 'kruskal', 'fractional_knapsack', 'activity_selection', 'knapsack_01', 'lcs']
const ORDER = Object.keys(ALGORITHMS)

export function AlgoCard({ id }) {
  const a = ALGORITHMS[id]
  const L = LEARNING[id]
  return (
    <a className="algo-card" href={`#/visualize/${id}`} style={{ '--cat': CATEGORY_ACCENT[a.category] }}>
      <div className="algo-card-top">
        <span className="cat">{CAT_LABEL[a.category]}</span>
        <span className="cx mono">{L.complexity.average}</span>
      </div>
      <h3>{a.name}</h3>
      <p>{L.intuition}</p>
      <div className="foot">
        <Diff level={L.difficulty} />
        <span className="go">
          Open <Icon name="arrow" size={12} />
        </span>
      </div>
    </a>
  )
}

export function ExploreGrid() {
  const [level, setLevel] = useState('All')
  const [cat, setCat] = useState('all')
  const ids = ORDER.filter((id) => (cat === 'all' || ALGORITHMS[id].category === cat) && (level === 'All' || LEARNING[id].difficulty === level))
  return (
    <div id="explore" className="stack">
      <div className="filter-bar">
        <Tabs value={cat} onChange={setCat} items={[{ value: 'all', label: 'All' }, ...CATEGORIES.map((c) => ({ value: c.id, label: c.label }))]} />
        <Tabs value={level} onChange={setLevel} items={['All', ...DIFFICULTIES].map((v) => ({ value: v, label: v === 'All' ? 'Any level' : v }))} />
      </div>
      <div className="result-count">
        {ids.length} algorithm{ids.length === 1 ? '' : 's'}
      </div>
      {ids.length ? (
        <div className="algo-grid">
          {ids.map((id) => (
            <AlgoCard key={id} id={id} />
          ))}
        </div>
      ) : (
        <div className="card pad muted">Nothing matches these filters.</div>
      )}
    </div>
  )
}

const PRACTICE = [
  ['#/practice/predict', 'Predict the next step', 'Pause before every step and guess which line runs or what happens next.', 'target', 'var(--cat-searching)'],
  ['#/practice/guess', 'Guess the algorithm', 'Watch a mystery animation with the code hidden. Can you name it?', 'eye', 'var(--cat-dp)'],
  ['#/practice/fits', 'Which algorithm fits?', 'Random real-world constraints. Pick the best algorithm, checked by the agent’s own rules.', 'route', 'var(--cat-graphs)'],
]

function SectionHead({ title, text, action }) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {text && <p>{text}</p>}
      </div>
      {action}
    </div>
  )
}

export function HomePage() {
  const count = Object.keys(ALGORITHMS).length
  return (
    <div className="home">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow reveal">Algorithms, reasoned out</span>
          <h1 className="reveal">
            Every algorithm, explained <span className="grad-text">one step at a time.</span>
          </h1>
          <p className="lead reveal reveal-1">Describe a real problem in your own words. AlgoMetis picks the algorithm that fits, shows the evidence on your data, and walks through the code line by line until it makes sense.</p>
          <div className="ctas reveal reveal-2">
            <a className="btn primary lg" href="#/mentor">
              <Icon name="spark" /> Solve my problem
            </a>
            <a className="btn lg" href="#/explore">
              Browse {count} algorithms
            </a>
          </div>
          <dl className="hero-stats reveal reveal-3">
            <div>
              <dt>{count}</dt>
              <dd>algorithms</dd>
            </div>
            <div>
              <dt>2</dt>
              <dd>languages, line by line</dd>
            </div>
            <div>
              <dt>3</dt>
              <dd>practice games</dd>
            </div>
          </dl>
        </div>
        <HeroPreview />
      </section>

      <section className="section">
        <SectionHead
          title="How the mentor decides"
          text="Six stages. The AI writes and plans; plain rules check every pick before you see it."
          action={
            <a className="btn" href="#/mentor">
              Ask the mentor <Icon name="arrow" size={12} />
            </a>
          }
        />
        <div className="pipeline">
          {PIPE.map(([t, d, ai], i) => (
            <div key={t} className="pipe-step">
              <div className="pipe-top">
                <span className="n mono">0{i + 1}</span>
                <span className={`tag ${ai ? 'ai' : ''}`}>{ai ? 'AI' : 'Rules'}</span>
              </div>
              <h4>{t}</h4>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <SectionHead
          title="Start with these"
          text="A path through the classics. Each opens a step-by-step visualizer."
          action={
            <a className="btn" href="#/explore">
              All {count} algorithms <Icon name="arrow" size={12} />
            </a>
          }
        />
        <div className="algo-grid featured">
          {FEATURED.map((id) => (
            <AlgoCard key={id} id={id} />
          ))}
        </div>
      </section>

      <section className="section">
        <SectionHead title="Practice" text="Short games that check whether you can run the algorithm in your head." />
        <PracticeCards />
      </section>
    </div>
  )
}

export function PracticeCards({ stats }) {
  return (
    <div className="grid-3">
      {PRACTICE.map(([href, t, d, icon, cat]) => {
        const s = stats?.[href.split('/').pop()]
        return (
          <a key={href} className="algo-card" href={href} style={{ '--cat': cat }}>
            <span className="card-icon">
              <Icon name={icon} size={18} />
            </span>
            <h3>{t}</h3>
            <p>{d}</p>
            <div className="foot">
              <span className="subtle">{stats ? (s ? `Played ${s.played}× · ${s.total ? Math.round((100 * s.right) / s.total) : 0}% correct` : 'Not played yet') : ''}</span>
              <span className="go">
                Play <Icon name="arrow" size={12} />
              </span>
            </div>
          </a>
        )
      })}
    </div>
  )
}

export function ExplorePage() {
  return (
    <div>
      <div className="page-head">
        <div className="page-head-main">
          <span className="eyebrow">Visualizers</span>
          <h1>Pick an algorithm to explore</h1>
          <p className="page-sub">Filter by topic or level, or use the search box at the top.</p>
        </div>
      </div>
      <ExploreGrid />
    </div>
  )
}
