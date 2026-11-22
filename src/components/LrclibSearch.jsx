import { useEffect, useState } from 'react'

export default function LrclibSearch({ onImport }) {
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [results, setResults] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [request, setRequest] = useState(null)

  useEffect(() => () => request?.abort(), [request])

  const search = async event => {
    event.preventDefault()
    request?.abort()
    const controller = new AbortController()
    setRequest(controller)
    setLoading(true)
    setError('')
    setSearched(false)
    setResults([])
    setSelectedId(null)
    try {
      const query = new URLSearchParams({ track_name: title.trim(), artist_name: artist.trim() })
      const response = await fetch(`https://lrclib.net/api/search?${query}`, {
        headers: { 'Lrclib-Client': 'karaoke-react/1.0' }, signal: controller.signal,
      })
      if (response.status === 429) throw new Error(`Trop de recherches. Réessayez dans ${response.headers.get('Retry-After') || 'quelques'} secondes.`)
      if (!response.ok) throw new Error('La recherche LRCLIB a échoué. Réessayez plus tard.')
      const data = await response.json()
      if (!Array.isArray(data)) throw new Error('Réponse LRCLIB invalide.')
      setResults(data.filter(item => item && Number.isFinite(item.id) && (item.syncedLyrics || item.plainLyrics)))
      setSearched(true)
    } catch (cause) {
      if (cause.name !== 'AbortError') setError(cause.message)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  const selected = results.find(item => item.id === selectedId)
  return <details className="reference-input reference-disclosure">
    <summary>Rechercher des paroles sur LRCLIB <span>· facultatif</span></summary>
    <div className="input-group reference-content">
      <p>Indiquez le titre et l’artiste de l’enregistrement. Vérifiez le texte et la durée avant l’import.</p>
      <form onSubmit={search}>
        <label htmlFor="lrclib-title">Titre</label>
        <input id="lrclib-title" value={title} onChange={event => setTitle(event.target.value)} required />
        <label htmlFor="lrclib-artist">Artiste</label>
        <input id="lrclib-artist" value={artist} onChange={event => setArtist(event.target.value)} required />
        <button className="outline-btn" disabled={loading || !title.trim() || !artist.trim()} type="submit">{loading ? 'Recherche…' : 'Rechercher'}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {searched && !results.length && <p role="status">Aucune parole trouvée pour cette recherche.</p>}
      {results.length > 0 && <div>
        <p>{results.length} résultat{results.length > 1 ? 's' : ''}. Choisissez la version qui correspond à votre audio.</p>
        <ul className="saved-song-list">{results.map(item => {
          return <li key={item.id}>
            <label><input type="radio" name="lrclib-result" checked={selectedId === item.id} onChange={() => setSelectedId(item.id)} /> {item.trackName} — {item.artistName} · {Math.floor(item.duration / 60)}:{String(Math.round(item.duration % 60)).padStart(2, '0')} · {item.syncedLyrics ? 'timings par ligne' : 'sans timings'}</label>
          </li>
        })}</ul>
      </div>}
      {selected && <>
        <label htmlFor="lrclib-preview">Aperçu des paroles</label>
        <textarea id="lrclib-preview" readOnly rows={7} value={selected.syncedLyrics || selected.plainLyrics || ''} />
        <button className="outline-btn" type="button" onClick={() => onImport(selected.syncedLyrics || selected.plainLyrics, selected)}>Importer ces paroles</button>
        <small>Source : LRCLIB. Vérifiez les paroles et leur droit d’utilisation avant diffusion.</small>
      </>}
    </div>
  </details>
}
