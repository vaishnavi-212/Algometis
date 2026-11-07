import React from 'react'

const NODE_LABEL = {
  memory: 'Memory',
  router: 'Router',
  analyzer: 'Analyzer',
  clarify: 'Clarify (asked you)',
  executor: 'Planner / executor (tool loop)',
  critic: 'Critic',
  repair: 'Repair',
  explainer: 'Explainer',
  finalize: 'Finalize',
  refuse: 'Guardrail',
  concept: 'Concept answer',
  unmatched: 'No match',
  tutor: 'Tutor',
}

const KIND_LABEL = { tool_call: 'tool call', tool_result: 'result', llm: 'LLM', decision: 'decision', check: 'check', interrupt: 'paused', memory: 'memory', error: 'error' }

export function TracePanel({ trace }) {
  const groups = []
  for (const t of trace) {
    const last = groups[groups.length - 1]
    if (last && last.node === t.node) last.items.push(t)
    else groups.push({ node: t.node, items: [t] })
  }
  return (
    <div className="trace">
      <p className="tiny muted">Every thought, tool call, result and check, in order. Click an item to see the exact data.</p>
      {groups.map((g, gi) => (
        <div key={gi}>
          <div className="trace-node">{NODE_LABEL[g.node] || g.node}</div>
          {g.items.map((t, i) => (
            <details key={i} className="trace-item">
              <summary>
                <span className={`kind ${t.kind} ${t.ok === false ? 'bad' : ''}`}>{KIND_LABEL[t.kind] || t.kind}</span>
                <span>{t.title}</span>
              </summary>
              {t.detail && <pre>{prettify(t.detail)}</pre>}
            </details>
          ))}
        </div>
      ))}
    </div>
  )
}

function prettify(s) {
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}
