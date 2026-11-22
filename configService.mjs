import express from 'express'
import { promises as fs } from 'node:fs'
import { resolve } from 'node:path'

const ENV_PATH = resolve(process.cwd(), '.env')

export async function readEnvFile() {
  try {
    const raw = await fs.readFile(ENV_PATH, 'utf-8')
    return raw
  } catch (error) {
    if (error.code === 'ENOENT') return ''
    throw error
  }
}

export function parseEnv(raw) {
  const vars = {}
  const lines = raw.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    vars[key] = val
  }
  return vars
}

export async function updateEnvFile(newEntries) {
  let raw = await readEnvFile()
  let lines = raw ? raw.split(/\r?\n/) : []

  for (const [key, value] of Object.entries(newEntries)) {
    if (value === undefined) continue
    const cleanVal = String(value).trim()
    const prefix = `${key}=`
    let found = false
    lines = lines.map(line => {
      const trimmed = line.trim()
      if (trimmed.startsWith(prefix) || trimmed.startsWith(`#${prefix}`) || trimmed.startsWith(`# ${prefix}`)) {
        found = true
        return cleanVal ? `${key}=${cleanVal}` : `#${key}=`
      }
      return line
    })

    if (!found && cleanVal) {
      lines.push(`${key}=${cleanVal}`)
    }

    if (cleanVal) {
      process.env[key] = cleanVal
    } else {
      delete process.env[key]
    }
  }

  const updatedRaw = lines.join('\n') + (lines.length > 0 && !lines[lines.length - 1].endsWith('\n') ? '\n' : '')
  await fs.writeFile(ENV_PATH, updatedRaw, 'utf-8')
  return parseEnv(updatedRaw)
}

export function registerConfigApi(app) {
  const sameOrigin = (request, response, next) => {
    const origin = request.get('origin')
    if (request.get('sec-fetch-site') === 'cross-site' || (origin && origin !== `${request.protocol}://${request.get('host')}`)) {
      response.status(403).json({ error: 'Origine non autorisée.' })
      return
    }
    next()
  }

  app.get('/api/config', sameOrigin, async (_req, res) => {
    try {
      const raw = await readEnvFile()
      const envVars = parseEnv(raw)
      res.json({
        hassUrl: envVars.HASS_URL || process.env.HASS_URL || '',
        hasHassToken: Boolean(envVars.HASS_TOCKEN || envVars.HASS_TOKEN || process.env.HASS_TOCKEN || process.env.HASS_TOKEN),
        hasOpenaiApiKey: Boolean(envVars.OPENAI_API_KEY || process.env.OPENAI_API_KEY),
        openaiBaseUrl: envVars.OPENAI_BASE_URL || envVars.LM_STUDIO_URL || process.env.OPENAI_BASE_URL || process.env.LM_STUDIO_URL || '',
        openaiModel: envVars.OPENAI_MODEL || envVars.LM_STUDIO_MODEL || process.env.OPENAI_MODEL || process.env.LM_STUDIO_MODEL || '',
        transcriptionProvider: envVars.TRANSCRIPTION_PROVIDER || process.env.TRANSCRIPTION_PROVIDER || 'local',
        localWhisperModel: envVars.LOCAL_WHISPER_MODEL || process.env.LOCAL_WHISPER_MODEL || 'large-v3',
        aiQcmEvery: envVars.AI_QCM_EVERY || process.env.AI_QCM_EVERY || '4',
      })
    } catch (error) {
      res.status(500).json({ error: error.message || 'Impossible de lire la configuration.' })
    }
  })

  app.post('/api/config', sameOrigin, express.json(), async (req, res) => {
    try {
      const {
        hassUrl,
        hassToken,
        openaiApiKey,
        openaiBaseUrl,
        openaiModel,
        transcriptionProvider,
        localWhisperModel,
        aiQcmEvery,
      } = req.body || {}

      const updates = {}
      if (hassUrl !== undefined) updates.HASS_URL = hassUrl.trim()
      if (hassToken !== undefined && hassToken !== '') {
        updates.HASS_TOCKEN = hassToken.trim()
      }
      if (openaiApiKey !== undefined && openaiApiKey !== '') updates.OPENAI_API_KEY = openaiApiKey.trim()
      if (openaiBaseUrl !== undefined) {
        updates.OPENAI_BASE_URL = openaiBaseUrl.trim()
        updates.LM_STUDIO_URL = openaiBaseUrl.trim()
      }
      if (openaiModel !== undefined) {
        updates.OPENAI_MODEL = openaiModel.trim()
        updates.LM_STUDIO_MODEL = openaiModel.trim()
      }
      if (transcriptionProvider !== undefined) updates.TRANSCRIPTION_PROVIDER = transcriptionProvider.trim()
      if (localWhisperModel !== undefined) updates.LOCAL_WHISPER_MODEL = localWhisperModel.trim()
      if (aiQcmEvery !== undefined) updates.AI_QCM_EVERY = String(aiQcmEvery).trim()

      const result = await updateEnvFile(updates)

      res.json({
        success: true,
        message: 'Configuration mise à jour dans le fichier .env.',
        config: {
          hassUrl: result.HASS_URL || '',
          hasHassToken: Boolean(result.HASS_TOCKEN || result.HASS_TOKEN),
          hasOpenaiApiKey: Boolean(result.OPENAI_API_KEY),
          openaiBaseUrl: result.OPENAI_BASE_URL || result.LM_STUDIO_URL || '',
          openaiModel: result.OPENAI_MODEL || result.LM_STUDIO_MODEL || '',
          transcriptionProvider: result.TRANSCRIPTION_PROVIDER || 'local',
          localWhisperModel: result.LOCAL_WHISPER_MODEL || 'large-v3',
          aiQcmEvery: result.AI_QCM_EVERY || '4',
        }
      })
    } catch (error) {
      res.status(500).json({ error: error.message || 'Impossible de sauvegarder la configuration.' })
    }
  })
}
