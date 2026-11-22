import express from 'express'
import { randomBytes } from 'node:crypto'

const deviceAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const validCode = value => typeof value === 'string' && /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(value)

export function createDeviceCode() {
  return [...randomBytes(6)].map(byte => deviceAlphabet[byte % deviceAlphabet.length]).join('')
}

export function registerCastSync(app) {
  const rooms = new Map()
  const pairs = new Map()
  const validKey = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value)
  const clean = () => {
    const now = Date.now()
    for (const [key, room] of rooms) if (now - room.updatedAt > 3600000) rooms.delete(key)
    for (const [code, pair] of pairs) if (now - pair.createdAt > 3600000) pairs.delete(code)
  }
  app.post('/api/cast/pair', (_req, res) => {
    clean()
    if (pairs.size >= 100) return res.sendStatus(503)
    let code = createDeviceCode()
    while (pairs.has(code)) code = createDeviceCode()
    const room = randomBytes(16).toString('hex')
    pairs.set(code, { room, writeKey: randomBytes(16).toString('hex'), claimed: false, createdAt: Date.now() })
    res.status(201).json({ code, room })
  })
  app.get('/api/cast/pair/:code', (req, res) => {
    clean()
    const code = String(req.params.code || '').toUpperCase()
    const pair = validCode(code) && pairs.get(code)
    if (!pair) return res.status(404).json({ error: 'Code inconnu.' })
    res.set('Cache-Control', 'no-store')
    res.json({ code, room: pair.room, claimed: pair.claimed })
  })
  app.post('/api/cast/pair/:code/claim', (req, res) => {
    clean()
    const code = String(req.params.code || '').toUpperCase()
    const pair = validCode(code) && pairs.get(code)
    if (!pair) return res.status(404).json({ error: 'Code inconnu.' })
    if (pair.claimed) return res.status(409).json({ error: 'Cette télé est déjà liée.' })
    pair.claimed = true
    res.json({ code, room: pair.room, presenter: pair.writeKey })
  })
  app.get('/api/cast/:room', (req, res) => {
    clean()
    res.set('Cache-Control', 'no-store')
    const room = validKey(req.params.room) && rooms.get(req.params.room)
    if (!room) return res.status(404).json({ waiting: true })
    const { writeKey: _secret, ...state } = room
    res.json({ ...state, serverTime: Date.now() })
  })
  app.put('/api/cast/:room', express.json({ limit: '2mb' }), (req, res) => {
    clean()
    const key = req.get('X-Karaoke-Presenter')
    if (!validKey(req.params.room) || !validKey(key)) return res.sendStatus(400)
    const previous = rooms.get(req.params.room)
    if (previous && previous.writeKey !== key) return res.sendStatus(403)
    if (!previous && rooms.size >= 100) return res.sendStatus(503)
    const data = req.body
    if (!data || !Number.isSafeInteger(data.sequence) || !Number.isFinite(data.time) || data.time < 0 ||
        !Number.isFinite(data.rate) || data.rate <= 0 || data.rate > 16 || typeof data.playing !== 'boolean' ||
        !Array.isArray(data.answers) || data.answers.length > 10000 || !data.answers.every(x => typeof x === 'string') ||
        (data.lyrics !== undefined && (!Array.isArray(data.lyrics) || data.lyrics.length > 10000 || !data.lyrics.every(line =>
          line && typeof line.text === 'string' && Number.isFinite(line.start) && Number.isFinite(line.end))))) return res.sendStatus(400)
    if (previous && data.sequence <= previous.sequence) return res.status(409).json({ sequence: previous.sequence })
    if (!previous && !data.lyrics) return res.status(409).json({ needsLyrics: true })
    rooms.set(req.params.room, { writeKey: key, sequence: data.sequence, time: data.time, rate: data.rate,
      playing: data.playing, ended: Boolean(data.ended), answers: data.answers,
      mode: data.mode === 'editor' ? 'editor' : 'player', lyrics: data.lyrics || previous.lyrics, updatedAt: Date.now() })
    res.json({ saved: true })
  })
}