import { useEffect, useRef, useState } from 'react'
import './SongSearch.css'
import { songLaunchUrl } from '../songLaunch.mjs'

export default function SongSearch({ onLaunch, onJoin, busy }) {
  const [query, setQuery] = useState('')
  const [searchedQuery, setSearchedQuery] = useState('')
  const [data, setData] = useState(null)
  const [filter, setFilter] = useState('ready')
  const [limit, setLimit] = useState(10)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(null)
  useEffect(() => () => request.current?.abort(), [])
  const search = async (catalog = false) => {
    const text = catalog ? searchedQuery : query.trim()
    if (text.length < 2) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    setData(null)
    setLimit(10)
    setSearchedQuery(text)
    try {
      const params = new URLSearchParams({ q: text })
      if (catalog) params.set('catalog', '1')
      const response = await fetch(`${import.meta.env.BASE_URL}api/home-assistant/search?${params}`, { signal: controller.signal })
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('La recherche est indisponible : redémarrez l’API karaoké pour charger sa dernière version.')
      }
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'La recherche est indisponible.')
      if (!Array.isArray(result.results)) throw new Error('Réponse de recherche invalide.')
      setData(result)
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause.message)
    } finally { if (!controller.signal.aborted) setLoading(false) }
  }
  const ready = item => item.project_id || (item.spotify_id && item.lyrics_id && item.badges?.includes('Paroles synchronisées'))
  const results = (data?.results || []).filter(item => filter === 'all' || (filter === 'projects' ? item.project_id : ready(item)))
  return <section className="song-search" aria-labelledby="song-search-title">
    <h2 id="song-search-title">Rechercher une chanson</h2>
    <button type="button" className="outline-btn" disabled={busy} onClick={onJoin}>Rejoindre le lecteur Spotify</button>
    <p>Suivre le morceau en cours et rechercher ses paroles automatiquement.</p>
    <form onSubmit={event => { event.preventDefault(); void search() }}>
      <label htmlFor="song-search-query">Titre ou artiste</label>
      <div className="song-search-controls">
        <input id="song-search-query" type="search" minLength={2} maxLength={160} required value={query} onChange={event => setQuery(event.target.value)} placeholder="Ex. : sous influence" />
        <button className="outline-btn" disabled={loading || query.trim().length < 2}>{loading ? 'Recherche…' : 'Rechercher'}</button>
      </div>
    </form>
    <label htmlFor="song-search-filter">Afficher</label>
    <select id="song-search-filter" value={filter} onChange={event => { setFilter(event.target.value); setLimit(10) }}>
      <option value="ready">Prêts à chanter</option><option value="projects">Projets existants</option><option value="all">Tous</option>
    </select>
    {error && <p role="alert">{error}</p>}
    <div role="status" aria-live="polite">{loading ? 'Recherche dans Home Assistant, Spotify et LRCLIB…' : data ? `${results.length} résultat(s) pour « ${searchedQuery} ».` : 'Recherchez vos projets ou un morceau dans les catalogues.'}</div>
    {data?.messages?.map((message, index) => <p key={index}>{message}</p>)}
    {data?.local && <button className="outline-btn" disabled={loading} onClick={() => void search(true)}>Chercher aussi dans les catalogues</button>}
    {data && !results.length && filter !== 'all' && <button className="outline-btn" onClick={() => setFilter('all')}>Aucun résultat dans ce filtre · Voir tous les résultats</button>}
    <ul className="song-search-results">{results.slice(0, limit).map((item, index) => <li key={`${item.project_id || item.spotify_id || item.lyrics_id}-${index}`}>
      <strong>{item.title}{item.artist ? ` — ${item.artist}` : ''}</strong>
      <div className="song-search-badges">{item.badges?.map(badge => <span key={badge}>{badge}</span>)}</div>
      <div className="song-search-controls">
        {/^[a-f0-9]{32}$/.test(item.project_id || '') && <button className="outline-btn" disabled={busy} onClick={() => onLaunch(item)}>Jouer</button>}
        {!item.project_id && ready(item) && <a href={songLaunchUrl(item, 'play')}>Jouer</a>}
        {(item.project_id || Number.isSafeInteger(item.lyrics_id)) && <a href={songLaunchUrl(item, 'edit')}>Éditer</a>}
        {/^[A-Za-z0-9]{22}$/.test(item.spotify_id || '') && <a href={`https://open.spotify.com/track/${item.spotify_id}`} target="_blank" rel="noopener noreferrer">Ouvrir Spotify</a>}
        {Number.isSafeInteger(item.lyrics_id) && <a href={`https://lrclib.net/tracks/${item.lyrics_id}`} target="_blank" rel="noopener noreferrer">Voir les paroles LRCLIB</a>}
      </div>
      {!item.project_id && <small>{ready(item) ? 'Les paroles suivent Spotify. Démarrez le morceau dans Spotify.' : 'Ce résultat ne possède pas encore de projet karaoké prêt à lancer.'}</small>}
    </li>)}</ul>
    {results.length > limit && <button className="outline-btn" onClick={() => setLimit(value => value + 10)}>Voir plus</button>}
  </section>
}
