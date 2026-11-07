import React, { useEffect, useState } from 'react'
import { api } from './api.js'
import { initialLook, applyLook } from './theme.js'
import { Navbar, Footer } from './components/Navbar.jsx'
import { HomePage, ExplorePage } from './pages/HomePage.jsx'
import { SolvePage } from './pages/SolvePage.jsx'
import { VisualizePage } from './pages/VisualizePage.jsx'
import { PracticePage } from './pages/PracticePage.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'

function useHashRoute() {
  const parse = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const on = () => {
      setRoute(parse())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export function App() {
  const route = useHashRoute()
  const [look, setLook] = useState(initialLook)
  const [health, setHealth] = useState(null)
  const [solveStore, setSolveStore] = useState({ threadId: null, messages: [], result: null, awaiting: false })

  useEffect(() => {
    applyLook(look)
  }, [look])
  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null))
  }, [])

  const [page = 'home', ...params] = route
  let content
  let nav = page
  if (page === 'mentor' || page === 'solve') {
    nav = 'mentor'
    content = <SolvePage store={solveStore} setStore={setSolveStore} health={health} />
  } else if (page === 'explore' || page === 'learn') {
    nav = 'explore'
    content = <ExplorePage />
  } else if (page === 'visualize') {
    nav = 'explore'
    content = <VisualizePage algoId={params[0]} mode={params[1] || 'solo'} withId={params[2]} />
  } else if (page === 'practice') content = <PracticePage game={params[0]} />
  else {
    nav = 'home'
    content = <HomePage />
  }

  return (
    <>
      <Navbar page={nav} look={look} onLook={setLook} health={health} />
      <main>
        <ErrorBoundary level="page" name="page" resetKey={route.join('/')}>
          {content}
        </ErrorBoundary>
      </main>
      <Footer />
    </>
  )
}
