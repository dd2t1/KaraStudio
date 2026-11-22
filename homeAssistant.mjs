import busboy from 'busboy'
import { parsePlayLevel } from './src/playLevel.mjs'

const MAX_AUDIO = 20 * 1024 * 1024
const MAX_PROJECT = 2 * 1024 * 1024
const audioTypes = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.opus': 'audio/ogg', '.webm': 'audio/webm' }

export function hassConfig(env = process.env) {
  const token = env.HASS_TOCKEN || env.HASS_TOKEN
  if (!env.HASS_URL || !token) throw Object.assign(new Error('Ajoutez HASS_URL et HASS_TOCKEN dans le .env, puis redémarrez l’API.'), { status: 503 })
  let url
  try { url = new URL(env.HASS_URL) } catch { throw Object.assign(new Error('HASS_URL est invalide.'), { status: 503 }) }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw Object.assign(new Error('HASS_URL doit être une URL HTTP(S) sans identifiants ni paramètres.'), { status: 503 })
  }
  return { url: `${url.href.replace(/\/+$/, '')}/api/karaoke_storage`, token }
}

export async function callHass(config, options = {}, fetcher = fetch, raw = false) {
  let response
  try {
    response = await fetcher(config.url, { ...options, headers: { Authorization: `Bearer ${config.token}` }, redirect: 'error', signal: AbortSignal.timeout(120000) })
  } catch {
    throw Object.assign(new Error('Home Assistant est injoignable ou le délai d’envoi est dépassé. Vérifiez la connexion avant de réessayer.'), { status: 502 })
  }
  if (!response.ok) {
    const messages = {
      401: 'Le token Home Assistant est invalide ou expiré.',
      403: 'Le token Home Assistant doit appartenir à un administrateur.',
      404: 'Installez le composant karaoke_storage fourni dans home-assistant/, puis redémarrez Home Assistant.',
      413: 'Le fichier dépasse la limite Home Assistant : audio 20 Mio, JSON 2 Mio.',
      400: 'Home Assistant a refusé le projet ou le format audio.',
      503: 'Aucun dossier média accessible dans Home Assistant. Configurez homeassistant.media_dirs.',
    }
    throw Object.assign(new Error(messages[response.status] || 'Home Assistant n’a pas pu enregistrer le projet.'), { status: 502 })
  }
  if (raw) return response
  try { return await response.json() } catch { throw Object.assign(new Error('Réponse Home Assistant invalide.'), { status: 502 }) }
}

export function receiveProject(request) {
  return new Promise((resolve, reject) => {
    const invalid = message => Object.assign(new Error(message), { status: 400 })
    let parser
    try { parser = busboy({ headers: request.headers, limits: { files: 1, fields: 1, parts: 3, fileSize: MAX_AUDIO, fieldSize: MAX_PROJECT } }) }
    catch { reject(invalid('Envoyez un fichier audio et un projet JSON.')); return }
    let audio, projectText, problem
    parser.on('file', (field, stream, info) => {
      const ext = /\.[a-z0-9]+$/i.exec(info.filename)?.[0].toLowerCase()
      if (field !== 'audio' || !audioTypes[ext]) { problem = invalid('Format audio accepté : MP3, WAV, OGG, FLAC, M4A, AAC, OPUS ou WEBM.'); stream.resume(); return }
      const chunks = []
      stream.on('limit', () => { problem = Object.assign(new Error('La musique dépasse 20 Mio.'), { status: 413 }) })
      stream.on('error', reject)
      stream.on('data', chunk => chunks.push(chunk))
      stream.on('end', () => { audio = { bytes: Buffer.concat(chunks), name: `musique${ext}`, type: audioTypes[ext] } })
    })
    parser.on('field', (name, value, info) => {
      if (name !== 'project' || info.valueTruncated) problem = invalid('Le JSON est manquant ou dépasse 2 Mio.')
      else projectText = value
    })
    for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit']) parser.on(event, () => { problem = invalid('Envoyez exactement un audio et un projet JSON.') })
    parser.on('error', () => reject(invalid('Envoi incomplet ou invalide.')))
    request.on('aborted', () => { parser.destroy(); reject(invalid('Envoi interrompu.')) })
    parser.on('close', () => {
      if (problem) { reject(problem); return }
      try {
        if (!projectText) throw invalid('Le JSON est requis.')
        const project = JSON.parse(projectText)
        const trackId = project.songInfo?.spotifyTrackId
        if (trackId !== undefined && (typeof trackId !== 'string' || !/^[A-Za-z0-9]{22}$/.test(trackId))) throw invalid('Identifiant Spotify invalide.')
        if (!trackId && !audio?.bytes.length) throw invalid('Le fichier audio est requis.')
        if (trackId && audio) throw invalid('Un projet Spotify ne doit pas contenir de fichier audio.')
        const lyrics = parsePlayLevel(projectText, { requireQuizCues: true })
        resolve({ audio, project: { timingConvention: 'line-start', songInfo: { title: String(project.songInfo?.title || 'Karaoké').slice(0, 200), artist: String(project.songInfo?.artist || 'Artiste inconnu').slice(0, 200), audioFile: audio?.name || null, ...(trackId ? { spotifyTrackId: trackId } : {}) }, lyrics } })
      } catch (error) { reject(invalid(error instanceof SyntaxError ? 'Le projet JSON est invalide.' : error.message)) }
    })
    request.pipe(parser)
  })
}

export function registerHomeAssistant(app) {
  // This endpoint uses a server-side credential: require a same-origin browser request.
  const sameOrigin = (request, response, next) => {
    const origin = request.get('origin')
    if (request.get('sec-fetch-site') === 'cross-site' || (origin && origin !== `${request.protocol}://${request.get('host')}`)) {
      response.status(403).json({ error: 'Origine non autorisée.' }); return
    }
    if (request.method === 'POST' && request.get('x-karaoke-request') !== '1') {
      response.status(403).json({ error: 'Requête non autorisée.' }); return
    }
    next()
  }
  const failure = (response, error) => response.status(error.status || 500).json({ error: error.status ? error.message : 'Impossible d’enregistrer le projet sur Home Assistant.' })
  app.get('/api/home-assistant/search', sameOrigin, async (request, response) => {
    const query = typeof request.query.q === 'string' ? request.query.q.trim() : ''
    if (query.length < 2 || query.length > 160) return response.status(400).json({ error: 'Saisissez entre 2 et 160 caractères.' })
    try {
      const config = hassConfig()
      const params = new URLSearchParams({ q: query })
      if (request.query.catalog === '1') params.set('catalog', '1')
      const result = await callHass({ ...config, url: `${config.url}/search?${params}` })
      if (!Array.isArray(result.results)) throw new Error('Invalid search response')
      response.set('Cache-Control', 'no-store').json(result)
    } catch (error) { failure(response, error) }
  })
  app.get('/api/home-assistant/projects', sameOrigin, async (_request, response) => {
    try {
      const config = hassConfig()
      const result = await callHass({ ...config, url: `${config.url}/projects` })
      if (!Array.isArray(result.projects)) throw new Error('Invalid library')
      response.set('Cache-Control', 'no-store').json(result)
    } catch (error) { failure(response, error) }
  })
  app.get('/api/home-assistant/projects/:id/:kind', sameOrigin, async (request, response) => {
    const { id, kind } = request.params
    if (!/^[a-f0-9]{32}$/.test(id) || !['project', 'audio'].includes(kind)) return response.sendStatus(400)
    try {
      const config = hassConfig()
      const result = await callHass({ ...config, url: `${config.url}/projects/${id}/${kind}` }, {}, fetch, true)
      response.set('Cache-Control', 'no-store')
      if (kind === 'project') return response.json(await result.json())
      const mime = result.headers.get('content-type')?.split(';')[0]
      if (!Object.values(audioTypes).includes(mime)) throw new Error('Invalid audio type')
      const chunks = []
      let size = 0
      for await (const chunk of result.body) {
        size += chunk.length
        if (size > MAX_AUDIO) throw new Error('Audio too large')
        chunks.push(chunk)
      }
      response.type(mime).send(Buffer.concat(chunks))
    } catch (error) { failure(response, error) }
  })
  app.get('/api/home-assistant/status', sameOrigin, async (_request, response) => {
    try {
      const result = await callHass(hassConfig())
      if (result.integration !== 'karaoke_storage' || result.version !== 1) throw new Error('Unsupported integration')
      response.json({ ready: true })
    } catch (error) { failure(response, error) }
  })
  app.post('/api/home-assistant/projects', sameOrigin, async (request, response) => {
    try {
      const config = hassConfig()
      const { audio, project } = await receiveProject(request)
      const form = new FormData()
      form.append('project', JSON.stringify(project))
      if (audio) form.append('audio', new Blob([audio.bytes], { type: audio.type }), audio.name)
      const result = await callHass(config, { method: 'POST', body: form })
      if (typeof result.media_content_id !== 'string' || !/^media-source:\/\/media_source\//.test(result.media_content_id)) throw new Error('Invalid media ID')
      response.status(201).json({ mediaContentId: result.media_content_id, saved: true })
    } catch (error) { failure(response, error) }
  })
}
