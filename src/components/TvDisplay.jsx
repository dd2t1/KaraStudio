import { useEffect, useState } from 'react'
import CastScreen from './CastScreen'
import LocalQrCode from './LocalQrCode'
import { createCastPair, castPairStatus, formatDeviceCode } from '../castPair.mjs'
import { publicKaraokeUrl } from '../publicKaraokeUrl.mjs'
import { setTvMode } from '../tvMode.js'
import '../castScreen.css'

const storageKey = 'karaoke.cast.display'

export default function TvDisplay({ onExit }) {
  const [pair, setPair] = useState(null)
  const [claimed, setClaimed] = useState(false)
  const [hasLyrics, setHasLyrics] = useState(false)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const prepare = async () => {
      setError('')
      try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null')
        const existing = saved?.code ? await castPairStatus(saved.code, import.meta.env.BASE_URL) : null
        if (controller.signal.aborted) return
        if (existing) {
          setPair({ code: existing.code, room: existing.room })
          setClaimed(existing.claimed)
          return
        }
        const created = await createCastPair(import.meta.env.BASE_URL)
        if (controller.signal.aborted) return
        sessionStorage.setItem(storageKey, JSON.stringify(created))
        setPair(created)
        setClaimed(false)
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause.message)
      }
    }
    void prepare()
    return () => controller.abort()
  }, [version])

  useEffect(() => {
    if (!pair?.code) return
    const timer = setInterval(async () => {
      const status = await castPairStatus(pair.code, import.meta.env.BASE_URL).catch(() => null)
      if (status) setClaimed(status.claimed)
    }, 1000)
    return () => clearInterval(timer)
  }, [pair])

  const reset = () => {
    sessionStorage.removeItem(storageKey)
    setPair(null)
    setClaimed(false)
    setHasLyrics(false)
    setVersion(value => value + 1)
  }
  const leave = () => {
    setTvMode(false)
    onExit?.()
  }
  const controlUrl = pair ? publicKaraokeUrl('control', import.meta.env.BASE_URL, { code: pair.code }) : ''

  return <main className="cast-screen cast-display">
    {pair && <CastScreen room={pair.room} embedded onSnapshot={snapshot => setHasLyrics(Boolean(snapshot?.lyrics?.length))} />}
    {!hasLyrics && <section className="cast-pair" aria-label="Lier un téléphone">
      <p className="cast-notice">{claimed ? 'Téléphone lié. Choisissez un morceau sur le téléphone.' : 'Scannez pour commander cette télé'}</p>
      {controlUrl && <LocalQrCode value={controlUrl} label="Lien de commande" size={280} />}
      <p className="cast-device-code" aria-label="Code de la télé">{pair ? formatDeviceCode(pair.code) : '···· ··'}</p>
      <p className="cast-pair-help">L’image reste ici. Le téléphone devient la télécommande.</p>
      {error && <p role="alert">{error}</p>}
      <div className="cast-pair-actions">
        <button type="button" className="neon-btn outline-btn" onClick={reset}>Nouveau code</button>
        <button type="button" className="neon-btn outline-btn" onClick={leave}>Quitter l’écran</button>
      </div>
    </section>}
    {hasLyrics && pair && <p className="cast-linked">Télé liée · {formatDeviceCode(pair.code)} <button type="button" onClick={reset}>Nouveau code</button></p>}
  </main>
}
