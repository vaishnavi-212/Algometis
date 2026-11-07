import * as searching from './searching.js'
import * as sorting from './sorting.js'
import * as graphs from './graphs.js'
import * as greedy from './greedy.js'
import * as dp from './dp.js'

const all = { ...searching, ...sorting, ...graphs, ...greedy, ...dp }

/** id -> { id, code, run } */
export const GENERATORS = Object.fromEntries(Object.values(all).filter((m) => m && typeof m.run === 'function').map((m) => [m.id, m]))
