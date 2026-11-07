import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { Kicker } from '../components/ui.jsx'

const SUGGESTIONS = ['Why is this step happening?', 'What does the current line do?', 'What if the data was already sorted?', 'Show me the step where the answer is found']

export function TutorPanel({ algoId, input, stepIndex, onJump, onLoadInput }) {
  const [log, setLog] = useState([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef(null)
  useEffect(() => {
    // scroll only the chat box, never the whole page
    const box = end.current?.parentElement
    if (box) box.scrollTop = box.scrollHeight
  }, [log])
  useEffect(() => {
    setLog([])
  }, [algoId])

  const ask = async (question) => {
    const text = (question ?? q).trim()
    if (!text || busy) return
    setQ('')
    setLog((l) => [...l, { role: 'student', text }])
    setBusy(true)
    try {
      const r = await api.tutor({ algoId, input, stepIndex, question: text, history: log.slice(-6) })
      for (const a of r.actions || []) {
        if (a.type === 'jump') onJump(a.index)
        if (a.type === 'load_input') onLoadInput(a.input)
      }
      const tools = (r.trace || []).filter((t) => t.kind === 'tool_call').map((t) => t.tool)
      setLog((l) => [...l, { role: 'tutor', text: r.answer, tools }])
    } catch (e) {
      setLog((l) => [...l, { role: 'tutor', text: `Sorry, the tutor failed: ${e.message}`, tools: [] }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card tutor" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="panel-h tutor-head">
        <Kicker>AI tutor</Kicker>
        <span className="hint">reads the real step data, can jump or re-run</span>
      </div>
      <div className="chat-log tutor-log">
        {log.length === 0 && (
          <div className="gallery">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => ask(s)}>
                <span className="g-text">{s}</span>
              </button>
            ))}
          </div>
        )}
        {log.map((m, i) => (
          <div key={i} className={`bubble ${m.role === 'student' ? 'me' : 'agent'}`}>
            {m.text}
            {m.tools?.length > 0 && <div className="tiny subtle" style={{ marginTop: 6 }}>tools used: {m.tools.join(' → ')}</div>}
          </div>
        ))}
        {busy && (
          <div className="working">
            <span className="spinner" /> Tutor is checking the steps…
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="chat-input">
        <textarea data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" className="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Ask about step ${stepIndex + 1}…`} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), ask())} rows={1} />
        <button className="btn cyan" onClick={() => ask()} disabled={busy || !q.trim()}>
          Ask
        </button>
      </div>
    </div>
  )
}
