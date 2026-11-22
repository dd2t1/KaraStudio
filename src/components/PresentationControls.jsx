import { useState } from 'react'
import { Minus, Plus, Type, MoveRight, MoveUp, Maximize2, Blend, Ban } from 'lucide-react'

const transitions = [
  ['none', 'Aucune', Ban], ['fade', 'Fondu', Blend], ['slide', 'Glissé', MoveRight],
  ['rise', 'Montée', MoveUp], ['zoom', 'Zoom', Maximize2],
]

function FontSize({ value, onChange }) {
  const [draft, setDraft] = useState(String(value))
  const commit = () => {
    const number = Number(draft)
    const next = draft.trim() && Number.isFinite(number) ? Math.min(120, Math.max(20, Math.round(number))) : value
    setDraft(String(next))
    onChange(next)
  }
  return <div className="font-size-control">
    <button type="button" aria-label="Réduire la taille" disabled={value <= 20} onClick={() => onChange(Math.max(20, value - 2))}><Minus size={14} /></button>
    <label><input aria-label="Taille maximale du texte" type="number" min="20" max="120" value={draft}
      onChange={event => setDraft(event.target.value)} onBlur={commit}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /><span>px</span></label>
    <button type="button" aria-label="Augmenter la taille" disabled={value >= 120} onClick={() => onChange(Math.min(120, value + 2))}><Plus size={14} /></button>
  </div>
}

export default function PresentationControls({ line, scope, onScopeChange, onChange }) {
  return <section className="presentation-controls" aria-label="Apparence des paroles">
    <div className="scope-control" role="group" aria-label="Appliquer les réglages à">
      {[['line', 'Phrase'], ['section', 'Section'], ['all', 'Tout']].map(([value, label]) =>
        <button type="button" key={value} aria-pressed={scope === value} disabled={value === 'section' && line.sectionId == null} onClick={() => onScopeChange(value)}>{label}</button>)}
    </div>
    <h4><Type size={15} /> Typographie</h4>
    <label className="font-family-field">Police
      <select value={line.fontFamily || 'default'} onChange={event => onChange('fontFamily', event.target.value)}>
        <option value="default">Police du thème</option><option value="sans">Arial · Sans sérif</option><option value="serif">Georgia · Sérif</option><option value="rounded">Trebuchet · Humaniste</option><option value="mono">Courier · Monospace</option>
      </select>
    </label>
    <div className="property-row"><span>Taille maximale</span><FontSize key={`${line.fontSize || 80}:${line.start}`} value={line.fontSize || 80} onChange={value => onChange('fontSize', value)} /></div>
    <small className="property-note">S’adapte à la largeur de l’écran.</small>
    <h4>Entrée de la phrase</h4>
    <div className="transition-choices" role="group" aria-label="Transition vers la phrase">
      {transitions.map(([value, label, Icon]) => <button type="button" key={value} aria-pressed={(line.transition || 'none') === value} onClick={() => onChange('transition', value)}><Icon size={19} /><span>{label}</span></button>)}
    </div>
    <p className="property-note">Appliqué à {scope === 'all' ? 'toutes les paroles' : scope === 'section' ? 'cette section' : 'cette phrase'}. Retrouvez le résultat dans Visualiser.</p>
  </section>
}
