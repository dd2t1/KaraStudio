import test from 'node:test'
import assert from 'node:assert/strict'
import { ownsServer } from '../launcherRestart.mjs'

test('restart identifies only absolute API and Vite entries of the current project', () => {
  const root = 'D:\\dev\\karaoke-react'
  assert.equal(ownsServer('"C:\\Program Files\\nodejs\\node.exe" "D:\\dev\\karaoke-react\\server.mjs"', root), true)
  assert.equal(ownsServer('"node" "D:\\dev\\karaoke-react\\node_modules\\.bin\\..\\vite\\bin\\vite.js"', root), true)
  for (const command of [
    'node server.mjs',
    'node "D:\\dev\\other\\server.mjs"',
    'node "D:\\dev\\karaoke-react-copy\\server.mjs"',
    'node "D:\\dev\\karaoke-react\\other.mjs" "D:\\dev\\karaoke-react\\server.mjs"',
  ]) assert.equal(ownsServer(command, root), false)
})
