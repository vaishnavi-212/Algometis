// The core agent loop: THINK (LLM) → ACT (tool) → OBSERVE (result) → repeat.
// Used by both the solve-executor and the tutor.

import { T } from './trace.js'
import { jsonSafe } from '../../shared/util.js'

/**
 * @param {object} o
 * @param {object} o.llm         LLM client
 * @param {string} o.system      system prompt
 * @param {Array}  o.messages    conversation so far (internal format)
 * @param {Array}  o.tools       tool definitions
 * @param {object} o.handlers    { toolName: async (args) => result }
 * @param {number} o.maxTurns    guardrail on LLM calls
 * @param {string} o.node        name used in the trace
 * @param {string} [o.stopTool]  calling this tool ends the loop
 * @param {string} [o.purpose]   for the offline mock
 * @param {function} [o.hint]    () => hint object for the offline mock
 */
export async function runToolLoop({ llm, system, messages, tools, handlers, maxTurns, node, stopTool, purpose, hint }) {
  const msgs = [...messages]
  const trace = []
  let finalText = ''
  for (let turn = 1; turn <= maxTurns; turn++) {
    const res = await llm.chat({ system, messages: msgs, tools, toolChoice: 'auto', purpose, hint: hint ? hint() : undefined })
    msgs.push({ role: 'assistant', content: res.text || '', toolCalls: res.toolCalls })
    if (res.text) trace.push(T.llm(node, `Thinks (turn ${turn}${res.label ? ` · ${res.isMock ? 'offline rules' : res.label}` : ''})`, res.text))
    if (!res.toolCalls?.length) {
      finalText = res.text
      return { messages: msgs, trace, turns: turn, finalText, stopped: false }
    }
    let stop = false
    for (const tc of res.toolCalls) {
      trace.push(T.call(node, tc.name, tc.args))
      let result
      let ok = true
      if (tc.args && tc.args.__invalidJson) {
        result = { error: 'Your tool arguments were not valid JSON. Send valid JSON matching the schema.' }
        ok = false
      } else if (!handlers[tc.name]) {
        result = { error: `Unknown tool "${tc.name}". Available: ${Object.keys(handlers).join(', ')}` }
        ok = false
      } else {
        try {
          result = await handlers[tc.name](tc.args || {})
          if (result && result.error) ok = false
        } catch (e) {
          result = { error: e.message }
          ok = false
        }
      }
      const safe = jsonSafe(result)
      trace.push(T.result(node, tc.name, safe, ok))
      msgs.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: JSON.stringify(safe) })
      if (stopTool && tc.name === stopTool && ok) stop = true
    }
    if (stop) return { messages: msgs, trace, turns: turn, finalText, stopped: true }
  }
  trace.push(T.error(node, `Stopped after ${maxTurns} turns (guardrail)`, 'The loop hit its maximum number of LLM calls.'))
  return { messages: msgs, trace, turns: maxTurns, finalText, stopped: false, exhausted: true }
}
