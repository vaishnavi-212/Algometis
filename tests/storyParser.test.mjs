import test from 'node:test'
import assert from 'node:assert/strict'
import { extractFromStory, parseFriendly, toFriendly } from '../shared/storyParser.js'
import { validateFor } from '../shared/evidence.js'
import { buildSolveGraph, freshInput } from '../server/agent/solveGraph.js'
import { createMock } from '../server/llm/mock.js'
import { createProfileStore } from '../server/memory/store.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('graph stories: weighted links, "between", source/target, friends, prerequisites', () => {
  const a = extractFromStory('shortest_path', 'Fastest route from the kitchen to the station: Kitchen to Market 4 min, Kitchen to Park 2 min, Park to Market 1 min, Market to School 5 min, School to Station 6 min.')
  assert.deepEqual(a.input.nodes, ['Kitchen', 'Market', 'Park', 'School', 'Station'])
  assert.equal(a.input.edges.length, 5)
  assert.equal(a.input.source, 'Kitchen')
  assert.equal(a.input.target, 'Station')
  assert.equal(a.input.meta.unit, 'min')
  assert.ok(validateFor('dijkstra', a.input).valid)
  const b = extractFromStory('shortest_path', 'between hostel A and hostel B is 70 m; between Hostel B and Library is 40m; Hostel A - Library 90')
  assert.deepEqual(b.input.nodes, ['Hostel A', 'Hostel B', 'Library'])
  const c = extractFromStory('traversal', 'Asha is friends with Ben, Asha - Chen, Ben - Dev, Dev - Gopi. How many introductions from Asha to Gopi?')
  assert.equal(c.input.edges.length, 4)
  assert.equal(c.input.target, 'Gopi')
  const d = extractFromStory('ordering', 'Maths I before Maths II, Programming before Data Structures, Data Structures before Algorithms and DBMS, and ML needs Maths II and Algorithms.')
  assert.equal(d.input.directed, true)
  assert.deepEqual(d.input.nodes, ['Maths I', 'Maths II', 'Programming', 'Data Structures', 'Algorithms', 'DBMS', 'ML'])
  assert.equal(d.input.edges.length, 6)
})

test('lists, labelled scores, items, events, strings, coins', () => {
  const s = extractFromStory('search', 'In the list 34, 7, 23, 32, 5, 62, 42, 15 find roll number 42')
  assert.deepEqual(s.input.values, [34, 7, 23, 32, 5, 62, 42, 15])
  assert.equal(s.input.target, 42)
  const r = extractFromStory('sort', 'Rank students: Asha 72, Ben 45, Chen 88')
  assert.deepEqual(r.input.itemLabels, ['Asha', 'Ben', 'Chen'])
  const k = extractFromStory('knapsack', 'I have a 10 kg bag. Laptop 5 kg value 10, camera 4kg value 40, book 3 kg value 50.')
  assert.equal(k.input.capacity, 10)
  assert.deepEqual(k.input.items.map((i) => i.name), ['Laptop', 'Camera', 'Book'])
  const e = extractFromStory('scheduling', 'Quiz 9-10, Debate 9:30-11, Workshop 11-1pm')
  assert.deepEqual(e.input.activities, [
    { name: 'Quiz', start: 9, end: 10 },
    { name: 'Debate', start: 9.5, end: 11 },
    { name: 'Workshop', start: 11, end: 13 },
  ])
  assert.deepEqual(extractFromStory('sequence_similarity', 'compare "AGGTAB" with "GXTXAYB"').input.a, 'AGGTAB')
  const c = extractFromStory('coin_change', 'tokens worth 1, 3 and 4; give change of 6')
  assert.deepEqual([c.input.coins, c.input.amount], [[1, 3, 4], 6])
})

test('never invents data: missing pieces are reported', () => {
  const r = extractFromStory('shortest_path', 'What is the fastest route between the hostels?')
  assert.equal(r.input, null)
  assert.ok(r.missing.length)
  const k = extractFromStory('knapsack', 'pack my bag with the most valuable things')
  assert.equal(k.input, null)
})

test('friendly input box round-trips', () => {
  const g = parseFriendly('graph', 'Home - Mall 6\nMall - Office 4', { directed: false, source: 'Home' })
  assert.deepEqual(g.input.nodes, ['Home', 'Mall', 'Office'])
  assert.equal(toFriendly('graph', g.input), 'Home - Mall 6\nMall - Office 4')
  const a = parseFriendly('array_sort', 'Asha 72, Ben 45')
  assert.deepEqual(a.input.itemLabels, ['Asha', 'Ben'])
  assert.ok(parseFriendly('array_sort', '5').error)
})

test('offline agent uses the student’s own data end-to-end', async () => {
  const store = createProfileStore(fs.mkdtempSync(path.join(os.tmpdir(), 'ap-')))
  const llm = { ...createMock(), isMock: true }
  const cases = [
    ['Fastest route from the kitchen to the station: Kitchen to Market 4 min, Kitchen to Park 2 min, Park to Market 1 min, Market to School 5 min, School to Station 6 min.', 'dijkstra'],
    ['Pack my 10 kg bag: laptop 5 kg value 10, camera 4kg value 40, jacket 6 kg value 30, book 3 kg value 50. Items cannot be split.', 'knapsack_01'],
    ['Order my courses: Maths I before Maths II, Programming before Data Structures, Data Structures before Algorithms.', 'topological_sort'],
    ['Canteen tokens worth 1, 3 and 4. Fewest tokens to give change of 6?', 'coin_change'],
  ]
  let i = 0
  for (const [q, algo] of cases) {
    const out = await buildSolveGraph().invoke(freshInput('s', q), { threadId: `sp${i++}`, context: { llm, store } })
    const rec = out.state.response.recommendation
    assert.equal(rec.algorithmId, algo, q)
    assert.equal(rec.inputIsExample, false, `used real data for: ${q}`)
    assert.ok(out.state.trace.some((t) => t.tool === 'extract_data_from_story'))
  }
})
