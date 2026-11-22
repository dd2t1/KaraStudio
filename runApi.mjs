import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Absolute entry point lets the Windows launcher identify this project's API.
const child = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))], {
  stdio: 'inherit', windowsHide: true,
})
child.on('error', () => { process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
