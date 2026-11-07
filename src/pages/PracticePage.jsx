import React, { useState } from 'react'
import { ALGORITHMS, CATEGORIES } from '../../shared/registry.js'
import { PredictGame } from '../practice/PredictGame.jsx'
import { GuessGame, FitsGame } from '../practice/Games.jsx'
import { loadStats } from '../practice/stats.js'
import { Kicker } from '../components/ui.jsx'
import { PracticeCards } from './HomePage.jsx'

const GAMES = [
  ['predict', 'Predict the next step', 'Before each step is revealed, guess which line runs next or what happens. Trains you to “run the code in your head”.', 'target'],
  ['guess', 'Guess the algorithm', 'A mystery animation plays with the name and code hidden. Recognise the algorithm from how the data moves.', 'eye'],
  ['fits', 'Which algorithm fits?', 'Random real-world constraints. Choose the best algorithm; the answer is checked by the same rules the AI agent uses.', 'route'],
]

function PredictPicker() {
  const [algo, setAlgo] = useState('bubble_sort')
  return (
    <div className="stack">
      <div className="card pad row">
        <Kicker>Algorithm</Kicker>
        <select className="text" style={{ width: 280 }} value={algo} onChange={(e) => setAlgo(e.target.value)} aria-label="Algorithm">
          {CATEGORIES.map((c) => (
            <optgroup key={c.id} label={c.label}>
              {Object.entries(ALGORITHMS)
                .filter(([, a]) => a.category === c.id)
                .map(([id, a]) => (
                  <option key={id} value={id}>
                    {a.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <span className="tiny subtle">Uses the algorithm’s sample data. To predict on your own data, open the visualizer and switch to the Predict tab.</span>
      </div>
      <PredictGame key={algo} algoId={algo} input={ALGORITHMS[algo].sample} />
    </div>
  )
}

export function PracticePage({ game }) {
  const stats = loadStats()
  const current = GAMES.find((g) => g[0] === game)
  return (
    <div className="stack">
      <div className="page-head">
        <div className="page-head-main">
          {current ? (
            <nav className="crumbs" aria-label="Breadcrumb">
              <a href="#/practice">Practice</a>
              <span>/</span>
              <span>{current[1]}</span>
            </nav>
          ) : (
            <span className="eyebrow">Practice</span>
          )}
          <h1>{current ? current[1] : 'Games & challenges'}</h1>
          <p className="page-sub">{current ? current[2] : 'Short games that check whether you can run an algorithm in your head.'}</p>
        </div>
      </div>
      {!current && <PracticeCards stats={stats} />}
      {game === 'predict' && <PredictPicker />}
      {game === 'guess' && <GuessGame />}
      {game === 'fits' && <FitsGame />}
    </div>
  )
}
