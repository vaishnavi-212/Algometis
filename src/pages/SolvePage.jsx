import React, { useMemo, useState } from 'react'
import { api } from '../api.js'
import { Kicker } from '../components/ui.jsx'

const STARTER = `#include <stdio.h>\n\nvoid bubbleSort(int a[], int n) {\n    for (int i = 0; i < n - 1; i++) {\n        for (int j = 0; j < n - i - 1; j++) {\n            if (a[j] > a[j + 1]) {\n                int temp = a[j];\n                a[j] = a[j + 1];\n                a[j + 1] = temp;\n            }\n        }\n    }\n}\n\nint main(void) {\n    int a[] = {64, 25, 12, 22, 11};\n    int n = sizeof(a) / sizeof(a[0]);\n    bubbleSort(a, n);\n    for (int i = 0; i < n; i++) printf("%d ", a[i]);\n    return 0;\n}`

function MetricCard({ item }) {
  const tone = item.confidence === 'high' ? 'good' : item.confidence === 'low' ? 'caution' : ''
  return <article className="review-metric">
    <div className="review-metric-top"><strong>{item.name}</strong><span className={`confidence ${tone}`}>{item.confidence} confidence</span></div>
    <div className="review-metric-value">{item.value}</div>
    <p>{item.method}</p>
  </article>
}

export function SolvePage() {
  const [question, setQuestion] = useState('Write a C program to sort n numbers in ascending order.')
  const [code, setCode] = useState(STARTER)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('overview')
  const [showAll, setShowAll] = useState(true)
  const ready = question.trim().length > 0 && code.trim().length > 0
  const analyze = async () => {
    if (!ready || busy) return
    setBusy(true); setError(''); setResult(null)
    try { setResult(await api.analyzeCode(question, code)); setTab('overview') }
    catch (e) { setError(e.message || 'Analysis failed. Please try again.') }
    finally { setBusy(false) }
  }
  const visibleMetrics = useMemo(() => showAll ? result?.metrics || [] : (result?.metrics || []).slice(0, 5), [result, showAll])

  return <div className="code-review-page">
    <div className="review-hero">
      <div><Kicker>ALGOMETIS · STUDENT CODE REVIEW</Kicker><h1>Bring your code.<br/><span>We'll inspect the thinking.</span></h1><p>Submit the assignment question and your C solution. AlgoMetis identifies the likely algorithm, reviews its structure, evaluates 15 metrics and compares it with stronger alternatives.</p></div>
      <div className="review-hero-chip"><span className="pulse-dot"/> <span>Prototype · C language</span><b>15 metrics</b></div>
    </div>

    <section className="review-input-grid">
      <div className="review-panel">
        <div className="review-panel-head"><div><span className="step-index">01</span><div><h2>Assignment question</h2><p>What did your lecturer ask you to solve?</p></div></div><span className="panel-tag">NATURAL LANGUAGE</span></div>
        <textarea className="review-question" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Paste the complete assignment question here..." rows={6}/>
        <div className="review-hint">Include constraints such as input size, sorted/unsorted data, memory limits or stability requirements.</div>
      </div>
      <div className="review-panel code-panel">
        <div className="review-panel-head"><div><span className="step-index">02</span><div><h2>Your C solution</h2><p>Paste or edit the code you wrote.</p></div></div><span className="language-pill">C <span>⌄</span></span></div>
        <div className="editor-toolbar"><span><i/> main.c</span><span>Editable source</span><button onClick={()=>setCode(STARTER)}>Reset example</button></div>
        <textarea spellCheck="false" autoCapitalize="off" autoCorrect="off" className="review-code" value={code} onChange={e=>setCode(e.target.value)} placeholder="// Write or paste your C code here..." rows={18}/>
        <div className="editor-foot"><span>{code.split('\n').length} lines</span><span>{code.length.toLocaleString()} characters</span></div>
      </div>
    </section>

    <div className="review-action-row"><div><strong>Ready for a code review?</strong><span>Five specialized analysis stages · Static C inspection · No code execution</span></div><button className="btn cyan review-run" onClick={analyze} disabled={!ready || busy}>{busy ? <><span className="spinner"/> Reviewing…</> : 'Analyze my code →'}</button></div>
    {error && <div className="banner warn">{error}</div>}
    {busy && <div className="agent-progress">{['Assignment understanding','C code analysis','15-metric evaluation','Algorithm comparison','Critic and validation'].map((x,i)=><div key={x}><span className="spinner"/><span>{x}</span></div>)}</div>}

    {result && <section className="review-results" aria-live="polite">
      <div className="results-title"><div><Kicker>ANALYSIS COMPLETE</Kicker><h2>Your code, decoded.</h2><p>Here is what the system found and how your implementation compares.</p></div><span className="result-status">✓ Analysis ready</span></div>
      <div className="agent-strip">{result.agents.map((a,i)=><div key={a.name}><span className="agent-number">0{i+1}</span><div><strong>{a.name}</strong><small>{a.detail}</small></div><span className="agent-done">✓</span></div>)}</div>
      <div className="review-tabs">{[['overview','Overview'],['metrics','15 metrics'],['alternatives','Alternatives'],['issues','Code observations']].map(([id,label])=><button className={tab===id?'active':''} onClick={()=>setTab(id)} key={id}>{label}</button>)}</div>
      {tab==='overview' && <div className="review-overview-grid">
        <article className="review-panel detected-card"><Kicker>DETECTED IN YOUR CODE</Kicker><h3>{result.detected.name}</h3><p>{result.detected.confidence} identification · {result.assignment.category}</p><div className="complexity-pair"><div><small>Time complexity</small><b>{result.metrics[0].value}</b></div><div><small>Auxiliary space</small><b>{result.metrics[1].value}</b></div></div></article>
        <article className="review-panel best-card"><Kicker>RECOMMENDED ALTERNATIVE</Kicker><h3>{result.recommendation.name}</h3><p>{result.recommendation.reason}</p><div className="best-chips"><span>Time: {result.recommendation.avg}</span><span>Space: {result.recommendation.space}</span><span>{result.recommendation.stable?'Stable':'Not stable'}</span></div></article>
        <article className="review-panel summary-card"><Kicker>AGENT SUMMARY</Kicker><p>{result.summary}</p></article>
      </div>}
      {tab==='metrics' && <><div className="metrics-grid">{visibleMetrics.map(m=><MetricCard item={m} key={m.name}/>)}</div><button className="btn sm ghost" onClick={()=>setShowAll(v=>!v)}>{showAll?'Show key metrics':'Show all 15 metrics'}</button></>}
      {tab==='alternatives' && <div className="alternatives-grid">{result.alternatives.map(a=><article className={`review-metric ${a.id===result.recommendation.id?'recommended':''}`} key={a.id}><div className="review-metric-top"><strong>{a.name}</strong>{a.id===result.recommendation.id&&<span className="confidence good">Recommended</span>}</div><div className="alt-complexity"><span>Best {a.best}</span><span>Average {a.avg}</span><span>Worst {a.worst}</span><span>Space {a.space}</span></div><p>{a.suitability}</p></article>)}</div>}
      {tab==='issues' && <div className="review-panel issue-list">{result.issues.length ? result.issues.map((x,i)=><p key={i}>⚠ {x}</p>) : <p>No obvious heuristic warnings found. This does not replace compiler diagnostics or testing.</p>}<h3>Analysis boundaries</h3>{result.limitations.map((x,i)=><p className="muted" key={i}>{i+1}. {x}</p>)}</div>}
      <div className="review-disclaimer"><strong>Interpret metrics responsibly.</strong> Static source inspection can infer patterns, but it cannot measure the submitted program's actual runtime, peak memory or CPU cache misses. Those require a controlled compile-and-benchmark environment. This prototype labels estimates and unavailable hardware counters instead of inventing measurements.</div>
    </section>}
  </div>
}
