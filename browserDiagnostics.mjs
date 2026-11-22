import express from 'express'
import { sanitizeDiagnostic, DIAGNOSTIC_TYPES } from './src/browserDiagnosticData.mjs'

export function registerBrowserDiagnostics(app, { log = console.warn, clock = Date.now } = {}) {
  const entries = []
  let rateStart = clock(), count = 0
  const localOnly = (req, res, next) => {
    try {
      const host = new URL(`http://${req.get('Host')}`).hostname
      const origin = req.get('Origin') && new URL(req.get('Origin')).hostname
      const localNames = ['localhost', '127.0.0.1', '[::1]']
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || !localNames.includes(host) || origin && !localNames.includes(origin)) return res.sendStatus(403)
    } catch { return res.sendStatus(403) }
    next()
  }
  const prune = () => { while (entries.length && clock() - entries[0].receivedAt > 3600000) entries.shift() }
  app.post('/api/browser-errors', localOnly, express.json({ limit: '4kb' }), (req, res) => {
    const data = sanitizeDiagnostic(req.body)
    if (!data) return res.sendStatus(400)
    if (clock() - rateStart >= 60000) { rateStart = clock(); count = 0 }
    if (count >= 60) return res.sendStatus(429)
    count++
    prune()
    entries.push({ ...data, receivedAt: clock() })
    if (entries.length > 100) entries.shift()
    log('[Navigateur]', DIAGNOSTIC_TYPES[data.type], data)
    res.sendStatus(204)
  })
  app.get('/api/browser-errors', localOnly, (_req, res) => {
    prune(); res.set('Cache-Control', 'no-store'); res.json({ entries, retention: 'memory-only' })
  })
}
