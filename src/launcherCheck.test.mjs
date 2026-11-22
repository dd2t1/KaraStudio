import test from 'node:test'
import assert from 'node:assert/strict'
import { checkLauncher } from '../launcherCheck.mjs'

test('launcher accepts free configured ports without launching services', async () => {
  const checked = []
  assert.equal(await checkLauncher({ env: {}, available: async port => { checked.push(port); return true }, log: () => {} }), true)
  assert.deepEqual(checked, [8787, 5173])
})

test('launcher refuses occupied ports with an actionable non-destructive explanation', async () => {
  const messages = []
  assert.equal(await checkLauncher({ env: {}, available: async () => false, log: message => messages.push(message) }), false)
  assert.ok(messages.some(message => message.includes('8787')))
  assert.ok(messages.some(message => message.includes('5173')))
  assert.ok(messages.some(message => message.includes('Ctrl+C')))
  assert.ok(messages.some(message => message.includes('Aucun processus')))
})

test('launcher refuses an API port not matching the existing proxy', async () => {
  assert.equal(await checkLauncher({ env: { TRANSCRIPTION_PORT: '9000' }, available: async () => { throw new Error('must not probe') }, log: () => {} }), false)
})
