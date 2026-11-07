// Step player for a list of pre-computed snapshots.
// State lives in one reducer so every control (play, step, seek, speed) is a single, predictable transition.

import { useEffect, useMemo, useReducer } from 'react'

const clamp = (i, last) => Math.max(0, Math.min(last, i))

function reducer(state, action) {
  const last = Math.max(0, state.total - 1)
  switch (action.type) {
    case 'load':
      return { ...state, total: action.total, index: 0, playing: false }
    case 'tick':
      return state.index >= last ? { ...state, playing: false } : { ...state, index: state.index + 1 }
    case 'play':
      return { ...state, playing: true, index: state.index >= last ? 0 : state.index }
    case 'pause':
      return { ...state, playing: false }
    case 'seek':
      return { ...state, playing: false, index: clamp(action.index, last) }
    case 'speed':
      return { ...state, speed: action.speed }
    default:
      return state
  }
}

export function useStepPlayback(steps, { baseDelay = 900 } = {}) {
  const [state, dispatch] = useReducer(reducer, { index: 0, playing: false, speed: 1, total: steps.length })

  // a new run (new data or algorithm) starts again from the first snapshot
  useEffect(() => {
    dispatch({ type: 'load', total: steps.length })
  }, [steps])

  useEffect(() => {
    if (!state.playing) return undefined
    const id = setTimeout(() => dispatch({ type: 'tick' }), baseDelay / state.speed)
    return () => clearTimeout(id)
  }, [state.playing, state.index, state.speed, baseDelay])

  const controls = useMemo(
    () => ({
      play: () => dispatch({ type: 'play' }),
      pause: () => dispatch({ type: 'pause' }),
      next: () => dispatch({ type: 'seek', index: state.index + 1 }),
      prev: () => dispatch({ type: 'seek', index: state.index - 1 }),
      goTo: (i) => dispatch({ type: 'seek', index: i }),
      setSpeed: (s) => dispatch({ type: 'speed', speed: s }),
    }),
    [state.index]
  )

  const total = steps.length
  const index = clamp(state.index, Math.max(0, total - 1))
  return { index, step: steps[index] || null, total, playing: state.playing, speed: state.speed, isLast: index >= total - 1, ...controls }
}
