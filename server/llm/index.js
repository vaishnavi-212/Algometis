import { config } from '../config.js'
import { createRouter } from './router.js'

/**
 * Build the LLM client: a router over every configured provider (see config.js → buildChain).
 * The client exposes:
 *   chat({ system, messages, tools, toolChoice, purpose, hint }) -> { text, toolCalls, provider, model, isMock }
 *   status() -> live state of every provider in the chain (shown in the app's status menu)
 * With no provider configured it runs fully offline (rule-based mock). `purpose` and `hint` are only
 * used by the offline mock; real providers ignore them.
 */
export function createLLM(chain = config.llmChain, opts = config.llmRouter) {
  return createRouter(chain, { ...opts, log: (m) => console.warn(m) })
}
