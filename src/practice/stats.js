// Per-browser practice stats (best scores, streaks, games played). Works without storage too.
const KEY = 'algometis.practice'
let memory = {}

export function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return memory
  }
}

export function recordGame(game, { right = 0, total = 0, best = 0 }) {
  const all = loadStats()
  const s = all[game] || { played: 0, right: 0, total: 0, bestStreak: 0 }
  s.played++
  s.right += right
  s.total += total
  s.bestStreak = Math.max(s.bestStreak, best)
  all[game] = s
  memory = all
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* storage unavailable */
  }
  return all
}
