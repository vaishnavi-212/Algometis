// A small, dependency-free state-graph engine with the same ideas as LangGraph:
//   - typed state with reducers (e.g. "append to trace")
//   - nodes = async functions returning partial state updates
//   - normal + conditional edges
//   - a checkpointer that saves state per thread
//   - interrupt(): pause the graph mid-node (e.g. to ask the student a question) and
//     resume later with the answer via new Command({ resume })
// It is ~150 lines so you can read and explain every part of it.

import { AsyncLocalStorage } from 'node:async_hooks'

export const START = '__start__'
export const END = '__end__'

const als = new AsyncLocalStorage()

export class GraphInterrupt extends Error {
  constructor(value) {
    super('graph interrupted')
    this.value = value
  }
}

/** Call inside a node to pause. On resume the node re-runs and interrupt() returns the answer. */
export function interrupt(value) {
  const ctx = als.getStore()
  if (ctx && ctx.hasResume) {
    ctx.hasResume = false
    return ctx.resume
  }
  throw new GraphInterrupt(value)
}

export class Command {
  constructor({ resume }) {
    this.resume = resume
  }
}

export class MemoryCheckpointer {
  constructor({ ttlMs = 2 * 60 * 60 * 1000, maxThreads = 1000 } = {}) {
    this.map = new Map()
    this.ttlMs = ttlMs
    this.maxThreads = maxThreads
  }
  async get(threadId) {
    const e = this.map.get(threadId)
    if (!e) return null
    if (Date.now() - e.savedAt > this.ttlMs) {
      this.map.delete(threadId)
      return null
    }
    return structuredClone(e.checkpoint)
  }
  async delete(threadId) {
    this.map.delete(threadId)
  }
  async put(threadId, checkpoint) {
    this.map.delete(threadId)
    this.map.set(threadId, { checkpoint: structuredClone(checkpoint), savedAt: Date.now() })
    while (this.map.size > this.maxThreads) this.map.delete(this.map.keys().next().value)
  }
}

export class StateGraph {
  /** channels: { key: { default: () => value, reducer?: (old, update) => new } } */
  constructor(channels) {
    this.channels = channels
    this.nodes = new Map()
    this.edges = new Map()
    this.conditional = new Map()
  }
  addNode(name, fn) {
    if (name === START || name === END) throw new Error('reserved node name')
    this.nodes.set(name, fn)
    return this
  }
  addEdge(from, to) {
    this.edges.set(from, to)
    return this
  }
  /** router(state) returns the name of the next node (or END). */
  addConditionalEdges(from, router) {
    this.conditional.set(from, router)
    return this
  }
  compile({ checkpointer = new MemoryCheckpointer(), maxSteps = 60 } = {}) {
    for (const [from, to] of this.edges) {
      if (from !== START && !this.nodes.has(from)) throw new Error(`edge from unknown node "${from}"`)
      if (to !== END && !this.nodes.has(to)) throw new Error(`edge to unknown node "${to}"`)
    }
    return new CompiledGraph(this, checkpointer, maxSteps)
  }
}

class CompiledGraph {
  constructor(graph, checkpointer, maxSteps) {
    this.g = graph
    this.checkpointer = checkpointer
    this.maxSteps = maxSteps
  }

  initialState() {
    return Object.fromEntries(Object.entries(this.g.channels).map(([k, ch]) => [k, ch.default ? ch.default() : undefined]))
  }

  apply(state, update) {
    if (!update) return state
    const next = { ...state }
    for (const [k, v] of Object.entries(update)) {
      const ch = this.g.channels[k]
      if (!ch) throw new Error(`node returned unknown state key "${k}"`)
      next[k] = ch.reducer ? ch.reducer(state[k], v) : v
    }
    return next
  }

  route(from, state) {
    if (this.g.conditional.has(from)) return this.g.conditional.get(from)(state)
    if (this.g.edges.has(from)) return this.g.edges.get(from)
    throw new Error(`node "${from}" has no outgoing edge`)
  }

  async getState(threadId) {
    return this.checkpointer.get(threadId)
  }

  /**
   * invoke(input, { threadId, context, onNode })
   *   input   = partial state for a new run, or new Command({ resume }) to continue after interrupt()
   *   context = passed to every node as 2nd argument (llm, stores...)
   *   onNode  = optional callback(nodeName) for progress reporting
   */
  async invoke(input, { threadId, context = {}, onNode } = {}) {
    const saved = threadId ? await this.checkpointer.get(threadId) : null
    let state
    let next
    const resumeCtx = { hasResume: false, resume: undefined }
    if (input instanceof Command) {
      if (!saved || !saved.next || saved.next === END) throw new Error('Nothing to resume for this thread')
      state = saved.state
      next = saved.next
      resumeCtx.hasResume = true
      resumeCtx.resume = input.resume
    } else {
      state = this.apply(saved?.state ?? this.initialState(), input)
      next = this.route(START, state)
    }
    const path = []
    for (let i = 0; i < this.maxSteps; i++) {
      if (next === END) {
        if (threadId) await this.checkpointer.put(threadId, { state, next: END })
        return { status: 'done', state, path }
      }
      const fn = this.g.nodes.get(next)
      if (!fn) throw new Error(`unknown node "${next}"`)
      onNode?.(next)
      let update
      try {
        update = await als.run(resumeCtx, () => fn(state, context))
      } catch (e) {
        if (e instanceof GraphInterrupt) {
          if (threadId) await this.checkpointer.put(threadId, { state, next, interrupt: e.value })
          return { status: 'interrupted', interrupt: e.value, state, path }
        }
        throw e
      }
      resumeCtx.hasResume = false
      state = this.apply(state, update)
      path.push(next)
      next = this.route(next, state)
    }
    throw new Error(`graph exceeded ${this.maxSteps} steps (possible infinite loop)`)
  }
}
