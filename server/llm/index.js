import { config } from '../config.js'
import { createOpenAICompatible, createAnthropic } from './providers.js'
import { createMock } from './mock.js'

/**
 * Build the LLM client from config. Every client exposes:
 *   chat({ system, messages, tools, toolChoice, purpose, hint }) -> { text, toolCalls }
 * `purpose` and `hint` are only used by the offline mock; real providers ignore them.
 */
export function createLLM(cfg = config.llm) {
  if (cfg.kind === 'mock') return { ...createMock(), provider: 'mock', isMock: true }
  if (!cfg.apiKey && !cfg.noKey) throw new Error(`LLM_API_KEY is required for provider "${cfg.name}"`)
  const client = cfg.kind === 'anthropic' ? createAnthropic(cfg) : createOpenAICompatible(cfg)
  return { ...client, provider: cfg.name, isMock: false }
}
