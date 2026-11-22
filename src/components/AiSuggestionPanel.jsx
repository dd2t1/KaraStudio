import { useEffect, useState } from 'react'
import LyricText from './LyricText'
import { AI_CATEGORIES, applySuggestion, suggestionConflict } from '../aiSuggestions.mjs'
import useMotionPreference from '../useMotionPreference'

function AnimationPreview({ text, cue, duration, animationProfiles }) {
  const reducedMotion = useMotionPreference()
  const [time, setTime] = useState(cue + duration / 2)
  const [started, setStarted] = useState(null)
  useEffect(() => {
    if (started === null || reducedMotion) return
    let frame
    const tick = now => {
      const elapsed = Math.min(duration, Math.max(0, (now - started) / 1000))
      setTime(cue + elapsed)
      if (elapsed >= duration) setStarted(null)
      else frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [started, cue, duration, reducedMotion])
  return <div className="ai-preview">
    <small>Aperçu de l’animation</small>
    <LyricText text={text} time={time} animationProfiles={animationProfiles} />
    <div className="ai-actions"><button type="button" disabled={reducedMotion} onClick={() => {
      if (started !== null) setStarted(null)
      else { setTime(cue); setStarted(performance.now()) }
    }}>{started === null ? '▶ Jouer l’animation' : '■ Arrêter l’animation'}</button></div>
    {reducedMotion && <small>Les animations sont réduites dans les préférences de votre appareil.</small>}
  </div>
}

export default function AiSuggestionPanel({ line, entry, category, onApply, onIgnore, ignored, onRetry }) {
  const [confirmed, setConfirmed] = useState({})
  if (entry.state === 'error') return <section className="ai-panel"><p role="alert">{entry.error}</p><button type="button" onClick={onRetry}>Réessayer</button></section>
  if (entry.state !== 'done') return <section className="ai-panel" role="status">{entry.state === 'loading' ? 'Analyse IA en cours…' : 'Analyse IA en attente…'}</section>
  const suggestions = entry.suggestions.filter(item => (!category || item.category === category) && !ignored.has(`${entry.key}:${item.id}`))
  return <section className="ai-panel" aria-label="Suggestions IA">
    <h3>✦ Suggestions IA {category ? `· ${AI_CATEGORIES[category]}` : ''}</h3>
    {entry.warnings.map(warning => <p className="ai-warning" key={warning}>{warning}</p>)}
    {entry.warnings.length > 0 && <button type="button" onClick={onRetry}>Réessayer les moteurs indisponibles</button>}
    {!suggestions.length && <p>Aucune suggestion.</p>}
    {suggestions.map(suggestion => {
      const conflict = suggestionConflict(line, suggestion)
      let preview
      try { if (suggestion.category !== 'review') preview = applySuggestion(line, suggestion, true) } catch { /* Invalid proposals cannot be applied. */ }
      return <article className="ai-card" key={suggestion.id}>
        <strong>{AI_CATEGORIES[suggestion.category]} {suggestion.target && `· ${suggestion.target.text}`}</strong>
        <p>{suggestion.explanation}</p>
        <small>{suggestion.engine === 'lmstudio' ? 'LM Studio' : suggestion.engine === 'laya' ? 'Laya' : suggestion.engine === 'laya+lmstudio' ? 'Laya + LM Studio' : 'Vérification'}
          {suggestion.timingSource && ` · ${suggestion.timingSource === 'words' ? 'Repère par mot' : 'À caler — placement estimé'} · ${suggestion.cue.toFixed(2)} s`}</small>
        {suggestion.category === 'qcm' && <p>Difficulté : {suggestion.difficulty}<br />Réponse : {suggestion.target.text}<br />Autres choix : {suggestion.choices.join(' · ')}</p>}
        {suggestion.category === 'animation' && <p>Effet : {suggestion.effect} · {suggestion.duration.toFixed(2)} s</p>}
        {preview && (suggestion.category === 'animation'
          ? <AnimationPreview text={preview.text} cue={suggestion.cue} duration={suggestion.duration} animationProfiles={preview.animationProfiles} />
          : <div className="ai-preview"><small>Aperçu</small><LyricText text={preview.text} time={(suggestion.cue || 0) + (suggestion.duration || 0) / 2} hideAnswer={suggestion.category === 'qcm'} animationProfiles={preview.animationProfiles} /></div>)}
        {conflict && <label className="ai-confirm"><input type="checkbox" checked={Boolean(confirmed[suggestion.id])} onChange={event => setConfirmed(previous => ({ ...previous, [suggestion.id]: event.target.checked }))} />Confirmer le remplacement des annotations concernées</label>}
        <div className="ai-actions">
          {preview && <button type="button" disabled={conflict && !confirmed[suggestion.id]} onClick={() => onApply(suggestion, Boolean(confirmed[suggestion.id]))}>Appliquer</button>}
          <button type="button" onClick={() => onIgnore(suggestion)}>Ignorer</button>
        </div>
      </article>
    })}
  </section>
}
