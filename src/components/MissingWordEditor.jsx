import { useEffect, useState } from 'react'
import { lyricQuizzes } from '../lyricMarkup.mjs'
import { stampHiddenWord, updateHiddenText } from '../missingWords.mjs'

export default function MissingWordEditor({ line, onChange, audioRef, selectedGroup, onSelectGroup }) {
  const targets = lyricQuizzes(line.text)
  const selected = targets.find(target => target.group === selectedGroup) || targets[0]
  const [notice, setNotice] = useState('')
  const changeTiming = (target, cue, duration) => {
    try {
      if (cue !== null && cue >= line.end - line.start) throw new Error('Le repère doit se situer pendant cette phrase.')
      const text = stampHiddenWord(line.text, target.group, cue, duration)
      onChange(updateHiddenText(line, text))
      setNotice(cue === null ? 'Durée enregistrée. Calez le mot avec V.' : `Repère de « ${target.answer} » : ${(line.start + cue).toFixed(2)} s dans la chanson.`)
    } catch (error) { setNotice(error.message) }
  }
  const stamp = () => {
    const audio = audioRef.current
    if (!selected) return
    if (!audio || audio.currentTime < line.start || audio.currentTime >= line.end) {
      setNotice('Placez la musique pendant la phrase sélectionnée pour caler ce mot.'); return
    }
    changeTiming(selected, audio.currentTime - line.start, selected.duration ?? line.gameModes?.muteDuration ?? 2)
  }
  useEffect(() => {
    const keydown = event => {
      if ((event.code !== 'KeyV' && event.key?.toLowerCase() !== 'v') || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
        event.target.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      event.preventDefault()
      stamp()
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })
  const updateChoice = (targetIndex, choiceIndex, value) => {
    const wordChoices = targets.map((_, index) => [...(line.gameModes?.wordChoices?.[index] ?? (index === 0 ? line.gameModes?.multipleChoices || [] : []))])
    wordChoices[targetIndex][choiceIndex] = value
    onChange({ ...line, gameModes: { ...line.gameModes, wordChoices } })
  }

  return <section className="missing-word-editor" aria-label="Réglages des mots cachés">
    <h3>Mots cachés · {targets.length}</h3>
    <p>Sélectionnez une ligne ci-dessous, puis appuyez sur <kbd>V</kbd> au moment du mot. Chaque mot possède ses propres choix.</p>
    <button type="button" className="outline-btn" onClick={stamp} disabled={!selected}>Caler « {selected?.answer || 'mot'} » maintenant · V</button>
    {notice && <p role="status">{notice}</p>}
    <ol className="missing-word-list">
      {targets.map((target, index) => {
        const duration = target.duration ?? line.gameModes?.muteDuration ?? 2
        const choices = line.gameModes?.wordChoices?.[index] ?? (index === 0 ? line.gameModes?.multipleChoices || [] : [])
        return <li key={target.group} className={selected?.group === target.group ? 'chosen' : ''}>
          <button type="button" className="missing-word-select" aria-pressed={selected?.group === target.group}
            onClick={() => onSelectGroup(target.group)}>{index + 1}. « {target.answer} » <span>{selected?.group === target.group ? 'V → ce mot' : 'Sélectionner'}</span></button>
          <p className="missing-word-marker">{target.cue === null ? 'À caler avec V' : `Repère : ${(line.start + target.cue).toFixed(2)} s · +${target.cue.toFixed(2)} s dans la phrase`}</p>
          <div hidden={selected?.group !== target.group}>
          <label>Comportement pour « {target.answer} »
            <select value={duration} onChange={event => changeTiming(target, target.cue, Number(event.target.value))}>
              {[...new Set([0, 0.5, 1, 1.5, 2, 3, 4, 5, 8, 10, duration])].sort((a, b) => a - b).map(value =>
                <option key={value} value={value}>{value === 0 ? '0 — Pause manuelle (Espace)' : `${value} s — Couper le son`}</option>)}
            </select>
          </label>
          <label>Repère dans la phrase (secondes)
            <input type="number" min="0" step="0.01" max={Math.max(0, line.end - line.start - 0.01)}
              aria-label={`Repère de ${target.answer}`} key={`${target.group}:${target.cue}`} defaultValue={target.cue ?? ''} placeholder="Touche V"
              onBlur={event => {
                const value = event.target.value
                if (value.trim() && Number(value) !== target.cue) changeTiming(target, Number(value), duration)
              }} />
          </label>
          <p className="missing-word-explanation">{duration === 0 ? 'La musique s’arrête au repère. Répondre ne la relance pas : appuyez sur Espace.' : `À partir du repère, le son est coupé pendant ${duration} s au maximum, jusqu’au mot suivant ou à la fin de la phrase.`}</p>
          <fieldset><legend>Autres réponses pour « {target.answer} »</legend>
            {[0, 1, 2].map(choiceIndex => <input key={choiceIndex} type="text" value={choices[choiceIndex] || ''}
              aria-label={`Mauvais choix ${choiceIndex + 1} pour ${target.answer}`} placeholder={`Mauvais choix ${choiceIndex + 1}`}
              onChange={event => updateChoice(index, choiceIndex, event.target.value)} />)}
          </fieldset>
          </div>
        </li>
      })}
    </ol>
    <small>V fonctionne hors des champs de saisie. Pour plusieurs mots, posez un repère distinct pour chacun avant d’exporter.</small>
  </section>
}
