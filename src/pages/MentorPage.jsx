import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { RecommendationCard } from '../components/RecommendationCard.jsx'
import { TracePanel } from '../components/TracePanel.jsx'
import { Kicker, Icon } from '../components/ui.jsx'

export const EXAMPLES = [
  { title: 'Food delivery routes', text: 'I run a cloud kitchen and need the fastest route from the kitchen to the station. Kitchen to Market 4 min, Kitchen to Park 2 min, Park to Market 1 min, Market to School 5 min, School to Station 6 min, Park to Mall 10 min, Mall to Station 2 min.' },
  { title: 'Wi-Fi cable between hostels', text: 'Connect all our hostels with the least total cable: H1-H2 70, H1-H3 50, H2-H3 80, H2-H4 90, H3-H4 70, H4-H5 60, H3-H5 150, H4-H6 80, H5-H6 90 (metres).' },
  { title: 'Course prerequisites', text: 'Order my courses: Maths I before Maths II, Programming before Data Structures, Data Structures before Algorithms and DBMS, and ML needs Maths II and Algorithms.' },
  { title: 'Seminar hall bookings', text: 'The seminar hall has these requests: Quiz 9-10, Debate 9:30-11, Talk 10-11:30, Workshop 11-1pm, Demo 11:30-12:30, Panel 12:30-2pm. Fit the most events without overlap.' },
  { title: 'Packing a trip bag', text: 'I have a 10 kg bag. Laptop 5 kg value 10, camera 4 kg value 40, jacket 6 kg value 30, book 3 kg value 50. Items cannot be split. Maximise the value.' },
  { title: 'Ranking students', text: 'Rank 5000 students by exam score; students with equal scores must stay in roll-number order. Sample: Asha 72, Ben 45, Chen 88, Dev 31, Eva 64, Farah 72.' },
  { title: 'Cashback trip costs', text: 'Cheapest way from Home to Office, one-way roads, some give cashback: Home to Mall 60, Home to Cafe 70, Mall to Bank 50, Cafe to Bank -30, Mall to Office -40, Bank to Office 20 (rupees).' },
  { title: 'Roll number lookup', text: 'In the attendance list 34, 7, 23, 32, 5, 62, 42, 15 find roll number 42.' },
  { title: 'DNA similarity', text: 'How similar are the DNA fragments "AGGTAB" and "GXTXAYB"? Find their longest common subsequence.' },
  { title: 'Canteen tokens', text: 'Our canteen has tokens worth 1, 3 and 4. What is the fewest number of tokens to give change of 6?' },
]

const newThread = () => `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`

export function SolvePage({ store, setStore, health }) {
  const { threadId, messages, result, awaiting } = store
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const logEnd = useRef(null)
  useEffect(() => {
    // scroll only the chat box, never the whole page
    const box = logEnd.current?.parentElement
    if (box && (messages.length || busy)) box.scrollTop = box.scrollHeight
  }, [messages, busy])

  const send = async (msg) => {
    const m = (msg ?? text).trim()
    if (!m || busy) return
    setText('')
    const tid = awaiting ? threadId : newThread()
    setStore((s) => ({ ...s, threadId: tid, messages: [...(awaiting ? s.messages : []), { role: 'me', text: m }], result: awaiting ? s.result : null }))
    setBusy(true)
    try {
      const r = await api.solve(tid, m)
      if (r.status === 'clarify') {
        setStore((s) => ({ ...s, awaiting: true, messages: [...s.messages, { role: 'agent', text: r.message, q: true }], partialTrace: r.trace }))
      } else {
        setStore((s) => ({ ...s, awaiting: false, messages: [...s.messages, { role: 'agent', text: r.message.replace(/\*\*/g, '') }], result: r }))
      }
    } catch (e) {
      setStore((s) => ({ ...s, awaiting: false, messages: [...s.messages, { role: 'agent', text: `Something went wrong: ${e.message}` }] }))
    } finally {
      setBusy(false)
    }
  }

  const reset = () => setStore({ threadId: null, messages: [], result: null, awaiting: false })

  return (
    <div className="solve">
      <div className="card chat">
        <div className="card-h" style={{ paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          <div>
            <Kicker>AI mentor</Kicker>
            <h3 style={{ fontSize: 16, marginTop: 4 }}>Describe your problem</h3>
          </div>
          <span className="grow" />
          {messages.length > 0 && (
            <button className="btn sm ghost" onClick={reset}>
              New problem
            </button>
          )}
        </div>
        <div className="chat-log">
          {messages.length === 0 && (
            <>
              <p className="muted tiny" style={{ margin: 0 }}>
                Tell me a real-world situation in plain words, with your own names and numbers. I’ll pick the best algorithm, show you <em>why</em>, and visualize it on your data. Try one:
              </p>
              <div className="gallery">
                {EXAMPLES.map((ex) => (
                  <button key={ex.title} onClick={() => send(ex.text)}>
                    <div className="g-title">{ex.title}</div>
                    <div className="g-text">{ex.text}</div>
                  </button>
                ))}
              </div>
            </>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role === 'me' ? 'me' : 'agent'} ${m.q ? 'q' : ''}`}>
              <span className="who">{m.role === 'me' ? 'You' : m.q ? 'Agent needs one detail' : 'Agent'}</span>
              {m.text}
            </div>
          ))}
          {busy && (
            <div className="working">
              <span className="spinner" /> Agent working (memory → router → analyzer → tools → critic → explainer)…
            </div>
          )}
          <div ref={logEnd} />
        </div>
        <div className="chat-input">
          <textarea data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" className="text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())} placeholder={awaiting ? 'Answer the question above…' : 'e.g. fastest route between 5 places, travel time in minutes'} rows={2} />
          <button className="btn cyan" onClick={() => send()} disabled={busy || !text.trim()}>
            Send
          </button>
        </div>
      </div>

      <div className="stack">
        {health?.offlineDemo && (
          <div className="banner warn">
            <strong>Offline demo mode:</strong> no AI key is configured, so rule-based stand-ins play the AI parts. They still read your names and numbers, but phrasing must be simple. Add free keys (<code>GEMINI_API_KEY</code>, <code>GROQ_API_KEY</code>, …) to <code>.env</code> and restart; every key becomes an automatic backup.
          </div>
        )}
        {!health?.offlineDemo && health?.llm && health.llm.mode !== 'online' && (
          <div className="banner warn">
            <strong>All AI providers are busy or unreachable right now</strong> (limits or errors). Answers use offline rules until one recovers; this is retried automatically. Open the AI status menu at the top for details.
          </div>
        )}
        {result?.status === 'done' && <RecommendationCard rec={result.recommendation} trace={result.trace} path={result.path} />}
        {result && result.status !== 'done' && (
          <div className="card">
            <div className="card-b stack" style={{ paddingTop: 16 }}>
              <div>{result.message}</div>
              {result.suggestAlgorithm && (
                <a className="btn sm" href={`#/visualize/${result.suggestAlgorithm}`} style={{ alignSelf: 'flex-start' }}>
                  Open the visualizer
                </a>
              )}
              <details>
                <summary className="tiny muted">How I decided</summary>
                <TracePanel trace={result.trace || []} />
              </details>
            </div>
          </div>
        )}
        {!result && (
          <div className="card empty-state">
            <div>
              <h2>From a real problem to the right algorithm</h2>
              <p className="muted small">Every recommendation comes with the rules it was scored on, measurements on your own data, and the full agent trace. Purple = LLM step, grey = deterministic code.</p>
              <div className="flow">
                {[
                  ['memory', 0],
                  ['router', 1],
                  ['analyzer', 1],
                  ['clarify?', 0],
                  ['story parser', 0],
                  ['planner + tools', 1],
                  ['critic', 0],
                  ['explainer + fact-check', 1],
                ].map(([s, ai]) => (
                  <span key={s} className={ai ? 'ai' : ''}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
