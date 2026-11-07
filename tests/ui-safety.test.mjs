import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Newer browsers make scrollIntoView()/scrollTo() return a Promise. An effect written as
// `useEffect(() => el.scrollIntoView())` would then hand React a Promise as its "cleanup",
// and React crashes with "x is not a function" on unmount. Effects must use a block body.
test('no React effect returns a value by accident', () => {
  const files = []
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.jsx?$/.test(e.name) && files.push(path.join(d, e.name))))
  walk('src')
  const bad = []
  for (const f of files) {
    fs.readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => /useEffect\(\s*\(\)\s*=>\s*[^{\s]/.test(line) && bad.push(`${f}:${i + 1}: ${line.trim()}`))
  }
  assert.deepEqual(bad, [], `effects with expression bodies:\n${bad.join('\n')}`)
})
