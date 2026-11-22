import { useEffect, useState } from 'react'
import { plainLyrics } from '../lyricMarkup.mjs'
import { AI_STAGES } from '../aiProgress.mjs'

export default function AiActivityPanel({ entries, onRetry }) {
  const [now, setNow] = useState(() => Date.now())
  const relevant = entries.filter(entry => !entry.payload.line.isInstrumental && entry.payload.line.text.trim())
  const active = relevant.find(entry => entry.state === 'loading')
  const last = relevant.filter(entry => entry.state === 'done' || entry.state === 'error').at(-1)
  const current = active || last
  const finished = relevant.filter(entry => entry.state === 'done' || entry.state === 'error').length
  const errors = relevant.filter(entry => entry.state === 'error').length
  const index = current ? entries.indexOf(current) : -1
  const startedAt = active?.startedAt
  useEffect(() => {
    if (!startedAt) return
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [startedAt])
  const elapsed = active ? Math.max(0, now - active.startedAt) : current?.elapsedMs || 0
  return <section className="ai-activity-panel glass-panel" aria-label="Suivi IA en direct">
    <p className="ai-activity-kicker">✦ Suivi local en direct</p>
    <h3>{active ? 'Analyse en cours' : finished < relevant.length ? 'Préparation de l’analyse' : 'Analyse terminée'}</h3>
    <p>{finished} / {relevant.length} phrases traitées{errors > 0 ? ` · ${errors} en erreur` : ''}</p>
    <progress max={Math.max(1, relevant.length)} value={finished} aria-label="Progression des analyses IA" />
    {current && <>
      <p className="ai-activity-phrase">Phrase {index + 1}<br /><strong>{plainLyrics(current.payload.line.text)}</strong></p>
      <p className="ai-activity-stage" role="status">{current.state === 'error' ? 'Analyse interrompue' : active ? AI_STAGES[current.progress?.stage] || 'Connexion au serveur' : current.cached ? 'Résultat récupéré du cache' : 'Analyse terminée'}</p>
      <p className="ai-activity-time">{Math.floor(elapsed / 1000)} s pour cette phrase</p>
      <ol className="ai-activity-log" aria-label="Étapes de cette phrase">
        {(current.history || []).map((event, i) => <li key={i}><span>{AI_STAGES[event.stage]}</span><small>{Math.floor(event.elapsedMs / 1000)} s</small></li>)}
      </ol>
      {current.error && <p role="alert">{current.error}</p>}
      {current.warnings?.map(warning => <p className="ai-activity-warning" key={warning}>{warning}</p>)}
    </>}
    {relevant.some(entry => entry.state === 'error' || entry.warnings?.length) && <button type="button" onClick={onRetry}>Réessayer</button>}
    <small>Étapes réelles du traitement, pas le raisonnement interne. Rien n’est appliqué automatiquement.</small>
  </section>
}
