// npm run check-llm
// Sends one tiny tool-calling request to every entry of the AI backup chain and prints which ones work.
// (The agent needs tool calling, so this tests exactly that.) Uses 1 request per entry.
import { config, PROVIDERS } from '../server/config.js'
import { createOpenAICompatible, createAnthropic } from '../server/llm/providers.js'
import { classifyError } from '../server/llm/router.js'

const chain = config.llmChain
if (!chain.length) {
  console.log('\nNo AI providers configured, so the app runs in offline mode.')
  console.log('Add at least one free key to .env (copy .env.example). Free keys:')
  for (const [name, p] of Object.entries(PROVIDERS)) if (p.signup) console.log(`  ${p.keyEnv.padEnd(20)} ${p.signup}`)
  process.exit(0)
}

const tool = { name: 'pick', description: 'Report the answer.', parameters: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] } }
console.log(`\nChecking ${chain.length} entr${chain.length === 1 ? 'y' : 'ies'} (tool calling, 1 request each)…\n`)
let working = 0
for (const [i, e] of chain.entries()) {
  const client = (e.kind === 'anthropic' ? createAnthropic : createOpenAICompatible)({ ...e, retries: 0, timeoutMs: 25000 })
  const t0 = Date.now()
  let line
  try {
    const res = await client.chat({ system: 'You are a test. Call the tool.', messages: [{ role: 'user', content: 'Which is faster for sorted data lookup: binary search or linear search? Call pick.' }], tools: [tool], toolChoice: 'required', maxTokens: 200 })
    const ok = res.toolCalls?.[0]?.name === 'pick'
    if (ok) working++
    line = ok ? `OK    ${Date.now() - t0} ms` : `WARN  answered but did not call the tool (agent may struggle with this model)`
  } catch (err) {
    const c = classifyError(err)
    line = `FAIL  ${c.reason}${c.kind === 'cool' ? ' (temporary: the router will retry it later)' : ''}`
  }
  console.log(`${String(i + 1).padStart(2)}. ${e.label.padEnd(18)} ${e.model.padEnd(34)} ${e.keyHint.padEnd(8)} ${line}`)
}
console.log(`\n${working}/${chain.length} working. ${working ? 'The app will use them top to bottom and switch automatically on limits or errors.' : 'Fix the keys/models above; until then the app answers with offline rules.'}\n`)
