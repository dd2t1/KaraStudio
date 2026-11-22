import { useEffect, useState } from 'react'
import PlaySetup from './PlaySetup'
import { claimCastPair, formatDeviceCode, normalizeDeviceCode } from '../castPair.mjs'

const storageKey = 'karaoke.cast.control'

export default function PhoneControl() {
  const code = normalizeDeviceCode(new URLSearchParams(location.search).get('code'))
  const [session, setSession] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (code.length !== 6) {
      setError('Ce lien ne contient pas de code de télé.')
      return
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null')
      if (saved?.code === code && saved.room && saved.presenter) {
        setSession(saved)
        return
      }
    } catch { /* Claim a fresh link when the saved session is unreadable. */ }
    const controller = new AbortController()
    claimCastPair(code, import.meta.env.BASE_URL).then(claim => {
      if (controller.signal.aborted) return
      const next = { code, room: claim.room, presenter: claim.presenter }
      sessionStorage.setItem(storageKey, JSON.stringify(next))
      setSession(next)
    }).catch(cause => { if (!controller.signal.aborted) setError(cause.message) })
    return () => controller.abort()
  }, [code])

  if (!session) {
    return <main className="phone-link">
      <p>{error || `Liaison avec la télé ${formatDeviceCode(code)}…`}</p>
    </main>
  }
  return <PlaySetup controlOnly castRoom={session.room} castPresenter={session.presenter} castCode={code} onBack={() => {}} />
}
