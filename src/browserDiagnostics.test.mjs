import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { once } from 'node:events'
import { sanitizeDiagnostic } from './browserDiagnosticData.mjs'
import { installBrowserDiagnostics } from './browserDiagnosticsClient.mjs'
import { registerBrowserDiagnostics } from '../browserDiagnostics.mjs'

test('diagnostics allow only technical fields, never arbitrary messages or credentials', () => {
  const data = sanitizeDiagnostic({ type: 'ai-error', errorName: 'TypeError', status: 503,
    message: 'paroles SECRET', audio: 'song.mp3', token: 'secret', stack: 'password', source: '/src/App.jsx?token=secret',
  })
  assert.deepEqual(data, { type: 'ai-error', errorName: 'TypeError', status: 503 })
  assert.equal(sanitizeDiagnostic({ type: 'untrusted' }), null)
  assert.equal(sanitizeDiagnostic({ type: 'javascript-error', source: '/src/../private.js' }).source, undefined)
  assert.equal(sanitizeDiagnostic({ type: 'javascript-error', source: '/src/App.jsx', line: 4 }).source, '/src/App.jsx')
})

test('browser diagnostics are opt-in, local-only, rate-limited and removable', () => {
  const listeners = new Map(), requests = []
  let enabled = false, now = 0
  const win = { location: { hostname: '127.0.0.1', origin: 'http://127.0.0.1:5173', href: 'http://127.0.0.1:5173/dev/' },
    addEventListener: (name, listener) => listeners.set(name, listener), removeEventListener: name => listeners.delete(name),
  }
  const cleanup = installBrowserDiagnostics({ win, isEnabled: () => enabled, clock: () => now, fetcher: (_url, options) => { requests.push(JSON.parse(options.body)); return Promise.resolve() } })
  const fire = () => listeners.get('error')({ error: new TypeError('SECRET LYRICS'), filename: '/src/App.jsx?token=SECRET', lineno: 2 })
  fire(); assert.equal(requests.length, 0)
  enabled = true; fire(); fire(); assert.equal(requests.length, 1)
  for (let i = 0; i < 15; i++) { now += 5001; fire() }
  assert.ok(requests.length <= 14)
  assert.ok(!JSON.stringify(requests).includes('SECRET'))
  const before = requests.length; enabled = false; now += 60000; fire(); assert.equal(requests.length, before)
  cleanup(); assert.equal(listeners.size, 0)
  win.location.hostname = 'example.com'
  const remoteCleanup = installBrowserDiagnostics({ win, isEnabled: () => true, fetcher: () => { throw new Error('must not send') } })
  fire(); remoteCleanup()
})

test('local API filters reports, denies foreign origins and keeps a bounded expiring memory log', async t => {
  const app = express(), logs = []
  let now = 0
  registerBrowserDiagnostics(app, { log: (...args) => logs.push(args), clock: () => now })
  const server = app.listen(0, '127.0.0.1')
  t.after(() => { server.closeAllConnections(); server.close() })
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}/api/browser-errors`
  const post = origin => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ type: 'javascript-error', message: 'SECRET', token: 'SECRET' }) })
  assert.equal((await post('https://example.com')).status, 403)
  for (let i = 0; i < 60; i++) assert.equal((await post('http://127.0.0.1:5173')).status, 204)
  assert.equal((await post('http://127.0.0.1:5173')).status, 429)
  now += 60001
  for (let i = 0; i < 50; i++) await post('http://127.0.0.1:5173')
  let result = await (await fetch(url)).json()
  assert.equal(result.entries.length, 100)
  assert.ok(!JSON.stringify([result, logs]).includes('SECRET'))
  now += 3600001
  result = await (await fetch(url)).json()
  assert.equal(result.entries.length, 0)
})
