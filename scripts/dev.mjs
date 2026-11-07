// One command for development: rebuild the frontend on change + restart the server on change.
import { spawn } from 'node:child_process'

const run = (args) => spawn(process.execPath, args, { stdio: 'inherit' })
const procs = [run(['scripts/build.mjs', '--watch']), run(['--watch-path=server', '--watch-path=shared', 'server/index.js'])]
const stop = () => procs.forEach((p) => p.kill())
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
