import { useEffect, useRef, useState } from 'react'
import { Play, Pause, ExternalLink, RefreshCw } from 'lucide-react'
import { spotifyTime } from '../spotifyRemote.mjs'
import useTvMode from '../tvMode.js'
import { publicKaraokeUrl } from '../publicKaraokeUrl.mjs'
import LocalQrCode from './LocalQrCode'

const key = 'karaoke.spotify.pkce'
const tokenKey = 'karaoke.spotify.token'
const clientKey = 'karaoke.spotify.client'
const returnUrlKey = 'karaoke.spotify.returnUrl'
const redirectUri = () => `${location.origin}/`
const encoded = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')

async function connect(clientId) {
  // Rediriger vers les paramètres si le Client ID est vide
  if (!/^[a-f0-9]{32}$/i.test(clientId)) {
    location.href = '/settings'
    return
  }
  
  const verifier = encoded(crypto.getRandomValues(new Uint8Array(64)))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const state = encoded(crypto.getRandomValues(new Uint8Array(16)))
  // Stocker l'URL de retour dans sessionStorage
  const returnUrl = `${location.pathname}${location.search}${location.hash}`
  sessionStorage.setItem(key, JSON.stringify({ verifier, state, returnUrl }))
  sessionStorage.setItem(returnUrlKey, returnUrl)
  localStorage.setItem(clientKey, clientId)
  const query = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri(),
    code_challenge_method: 'S256', code_challenge: encoded(new Uint8Array(digest)), state,
    scope: 'user-read-playback-state user-modify-playback-state' })
  location.assign(`https://accounts.spotify.com/authorize?${query}`)
}

export default function SpotifyRemote({ trackId, onState, active = true, spaceShortcut = false }) {
  const tvMode = useTvMode()
  const clientId = localStorage.getItem(clientKey) || ''
  const [token, setToken] = useState(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(tokenKey)); return saved?.expires > Date.now() || saved?.refresh ? saved.access : '' } catch { return '' }
  })
  const [state, setState] = useState(null)
  const [devices, setDevices] = useState([])
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [retryAfter, setRetryAfter] = useState(0)
  const [commandBusy, setCommandBusy] = useState(false)
  const [clockTick, setClockTick] = useState(0)
  useEffect(() => { const timer = setInterval(() => setClockTick(performance.now()), 1000); return () => clearInterval(timer) }, [])
  const lastManualSync = useRef(0)

  useEffect(() => {
    const query = new URLSearchParams(location.search)
    const code = query.get('code')
    if (!code && !query.has('error')) return
    const clean = () => {
      query.delete('code'); query.delete('state'); query.delete('error')
      history.replaceState(null, '', `${location.pathname}${query.size ? `?${query}` : ''}${location.hash}`)
    }
    if (!code) { queueMicrotask(() => setError('Connexion Spotify refusée.')); clean(); return }
    let saved
    try { saved = JSON.parse(sessionStorage.getItem(key)) } catch { /* Missing request state. */ }
    sessionStorage.removeItem(key)
    if (!saved || saved.state !== query.get('state') || !clientId) { queueMicrotask(() => setError('Connexion Spotify invalide. Réessayez.')); clean(); return }
    const body = new URLSearchParams({ client_id: clientId, grant_type: 'authorization_code', code,
      redirect_uri: redirectUri(), code_verifier: saved.verifier })
    clean()
    fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
      .then(async response => { if (!response.ok) throw new Error('Spotify a refusé la connexion.'); return response.json() })
      .then(data => {
        sessionStorage.setItem(tokenKey, JSON.stringify({ access: data.access_token, refresh: data.refresh_token, scope: data.scope, expires: Date.now() + data.expires_in * 1000 }))
        setToken(data.access_token)
        // Utiliser l'URL de retour ou revenir à la page d'accueil
  const returnUrl = sessionStorage.getItem(returnUrlKey) || '/'
  const destination = new URL(returnUrl, location.origin)
  if (destination.origin === location.origin && (destination.searchParams.has('project') || destination.searchParams.has('lyrics') || destination.searchParams.get('action') === 'join')) location.replace(destination.href)
  else if (destination.origin === location.origin) history.replaceState(null, '', destination.href)
      })
      .catch(cause => setError(cause.message))
  }, [clientId])

  const fetchDevices = async (currentToken) => {
    if (!currentToken) return []
    try {
      const response = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: { Authorization: `Bearer ${currentToken}` },
        signal: AbortSignal.timeout(5000),
      })
      if (response.ok) {
        const body = await response.json()
        return Array.isArray(body?.devices) ? body.devices : []
      }
    } catch { /* Devices fetch optional */ }
    return []
  }

  useEffect(() => {
    if (!token || !active) return
    let stopped = false
    let halted = false
    let busy = false
    let timeout
    let controller
    const schedule = delay => {
      clearTimeout(timeout)
      if (!stopped && !halted && !document.hidden) timeout = setTimeout(poll, delay)
    }
    const poll = async () => {
      if (stopped || halted || busy || document.hidden) return
      busy = true
      controller = new AbortController()
      let delay = 15000
      try {
        const response = await fetch('https://api.spotify.com/v1/me/player', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
        if (response.status === 401) {
          const saved = JSON.parse(sessionStorage.getItem(tokenKey) || '{}')
          if (saved.refresh && clientId) {
            const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: saved.refresh, client_id: clientId })
            const renewed = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: controller.signal })
            if (renewed.ok) {
              const data = await renewed.json()
              sessionStorage.setItem(tokenKey, JSON.stringify({ access: data.access_token, refresh: data.refresh_token || saved.refresh, scope: data.scope || saved.scope, expires: Date.now() + data.expires_in * 1000 }))
              if (!stopped) setToken(data.access_token)
              return
            }
          }
          sessionStorage.removeItem(tokenKey); setToken(''); throw new Error('Session Spotify expirée. Reconnectez-vous.')
        }
        if (response.status === 429) {
          const seconds = Math.max(10, Number(response.headers.get('Retry-After')) || 30)
          if (!stopped) setRetryAfter(Date.now() + seconds * 1000)
          throw new Error(`Spotify limite les appels (429). Suivi arrêté. Réessayez après ${seconds} secondes.`)
        }
        if (response.status === 403) throw new Error('Spotify refuse l’accès (403). Vérifiez que votre compte est autorisé dans Spotify Developer Dashboard, puis reconnectez Spotify. Le suivi est arrêté.')
        if (response.status !== 204 && !response.ok) throw new Error(`Lecture Spotify inaccessible (${response.status}). Suivi arrêté.`)
        const next = response.status === 204 ? null : { ...await response.json(), observedAt: performance.now() }
        if (!stopped) {
          setState(next)
          onState?.(next)
          setError('')
        }
        if (next?.is_playing && next.item?.id === trackId) delay = 5000
        else if (next?.device?.id) delay = 8000

        // Si aucun lecteur actif (204 ou sans device), vérifier la liste des appareils
        if (!next?.device?.id) {
          const availableDevices = await fetchDevices(token)
          if (!stopped) setDevices(availableDevices)
        } else if (!stopped) {
          setDevices([next.device])
        }
      } catch (cause) {
        if (!stopped && cause.name !== 'AbortError') {
          halted = true
          setError(cause.message)
          setState(null)
          onState?.(null)
        }
      }
      finally { busy = false; schedule(delay) }
    }
    const visibility = () => {
      if (document.hidden) { clearTimeout(timeout); controller?.abort() }
      else schedule(0)
    }
    document.addEventListener('visibilitychange', visibility)
    void poll()
    return () => { stopped = true; clearTimeout(timeout); controller?.abort(); document.removeEventListener('visibilitychange', visibility) }
  }, [token, onState, clientId, trackId, active, retry])

  const matching = state?.item?.id === trackId
  const canControl = (() => { try { return JSON.parse(sessionStorage.getItem(tokenKey) || '{}').scope?.split(' ').includes('user-modify-playback-state') } catch { return false } })()

  const command = async (kind, position) => {
    if (commandBusy || Date.now() < retryAfter || !canControl) return
    setCommandBusy(true)
    try {
      let endpoint = `/${kind}`
      let method = 'PUT'
      let body = undefined

      const activeDeviceId = state?.device?.id || devices.find(d => d.is_active)?.id || devices[0]?.id
      const queryParam = activeDeviceId ? `?device_id=${encodeURIComponent(activeDeviceId)}` : ''

      if (kind === 'seek') {
        endpoint = `/seek?position_ms=${Math.max(0, Math.min(Math.floor(position * 1000), Math.max(0, (state?.item?.duration_ms || 1000) - 1000)))}`
        if (activeDeviceId) endpoint += `&device_id=${encodeURIComponent(activeDeviceId)}`
      } else if (kind === 'play') {
        endpoint = `/play${queryParam}`
        // Si le morceau ne correspond pas ou rien n'est en cours, forcer la lecture du trackId spécifique
        if (trackId && (!matching || !state?.is_playing)) {
          body = JSON.stringify({ uris: [`spotify:track:${trackId}`] })
        }
      } else if (kind === 'pause') {
        endpoint = `/pause${queryParam}`
      }

      const response = await fetch(`https://api.spotify.com/v1/me/player${endpoint}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Aucun appareil Spotify actif trouvé. Veuillez lancer l’application Spotify sur votre appareil.')
        }
        if (response.status === 429) setRetryAfter(Date.now() + Math.max(10, Number(response.headers.get('Retry-After')) || 30) * 1000)
        throw new Error(`Commande Spotify refusée (${response.status}).`)
      }
      setError('')
      setRetry(value => value + 1)
    } catch (cause) { setError(cause.message) }
    finally { setCommandBusy(false) }
  }

  // Support du raccourci Espace pour play/pause
  useEffect(() => {
    if (!spaceShortcut) return
    const keydown = event => {
      if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
        event.target.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]') ||
        event.target.closest?.('button, [role="button"]')) return
      event.preventDefault()
      command(state?.is_playing ? 'pause' : 'play')
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  const progress = state ? spotifyTime(state, clockTick) : 0
  const duration = (state?.item?.duration_ms || 0) / 1000
  const format = value => `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, '0')}`

  const hasDevice = Boolean(state?.device?.id || devices.length > 0)
  const currentDeviceName = state?.device?.name || devices[0]?.name || ''

  if (tvMode && !token) {
    const settingsUrl = publicKaraokeUrl('settings', import.meta.env.BASE_URL)
    const connectUrl = publicKaraokeUrl('spotify-auth', import.meta.env.BASE_URL)
    const target = /^[a-f0-9]{32}$/i.test(clientId) ? connectUrl : settingsUrl
    return (
      <div className="spotify-auth-card">
        <p>{/^[a-f0-9]{32}$/i.test(clientId)
          ? 'Mode TV : connectez Spotify depuis un autre appareil, ce navigateur reprendra la session.'
          : 'Mode TV : configurez d’abord le Client ID Spotify depuis un autre appareil.'}</p>
        <LocalQrCode value={target} label="Adresse Spotify" />
        <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>Ou ouvrez <a href={target}>{target}</a>.</p>
      </div>
    )
  }

  return (
    <div className={`spotify-remote audio-controls-wrap${token && !error ? ' spotify-remote-connected' : ''}`}>
      {!token ? (
        <div className="spotify-auth-card">
          <p>{/^[a-f0-9]{32}$/i.test(clientId) ? 'Connectez votre compte pour écouter et synchroniser directement avec Spotify.' : 'Renseignez le Client ID Spotify dans les Paramètres, puis revenez au studio.'}</p>
          {/^[a-f0-9]{32}$/i.test(clientId) && (
            <button className="neon-btn primary-btn" type="button" onClick={() => void connect(clientId)}>
              Connecter Spotify
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="custom-audio-player glass-panel spotify-media-player">
            <button
              type="button"
              disabled={commandBusy || !canControl}
              aria-label={state?.is_playing ? 'Mettre Spotify en pause' : 'Lancer / Reprendre Spotify'}
              onClick={() => void command(state?.is_playing ? 'pause' : 'play')}
            >
              {state?.is_playing ? <Pause size={20} /> : <Play size={20} />}
            </button>

            <div className="audio-progress">
              <div className="audio-times">
                <span>{format(progress)}</span>
                <span>{format(duration)}</span>
              </div>
              <input
                type="range"
                aria-label="Position Spotify"
                min="0"
                max={duration || 1}
                step="1"
                value={Math.min(progress, duration)}
                disabled={!hasDevice || !duration || !canControl || commandBusy}
                onChange={event => void command('seek', Number(event.target.value))}
              />
            </div>

            <button
              type="button"
              className="spotify-sync-btn"
              title="Resynchroniser la lecture"
              aria-label="Resynchroniser"
              onClick={() => {
                if (Date.now() < retryAfter) return
                if (Date.now() - lastManualSync.current < 2000) return
                lastManualSync.current = Date.now()
                setRetry(v => v + 1)
              }}
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {!canControl && (
            <button className="outline-btn" type="button" onClick={() => void connect(clientId)}>
              Autoriser les commandes Spotify
            </button>
          )}

          {!hasDevice ? (
            <div className="spotify-no-device-banner" style={{ marginTop: '10px' }}>
              <p role="status" style={{ color: '#ffb3ba', margin: '4px 0 8px', fontSize: '0.88rem' }}>
                Aucun appareil Spotify actif détecté.
              </p>
              {trackId && (
                <a
                  className="neon-btn outline-btn"
                  href={`https://open.spotify.com/track/${trackId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', padding: '8px 14px' }}
                >
                  <ExternalLink size={16} /> Veuillez lancer Spotify (Ouvrir le morceau)
                </a>
              )}
            </div>
          ) : (
            <div className="spotify-status-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
              <p role="status" style={{ margin: 0, fontSize: '0.85rem', color: '#c3bfd6' }}>
                {!state
                  ? `Prêt sur « ${currentDeviceName} ». Cliquez sur Play pour démarrer le morceau.`
                  : matching
                  ? `${state.is_playing ? 'Lecture en cours' : 'En pause'} · ${spotifyTime(state).toFixed(1)} s · ${state.device?.name || currentDeviceName}`
                  : `Autre morceau en lecture : « ${state.item?.name || 'Inconnu'} ». Cliquez sur Play pour lancer le bon morceau.`}
              </p>
              {trackId && (!matching || !state?.is_playing) && (
                <button
                  type="button"
                  className="outline-btn"
                  style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                  onClick={() => void command('play')}
                >
                  Mettre cette musique sur {currentDeviceName || 'Spotify'}
                </button>
              )}
              {trackId && (
                <a
                  href={`https://open.spotify.com/track/${trackId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#4cc9f0', fontSize: '0.8rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <ExternalLink size={13} /> Ouvrir Spotify
                </a>
              )}
            </div>
          )}

          <div style={{ marginTop: '6px' }}>
            <button
              className="outline-btn"
              type="button"
              style={{ padding: '2px 8px', fontSize: '0.75rem', opacity: 0.6 }}
              onClick={() => { sessionStorage.removeItem(tokenKey); setToken(''); setState(null); onState?.(null) }}
            >
              Déconnecter Spotify
            </button>
          </div>
        </>
      )}

      {error && <p className="error" role="alert" style={{ marginTop: '8px' }}>{error}</p>}
      {error && token && (
        <button
          className="outline-btn"
          type="button"
          onClick={() => {
            if (Date.now() < retryAfter) {
              setError(`Attendez encore ${Math.ceil((retryAfter - Date.now()) / 1000)} s avant de réessayer.`)
              return
            }
            setError('')
            setRetry(value => value + 1)
          }}
        >
          Réessayer le suivi
        </button>
      )}
    </div>
  )
}
