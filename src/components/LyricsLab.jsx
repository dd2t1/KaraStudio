import { useEffect, useRef, useState } from 'react'
import { downloadBlob } from '../projectExport.mjs'
import '../lyricsLab.css'
import LabAnnotatedText from './LabAnnotatedText'

function Findings({ title, items }) {
  return <section><h3>{title}</h3>{items.length ? <ul className="lab-findings">{items.map((item, index) => <li key={index}><strong>{item.text}</strong><span>×{item.count}</span><small>Ligne{item.lines?.length > 1 ? 's' : ''} {(item.lines || [item.line]).join(', ')}</small></li>)}</ul> : <p className="lab-muted">Aucune répétition détectée dans cette catégorie.</p>}</section>
}

export default function LyricsLab({ lines, onClose, onShowMarks }) {
  const dialog = useRef(null)
  const worker = useRef(null)
  const analysisSource = useRef(null)
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('rhymes')
  const [showMarks, setShowMarks] = useState(false)
  useEffect(() => {
    const previous = document.activeElement
    const modal = dialog.current
    modal.showModal()
    return () => { worker.current?.terminate(); modal.close(); previous?.focus() }
  }, [])
  const analyze = () => {
    worker.current?.terminate()
    setBusy(true); setError(''); setReport(null)
    analysisSource.current = lines
    try {
      const job = new Worker(new URL('../lyricsLab.worker.js', import.meta.url), { type: 'module' })
      worker.current = job
      job.onmessage = event => {
        if (event.data.report) setReport(event.data.report)
        else setError(event.data.error)
        setBusy(false); job.terminate(); worker.current = null
      }
      job.onerror = () => { setError('Le traitement séparé n’a pas pu démarrer. Vous pouvez fermer le laboratoire et poursuivre l’édition.'); setBusy(false); job.terminate(); worker.current = null }
      job.postMessage(lines.map(({ text, start, end, section, isInstrumental }) => ({ text, start, end, section, isInstrumental })))
    } catch { setBusy(false); setError('Le laboratoire n’est pas disponible dans ce navigateur.') }
  }
  return <dialog ref={dialog} className="lyrics-lab" role="dialog" aria-labelledby="lab-title" onCancel={onClose}>
    <header><div><small>EXPÉRIMENTAL · LECTURE SEULE</small><h2 id="lab-title">Laboratoire des paroles</h2></div><button onClick={onClose} aria-label="Fermer le laboratoire">Fermer ×</button></header>
    <p>Explorez les répétitions et la forme du texte. Aucun changement n’est appliqué au projet et aucune donnée n’est envoyée à un serveur.</p>
    <div className="lab-actions"><button onClick={analyze} disabled={busy}>{busy ? 'Analyse en cours…' : report ? 'Relancer l’analyse' : 'Analyser les paroles'}</button>
      {busy && <button onClick={() => { worker.current?.terminate(); worker.current = null; setBusy(false) }}>Annuler</button>}
      {report && <button onClick={() => downloadBlob(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), 'statistiques-paroles.json')}>Exporter le rapport JSON</button>}
    </div>
    {error && <p role="alert">{error}</p>}
    {report && <>
      <div className="lab-metrics" aria-live="polite"><div><strong>{report.summary.words}</strong><span>mots</span></div><div><strong>{report.summary.uniqueWords}</strong><span>mots distincts</span></div><div><strong>{report.summary.sungLines}</strong><span>lignes avec paroles</span></div><div><strong>{Math.round(report.summary.lexicalDiversity * 100)} %</strong><span>diversité lexicale</span></div></div>
      <div className="lab-tabs" role="group" aria-label="Résultats du laboratoire">{[['rhymes', 'Rimes possibles'], ['repeats', 'Répétitions'], ['variants', 'Variantes'], ['lyrics', 'Paroles & repères'], ['words', 'Mots & vecteurs'], ['timing', 'Longueur & débit']].map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</div>
      {tab === 'rhymes' && <section><h3>Rimes internes et fins de lignes</h3><p>Hypothèses pour le français, dans la même ligne ou les lignes immédiatement voisines, sans écoute du son. Elles aident à retrouver des passages similaires, mais ne déplacent aucun repère de synchronisation.</p>{report.rhymes.length ? report.rhymes.map(group => <div className="lab-pattern" key={group.id}><strong>{group.key.replace('écrit:', 'Finale écrite : ')}</strong><p>{group.occurrences.map(item => `${item.word} (L${item.line}, ${item.atEnd ? 'fin' : 'interne'})`).join(' · ')}</p><small>{group.basis}</small></div>) : <p>Aucun rapprochement avec ces règles. Cela ne signifie pas que la chanson ne contient pas de rimes.</p>}</section>}
      {tab === 'variants' && <section><h3>Répétitions avec différences</h3><p>Base commune colorée, terminaisons différentes surlignées en ambre. Ces familles sont des pistes orthographiques, pas une analyse grammaticale.</p>{report.variants.map(group => <div className="lab-pattern" key={group.id}><strong>Base « {group.root} »</strong><p>{group.forms.map(form => <span className="lab-form" key={form.word}>{form.word.slice(0, group.root.length)}<mark className="lab-difference">{form.word.slice(group.root.length)}</mark><small> ×{form.count} · L{form.lines.join(', ')}</small></span>)}</p></div>)}{!report.variants.length && <p>Aucune famille de variantes détectée.</p>}<h3>Phrases proches avec variantes</h3>{report.nearLines.length ? report.nearLines.map((group, index) => <div className="lab-pattern" key={index}>{group.map(item => <p key={item.line}>L{item.line} · <LabAnnotatedText tokens={report.annotatedLines[item.line - 1].tokens} /></p>)}</div>) : <p>Aucune phrase rapprochée par les familles de terminaisons.</p>}</section>}
      {tab === 'lyrics' && <section><h3>Paroles annotées</h3><label className="lab-mark-toggle"><input type="checkbox" checked={showMarks} onChange={event => setShowMarks(event.target.checked)} /> Afficher les repères colorés</label><p className="lab-muted">Les mots courants sont atténués, sauf dans un motif répété. Fond coloré : répétition ou famille de variantes. Ambre et trait pointillé : lettres différentes. Soulignement : rime candidate. Survolez un mot pour connaître le rapprochement.</p>{report.annotatedLines.map(row => <div className="lab-lyric-line" key={row.line}><small>L{row.line}{row.start !== null ? ` · ${row.start.toFixed(2)} s` : ''}</small><p>{showMarks ? <LabAnnotatedText tokens={row.tokens} /> : row.tokens.map(token => token.text).join('')}</p></div>)}{onShowMarks && <button onClick={() => onShowMarks(report, analysisSource.current)}>Afficher ces repères dans le studio</button>}</section>}
      {tab === 'repeats' && <div className="lab-results"><Findings title="Petites répétitions consécutives" items={report.immediateRepeats} /><Findings title="Motifs de 2 à 5 mots" items={report.motifs} /><Findings title="Débuts de phrases récurrents" items={report.repeatedOpenings} /><Findings title="Lignes répétées" items={report.repeatedLines} /><p className="lab-muted">Jusqu’à 40 résultats par liste, 100 petites répétitions. Les motifs peuvent se chevaucher et ne traversent pas les lignes.</p></div>}
      {tab === 'words' && <section><h3>Une fiche mesurable par mot</h3><p>Ces vecteurs sont des listes de mesures explicables, pas des représentations du sens par une IA. Dimensions : {report.vectorDimensions.join(' · ')}.</p><div className="lab-table-wrap"><table><thead><tr><th>Mot</th><th>Occurrences</th><th>Lignes</th><th>Vecteur</th></tr></thead><tbody>{report.vocabulary.slice(0, 100).map(item => <tr key={item.word}><td>{item.word}</td><td>{item.count}</td><td>{item.lines.join(', ')}</td><td><code>{item.vector.join(' · ')}</code></td></tr>)}</tbody></table></div><p className="lab-muted">Les 100 mots les plus fréquents sont affichés. Le rapport exporté contient le vocabulaire complet. La position va de 0 (début) à 1 (fin).</p></section>}
      {tab === 'timing' && <section><h3>Débit apparent par ligne</h3><p>Mots divisés par la durée synchronisée. Les pauses à l’intérieur d’une ligne sont incluses : ce n’est pas une mesure du rythme musical.</p>{report.density.length ? <div className="lab-table-wrap"><table><thead><tr><th>Ligne</th><th>Mots</th><th>Durée (s)</th><th>Mots/s</th></tr></thead><tbody>{report.density.slice(0, 100).map(item => <tr key={item.line}><td>{item.line}</td><td>{item.words}</td><td>{item.duration}</td><td>{item.wordsPerSecond}</td></tr>)}</tbody></table></div> : <p>Aucun timing exploitable. Le rapport contient les longueurs des lignes, sans extrapoler de débit.</p>}<p className="lab-muted">Jusqu’à 100 lignes affichées ; toutes figurent dans le rapport.</p></section>}
      <details className="lab-method"><summary>Comment lire ces statistiques ?</summary><p>{report.analysisWindow}</p><p>{report.method}</p><p>{report.limits}</p><p>La diversité lexicale est le nombre de mots distincts divisé par le nombre total de mots. Elle dépend de la longueur de la chanson : ce n’est pas une note de qualité.</p></details>
    </>}
  </dialog>
}
