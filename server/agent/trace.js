// Every decision the agent makes is recorded as a trace entry and shown in the UI
// ("How I decided"). Nothing is hidden.

const clip = (v, n = 1500) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s && s.length > n ? `${s.slice(0, n)}… (${s.length - n} more chars)` : s
}

export function traceEntry(node, kind, title, detail, extra = {}) {
  return { node, kind, title, detail: detail === undefined ? undefined : clip(detail), at: Date.now(), ...extra }
}

// kinds: 'decision' | 'llm' | 'tool_call' | 'tool_result' | 'check' | 'interrupt' | 'memory' | 'error'
export const T = {
  decision: (node, title, detail) => traceEntry(node, 'decision', title, detail),
  llm: (node, title, detail) => traceEntry(node, 'llm', title, detail),
  call: (node, name, args) => traceEntry(node, 'tool_call', `Calls ${name}`, args, { tool: name }),
  result: (node, name, result, ok = true) => traceEntry(node, 'tool_result', `${name} → ${ok ? 'ok' : 'error'}`, result, { tool: name, ok }),
  check: (node, title, detail, ok) => traceEntry(node, 'check', title, detail, { ok }),
  interrupt: (node, title, detail) => traceEntry(node, 'interrupt', title, detail),
  memory: (node, title, detail) => traceEntry(node, 'memory', title, detail),
  error: (node, title, detail) => traceEntry(node, 'error', title, detail),
}
