// Bundles the React frontend into dist/ with esbuild.  Usage: node scripts/build.mjs [--watch]
import * as esbuild from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const watch = process.argv.includes('--watch')

fs.mkdirSync(dist, { recursive: true })
fs.copyFileSync(path.join(root, 'public/index.html'), path.join(dist, 'index.html'))

const options = {
  entryPoints: { app: path.join(root, 'src/main.jsx') },
  bundle: true,
  format: 'esm',
  outdir: dist,
  jsx: 'automatic',
  loader: { '.js': 'jsx' },
  minify: !watch,
  sourcemap: watch,
  target: ['es2022'],
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
  logLevel: 'info',
}

// styles.css → dist/app.css
const copyCss = () => fs.copyFileSync(path.join(root, 'src/styles.css'), path.join(dist, 'app.css'))
copyCss()

if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
  fs.watch(path.join(root, 'src'), (_e, f) => f === 'styles.css' && copyCss())
  console.log('esbuild watching src/ …')
} else {
  await esbuild.build(options)
}
