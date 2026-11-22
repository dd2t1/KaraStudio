import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createReadStream, createWriteStream, promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { registerHomeAssistant } from './homeAssistant.mjs'
import { registerCastSync } from './castSync.mjs'
import { registerAi } from './aiService.mjs'
import { registerBrowserDiagnostics } from './browserDiagnostics.mjs'
import { registerConfigApi } from './configService.mjs'

const require = createRequire(import.meta.url)
const app = express()
const port = process.env.TRANSCRIPTION_PORT || 8787
const provider = process.env.TRANSCRIPTION_PROVIDER || 'local'
const localPython = process.env.LOCAL_TRANSCRIPTION_PYTHON || '.venv-local\\Scripts\\python.exe'

registerConfigApi(app)
registerHomeAssistant(app)
registerCastSync(app)
registerAi(app)
registerBrowserDiagnostics(app)
app.use(cors())

function transcribeLocally(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(localPython, ['transcribe_local.py', file], {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
    })
    let output = ''
    let errors = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { errors += chunk })
    child.on('error', reject)
    child.on('close', code => {
      if (code !== 0) reject(new Error(errors.trim() || 'La transcription locale a échoué.'))
      else {
        try { resolve(JSON.parse(output)) } catch { reject(new Error('La transcription locale a renvoyé un JSON invalide.')) }
      }
    })
  })
}

app.post('/api/transcribe', async (request, response) => {
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    response.status(503).json({ error: 'OPENAI_API_KEY est requis pour la transcription.' })
    return
  }

  const boundary = request.headers['content-type']?.match(/boundary=([^;]+)/)?.[1]
  if (!boundary) {
    response.status(400).json({ error: 'Le fichier audio est manquant.' })
    return
  }

  let file
  try {
    const busboy = require('busboy')({ headers: request.headers, limits: { fileSize: 25 * 1024 * 1024, files: 1 } })
    file = await new Promise((resolve, reject) => {
      const writes = []
      let storedFile = null
      busboy.on('file', (_name, stream, info) => {
        const path = join(tmpdir(), `karaoke-${randomUUID()}-${info.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`)
        const output = createWriteStream(path)
        stream.pipe(output)
        writes.push(new Promise((writeResolve, writeReject) => {
          output.on('finish', () => { storedFile = path; writeResolve() })
          output.on('error', writeReject)
        }))
      })
      busboy.on('finish', async () => {
        try {
          await Promise.all(writes)
          storedFile ? resolve(storedFile) : reject(new Error('Le fichier audio est manquant.'))
        } catch (error) { reject(error) }
      })
      busboy.on('error', reject)
      request.pipe(busboy)
    })

    const activeProvider = process.env.TRANSCRIPTION_PROVIDER || provider
    const transcription = activeProvider === 'local'
      ? await transcribeLocally(file)
      : await (async () => {
          if (activeProvider !== 'openai') throw new Error('TRANSCRIPTION_PROVIDER doit être "local" ou "openai".')
          const { default: OpenAI } = await import('openai')
          const client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            baseURL: process.env.OPENAI_BASE_URL || undefined,
          })
          return client.audio.transcriptions.create({
            file: createReadStream(file),
            model: process.env.OPENAI_WHISPER_MODEL || 'whisper-1',
            response_format: 'verbose_json',
            timestamp_granularities: ['segment', 'word'],
          })
        })()
    response.json(transcription)
  } catch (error) {
    console.error('Échec de transcription :', error)
    const message = error instanceof Error ? error.message : 'La transcription a échoué.'
    const blockedByWindows = message.includes('stratégie de contrôle d’application')
    response.status(typeof error?.status === 'number' ? error.status : 500).json({
      error: blockedByWindows
        ? 'Le moteur local est bloqué par la politique de sécurité Windows. Utilisez le mode OpenAI ou autorisez Python/PyAV sur ce PC.'
        : message,
    })
  } finally {
    if (file) await fs.unlink(file).catch(() => undefined)
  }
})

app.listen(port, '127.0.0.1', () => console.log(`API karaoké disponible sur http://127.0.0.1:${port}`))
