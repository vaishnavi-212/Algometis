// Provider adapters. Internally the agent always uses ONE message format:
//   { role: 'user', content }
//   { role: 'assistant', content, toolCalls: [{ id, name, args }] }
//   { role: 'tool', toolCallId, name, content }
// and every adapter returns { text, toolCalls, raw }.
// Tools are { name, description, parameters (JSON Schema) }.

let idCounter = 0
const newId = () => `call_${Date.now().toString(36)}_${(idCounter++).toString(36)}`

export class LLMError extends Error {
  constructor(message, status, body, retryAfterMs) {
    super(message)
    this.status = status
    this.body = body
    this.retryAfterMs = retryAfterMs
  }
}

// "Retry-After: 20" (seconds) or an HTTP date; Gemini also puts "retryDelay": "17s" in the body.
function retryAfter(res, text) {
  const h = res.headers?.get?.('retry-after')
  if (h) {
    const n = Number(h)
    if (!Number.isNaN(n)) return n * 1000
    const d = Date.parse(h)
    if (!Number.isNaN(d)) return Math.max(0, d - Date.now())
  }
  const m = /retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/.exec(text || '')
  return m ? Number(m[1]) * 1000 : undefined
}

async function postJSON(url, headers, body, { timeoutMs = 60000, retries = 2, fetchImpl = fetch } = {}) {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctrl.signal })
      const text = await res.text()
      let json
      try {
        json = JSON.parse(text)
      } catch {
        json = null
      }
      if (res.ok && json) return json
      const err = new LLMError(`LLM HTTP ${res.status}: ${(json?.error?.message || text || '').slice(0, 300)}`, res.status, json || text, retryAfter(res, text))
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        lastErr = err
        await new Promise((r) => setTimeout(r, 800 * 2 ** attempt))
        continue
      }
      throw err
    } catch (e) {
      if (e instanceof LLMError) throw e
      lastErr = new LLMError(e.name === 'AbortError' ? 'LLM request timed out' : `LLM request failed: ${e.message}`, 0)
      if (attempt < retries) await new Promise((r) => setTimeout(r, 800 * 2 ** attempt))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr
}

function parseArgs(raw) {
  if (raw && typeof raw === 'object') return raw
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return { __invalidJson: String(raw).slice(0, 500) }
  }
}

// ---------------- OpenAI-compatible (OpenAI, Gemini, Groq, OpenRouter, Ollama) ----------------
export function createOpenAICompatible({ baseURL, apiKey, model, label, fetchImpl, retries = 2, timeoutMs = 60000 }) {
  const toWire = (system, messages) => [
    { role: 'system', content: system },
    ...messages.map((m) => {
      if (m.role === 'assistant')
        return {
          role: 'assistant',
          content: m.content || null,
          ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) } })) } : {}),
        }
      if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
      return { role: 'user', content: m.content }
    }),
  ]
  const choiceToWire = (toolChoice) => {
    if (!toolChoice || toolChoice === 'auto') return 'auto'
    if (toolChoice === 'required') return 'required'
    return { type: 'function', function: { name: toolChoice.name } }
  }
  return {
    label,
    model,
    async chat({ system, messages, tools = [], toolChoice = 'auto', temperature = 0.2, maxTokens = 2000 }) {
      const body = { model, messages: toWire(system, messages), temperature, max_tokens: maxTokens }
      if (tools.length) {
        body.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
        body.tool_choice = choiceToWire(toolChoice)
      }
      const headers = apiKey ? { authorization: `Bearer ${apiKey}` } : {}
      let json
      try {
        json = await postJSON(`${baseURL.replace(/\/$/, '')}/chat/completions`, headers, body, { fetchImpl, retries, timeoutMs })
      } catch (e) {
        // Some OpenAI-compatible servers reject a *named* tool_choice; fall back to "required".
        if (e.status === 400 && typeof body.tool_choice === 'object') {
          body.tool_choice = 'required'
          json = await postJSON(`${baseURL.replace(/\/$/, '')}/chat/completions`, headers, body, { fetchImpl, retries, timeoutMs })
        } else throw e
      }
      const msg = json.choices?.[0]?.message || {}
      const toolCalls = (msg.tool_calls || []).map((tc) => ({ id: tc.id || newId(), name: tc.function?.name, args: parseArgs(tc.function?.arguments) }))
      return { text: msg.content || '', toolCalls, usage: json.usage, raw: json }
    },
  }
}

// ---------------- Anthropic Messages API ----------------
export function createAnthropic({ baseURL, apiKey, model, label, fetchImpl, retries = 2, timeoutMs = 60000 }) {
  const toWire = (messages) => {
    const out = []
    const push = (role, blocks) => {
      const last = out[out.length - 1]
      if (last && last.role === role) last.content.push(...blocks)
      else out.push({ role, content: [...blocks] })
    }
    for (const m of messages) {
      if (m.role === 'assistant') {
        const blocks = []
        if (m.content) blocks.push({ type: 'text', text: m.content })
        for (const tc of m.toolCalls || []) blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args ?? {} })
        if (blocks.length) push('assistant', blocks)
      } else if (m.role === 'tool') push('user', [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }])
      else push('user', [{ type: 'text', text: m.content }])
    }
    return out
  }
  return {
    label,
    model,
    async chat({ system, messages, tools = [], toolChoice = 'auto', temperature = 0.2, maxTokens = 2000 }) {
      const body = { model, system, messages: toWire(messages), max_tokens: maxTokens, temperature }
      if (tools.length) {
        body.tools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }))
        body.tool_choice = toolChoice === 'required' ? { type: 'any' } : toolChoice && toolChoice.name ? { type: 'tool', name: toolChoice.name } : { type: 'auto' }
      }
      const json = await postJSON(`${baseURL.replace(/\/$/, '')}/messages`, { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body, { fetchImpl, retries, timeoutMs })
      const blocks = json.content || []
      return {
        text: blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n'),
        toolCalls: blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, args: b.input || {} })),
        usage: json.usage,
        raw: json,
      }
    },
  }
}
