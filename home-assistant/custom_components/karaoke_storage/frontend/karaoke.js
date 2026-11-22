class KaraokeWidget extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this._config = {}
  }

  setConfig(config) { this._config = config || {} }
  getCardSize() { return 8 }
  set hass(value) {
    this._hass = value
    if (!this._built) this._build()
    if (!this._loaded) { this._loaded = true; this._refresh() }
    for (const option of this.shadowRoot.querySelectorAll('#screen option[data-name]')) {
      const state = value.states[option.value]?.state || 'unavailable'
      option.disabled = ['unavailable', 'unknown'].includes(state)
      option.textContent = `${option.dataset.name}${option.disabled ? ' · indisponible' : ''}`
    }
  }

  _message(text) { this.shadowRoot.querySelector('#notice').textContent = text }
  _url() {
    if (!this._appUrl) throw new Error('Renseignez l’adresse dans Paramètres → Appareils et services → Karaoké → Configurer.')
    const url = new URL(this._appUrl)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Indiquez une URL HTTP(S) sans identifiants.')
    return url.href
  }
  _sessionUrl(receiver = false) {
    const url = new URL(this._url())
    const storageKey = `karaoke-session:${url.origin}${url.pathname}`
    let session
    try { session = JSON.parse(sessionStorage.getItem(storageKey)) } catch { /* Create a new session. */ }
    if (!session?.room || !session?.presenter) {
      session = { room: crypto.randomUUID().replaceAll('-', ''), presenter: crypto.randomUUID().replaceAll('-', '') }
      sessionStorage.setItem(storageKey, JSON.stringify(session))
    }
    url.searchParams.set('room', session.room)
    if (receiver) {
      url.searchParams.set('cast', '1')
      url.hash = ''
    } else {
      url.searchParams.delete('cast')
      url.hash = new URLSearchParams({ presenter: session.presenter }).toString()
    }
    return url.href
  }
  async _refresh() {
    void this._refreshSongs()
    try {
      const result = await this._hass.callApi('GET', 'karaoke_storage/settings')
      this._appUrl = result.app_url || ''
      const select = this.shadowRoot.querySelector('#screen')
      const selected = select.value
      select.replaceChildren(new Option('Choisir un écran Google Cast', ''))
      for (const player of result.players) {
        const option = new Option(player.name, player.entity_id)
        option.dataset.name = player.name
        option.disabled = ['unavailable', 'unknown'].includes(player.state)
        if (option.disabled) option.textContent += ' · indisponible'
        select.append(option)
      }
      select.value = selected || this._config.entity_id || ''
      this._message(this._appUrl ? 'Ouvrez le lecteur ou choisissez un écran pour caster.' : 'Choisissez un écran pour lancer vos morceaux enregistrés. L’adresse du lecteur se règle dans les paramètres de l’intégration.')
    } catch { this._message('Impossible de charger la configuration. Vérifiez la connexion à Home Assistant.') }
  }
  async _refreshSongs() {
    const list = this.shadowRoot.querySelector('#songs')
    try {
      const result = await this._hass.callApi('GET', 'karaoke_storage/projects')
      list.replaceChildren()
      if (!result.projects.length) {
        list.textContent = 'Aucune musique enregistrée. Envoyez un morceau depuis l’éditeur vers Home Assistant.'
      }
      for (const song of result.projects) {
        const row = document.createElement('div')
        row.className = 'song'
        const title = document.createElement('strong')
        title.textContent = `${song.title} · ${song.source === 'spotify' ? 'Spotify' : 'Audio'}`
        const play = document.createElement('button')
        play.className = 'primary'
        play.textContent = 'Lancer le karaoké'
        play.onclick = async () => {
          try {
            if (song.source === 'spotify') {
              const url = new URL(this._sessionUrl())
              url.searchParams.set('project', song.id)
              window.open(url.href, '_blank', 'noopener,noreferrer')
              this._message('Gardez le lecteur ouvert pour suivre Spotify. Utilisez Caster la page pour afficher les paroles sur l’écran choisi.')
              return
            }
            const entity_id = this.shadowRoot.querySelector('#screen').value
            if (!entity_id) throw new Error('Choisissez un écran dans la liste Chromecast / Google TV.')
            play.disabled = true
            this._message(`Lancement de ${song.title}…`)
            await this._hass.callService('karaoke_storage', 'play_project', { entity_id, project_id: song.id })
            this._message(`Commande envoyée pour ${song.title}. Son et paroles sur écran Cast ; audio seul sur enceinte.`)
          } catch (error) { this._message(error.message || 'Impossible de lancer ce morceau.') }
          finally { play.disabled = false }
        }
        const listen = document.createElement('button')
        listen.textContent = 'Écouter le MP3 ici'
        listen.onclick = async () => {
          try {
            listen.disabled = true
            const result = await this._hass.callWS({ type: 'media_source/resolve_media', media_content_id: `media-source://karaoke_storage/${song.id}` })
            const audio = this.shadowRoot.querySelector('#audio')
            audio.src = result.url
            audio.hidden = false
            await audio.play()
          } catch (error) { this._message(error.message || 'Lecture audio impossible.') }
          finally { listen.disabled = false }
        }
        row.append(title, play)
        if (song.source !== 'spotify') row.append(listen)
        list.append(row)
      }
    } catch { list.textContent = 'Impossible de charger les musiques. Réessayez avec Actualiser les musiques.' }
  }
  async _search(event, includeCatalog = false) {
    event?.preventDefault()
    if (this._searching) return
    const query = this.shadowRoot.querySelector('#song-query').value.trim()
    if (query.length < 2) return
    const button = this.shadowRoot.querySelector('#search-button')
    const list = this.shadowRoot.querySelector('#search-results')
    const status = this.shadowRoot.querySelector('#search-status')
    this._searching = true
    button.disabled = true
    status.textContent = 'Recherche dans Home Assistant, puis Spotify et LRCLIB si nécessaire…'
    list.replaceChildren()
    try {
      const data = await this._hass.callApi('GET', `karaoke_storage/search?q=${encodeURIComponent(query)}${includeCatalog ? '&catalog=1' : ''}`)
      this._searchData = data
      this._searchLimit = 10
      this._renderResults()
    } catch { status.textContent = 'Recherche impossible. Vérifiez que le composant Karaoké est installé, puis réessayez.' }
    finally { this._searching = false; button.disabled = false }
  }
  _renderResults() {
    const data = this._searchData
    if (!data) return
    const list = this.shadowRoot.querySelector('#search-results')
    const status = this.shadowRoot.querySelector('#search-status')
    const filter = this.shadowRoot.querySelector('#search-filter').value
    const ready = result => Boolean(result.project_id || (result.spotify_id && result.lyrics_id && result.badges?.includes('Paroles synchronisées')))
    const results = data.results.filter(result => filter === 'all' || (filter === 'projects' ? result.project_id : ready(result)))
    list.replaceChildren()
    status.textContent = `${results.length} résultat(s). ${(data.messages || []).join(' ')}${!results.length && filter === 'ready' ? ' Aucun résultat prêt : choisissez Tous pour voir les autres.' : ''}`
    if (data.local) {
      const more = document.createElement('button')
      more.textContent = 'Chercher aussi dans les catalogues'
      more.onclick = () => this._search(null, true)
      list.append(more)
    }
      for (const result of results.slice(0, this._searchLimit)) {
        const row = document.createElement('article')
        row.className = 'song search-result'
        const heading = document.createElement('strong')
        heading.textContent = `${result.title}${result.artist ? ` — ${result.artist}` : ''}`
        row.append(heading)
        const badges = document.createElement('div')
        badges.className = 'badges'
        for (const text of result.badges || []) {
          const badge = document.createElement('span')
          badge.className = 'badge'
          badge.dataset.kind = text === 'Spotify' ? 'spotify' : text === 'Projet existant' ? 'project' : text === 'Paroles synchronisées' ? 'synced' : 'other'
          badge.textContent = text
          badges.append(badge)
        }
        row.append(badges)
        const link = (label, href) => {
          const anchor = document.createElement('a')
          anchor.className = 'link'
          anchor.textContent = label
          anchor.href = href
          anchor.target = '_blank'
          anchor.rel = 'noopener noreferrer'
          row.append(anchor)
        }
        if (result.project_id && /^[a-f0-9]{32}$/.test(result.project_id)) {
          const open = document.createElement('button')
          open.textContent = 'Jouer'
          open.onclick = () => {
            try {
              const url = new URL(this._sessionUrl())
              url.searchParams.set('project', result.project_id)
              url.searchParams.set('action', 'play')
              window.open(url.href, '_blank', 'noopener,noreferrer')
            } catch (error) { this._message(error.message) }
          }
          row.append(open)
        }
        for (const action of ['play', 'edit']) {
          if (action === 'play' && (result.project_id || !result.spotify_id || !result.badges?.includes('Paroles synchronisées'))) continue
          if (!result.project_id && !Number.isSafeInteger(result.lyrics_id)) continue
          const button = document.createElement('button')
          button.textContent = action === 'play' ? 'Jouer' : 'Éditer'
          button.onclick = () => {
            try {
              const url = new URL(this._sessionUrl())
              url.searchParams.set('action', action)
              if (result.project_id) url.searchParams.set('project', result.project_id)
              else {
                url.searchParams.set('lyrics', result.lyrics_id)
                if (result.spotify_id) url.searchParams.set('spotify', result.spotify_id)
              }
              window.open(url.href, '_blank', 'noopener,noreferrer')
            } catch (error) { this._message(error.message) }
          }
          row.append(button)
        }
        if (/^[A-Za-z0-9]{22}$/.test(result.spotify_id || '')) link('Ouvrir Spotify', `https://open.spotify.com/track/${result.spotify_id}`)
        if (Number.isSafeInteger(result.lyrics_id)) link('Voir les paroles LRCLIB', `https://lrclib.net/tracks/${result.lyrics_id}`)
        list.append(row)
      }
    if (results.length > this._searchLimit) {
      const more = document.createElement('button')
      more.textContent = 'Voir plus'
      more.onclick = () => { this._searchLimit += 10; this._renderResults() }
      list.append(more)
    }
  }
  _build() {
    this._built = true
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;height:100%;color:var(--primary-text-color,#eee);font-family:var(--paper-font-body1_-_font-family,system-ui)}
        .wrap{padding:20px;box-sizing:border-box;max-width:1600px;margin:auto}header{display:flex;align-items:center;gap:12px}h1{font-size:24px;margin:8px 0}p{line-height:1.5}.intro{color:var(--secondary-text-color,#aaa)}
        .box{border:1px solid var(--divider-color,#444);border-radius:16px;background:var(--card-background-color,#18202c);padding:20px}
        label{display:block;margin:12px 0 6px;font-weight:600}input,select,button,a{font:inherit}input,select{box-sizing:border-box;width:100%;padding:12px;background:var(--primary-background-color,#111827);color:inherit;border:1px solid var(--divider-color,#666);border-radius:8px}
        .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}button,.link{padding:10px 16px;border-radius:8px;border:1px solid var(--divider-color,#666);background:var(--secondary-background-color,#243146);color:inherit;cursor:pointer;text-decoration:none}button.primary{background:var(--primary-color,#0277bd);color:white}button:disabled{opacity:.45;cursor:wait}
        iframe{width:100%;height:72vh;border:0;border-radius:12px;background:#111;margin-top:16px}iframe[hidden]{display:none}#notice{min-height:24px;overflow-wrap:anywhere}a{color:var(--primary-color,#55e6ff)}
        .library{margin-top:18px}.song{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:16px 0;border-bottom:1px solid var(--divider-color,#444)}.song strong{flex:1 1 220px;overflow-wrap:anywhere}audio{width:100%;margin-top:16px}audio[hidden]{display:none}
        .search-box{margin-bottom:18px}.search-row{display:flex;gap:10px}.search-row input{flex:1;min-width:0}.badges{display:flex;flex-wrap:wrap;gap:6px;width:100%}.badge{font-size:12px;padding:4px 9px;border-radius:999px;background:var(--secondary-background-color,#243146);border:1px solid var(--divider-color,#666)}.search-result strong{flex-basis:100%}#search-status{font-size:14px;color:var(--secondary-text-color,#aaa)}
        .badge[data-kind=spotify]{border-color:#1db954;color:#61df8d}.badge[data-kind=project]{border-color:#55bde6;color:#7cd8fa}.badge[data-kind=synced]{border-color:#a581d5;color:#d6b9ff}@media(max-width:480px){.search-row{flex-wrap:wrap}.search-row button{width:100%}}
      </style>
      <div class="wrap"><header><ha-menu-button></ha-menu-button><h1>🎤 Karaoké</h1></header>
      <p class="intro">Retrouvez vos musiques enregistrées ci-dessous et lancez le son avec les paroles sur votre écran Cast.</p>
      <section class="box search-box"><h2>Rechercher une chanson</h2><form id="song-search"><label for="song-query">Titre ou artiste</label><div class="search-row"><input id="song-query" type="search" required minlength="2" maxlength="160" placeholder="Ex. : artiste ou titre du morceau"><button id="search-button" class="primary" type="submit">Rechercher</button></div></form><label for="search-filter">Afficher</label><select id="search-filter"><option value="ready">Prêts à chanter</option><option value="projects">Projets existants</option><option value="all">Tous</option></select><p id="search-status" role="status" aria-live="polite">Recherche d’abord vos projets Home Assistant, puis Spotify et LRCLIB.</p><div id="search-results"></div></section>
      <div class="box"><h2>Lecteur et Cast</h2>
      <div class="actions"><button id="show" class="primary">Afficher le lecteur ici</button><button id="open">Ouvrir dans un onglet</button></div>
      <label for="screen">Chromecast / Google TV</label><select id="screen"><option value="">Choisir un écran Google Cast</option></select>
      <div class="actions"><button id="cast" class="primary">Caster la page</button><button id="refresh">Actualiser les écrans</button></div>
      <p id="notice" role="status" aria-live="polite"></p></div>
      <section class="box library"><h2>Mes musiques karaoké</h2><p>Les morceaux envoyés depuis l’éditeur vers Home Assistant apparaissent ici.</p><button id="refresh-songs">Actualiser les musiques</button><div id="songs" aria-live="polite">Chargement…</div><audio id="audio" controls hidden></audio></section>
      <iframe id="page" title="Application karaoké" allow="autoplay; fullscreen" referrerpolicy="no-referrer" hidden></iframe>
      </div>`
    const menu = this.shadowRoot.querySelector('ha-menu-button')
    menu.hidden = this.localName === 'karaoke-card'
    menu.hass = this._hass
    this.shadowRoot.querySelector('#song-search').onsubmit = event => this._search(event)
    this.shadowRoot.querySelector('#search-filter').onchange = () => { this._searchLimit = 10; this._renderResults() }
    this.shadowRoot.querySelector('#refresh').onclick = () => this._refresh()
    this.shadowRoot.querySelector('#refresh-songs').onclick = () => this._refreshSongs()
    this.shadowRoot.querySelector('#show').onclick = () => {
      try {
        const url = this._url()
        if (location.protocol === 'https:' && new URL(url).protocol === 'http:') throw new Error('Home Assistant est en HTTPS : utilisez une URL HTTPS pour afficher la page ici. Une adresse HTTP peut être ouverte dans un nouvel onglet ou envoyée au Chromecast sur le réseau local.')
        const frame = this.shadowRoot.querySelector('#page')
        const source = this._sessionUrl()
        if (frame.src !== source) frame.src = source
        frame.hidden = false
        this._message('Si la page reste vide, vérifiez son URL et son autorisation d’affichage intégré, ou ouvrez-la dans un onglet.')
      } catch (error) { this._message(error.message || 'URL invalide.') }
    }
    this.shadowRoot.querySelector('#open').onclick = () => {
      try { window.open(this._sessionUrl(), '_blank', 'noopener,noreferrer') }
      catch (error) { this._message(error.message || 'Vérifiez les paramètres de l’intégration.') }
    }
    this.shadowRoot.querySelector('#cast').onclick = async () => {
      const button = this.shadowRoot.querySelector('#cast')
      try {
        const entity_id = this.shadowRoot.querySelector('#screen').value
        if (!entity_id) throw new Error('Choisissez un écran disponible.')
        const url = this._sessionUrl(true)
        const frame = this.shadowRoot.querySelector('#page')
        if (frame.hidden && !(location.protocol === 'https:' && new URL(url).protocol === 'http:')) {
          frame.src = this._sessionUrl()
          frame.hidden = false
        }
        button.disabled = true
        this._message('Envoi au Chromecast…')
        await this._hass.callService('karaoke_storage', 'cast_page', { entity_id, url })
        this._message('Écran paroles lancé. Chargez une chanson et pilotez la lecture dans l’aperçu ci-dessous. Le son reste sur cet appareil.')
      } catch (error) { this._message(error.message || 'Le lancement Cast a échoué.') }
      finally { button.disabled = false }
    }
  }
}

if (!customElements.get('karaoke-panel')) customElements.define('karaoke-panel', class extends KaraokeWidget {})
if (!customElements.get('karaoke-card')) customElements.define('karaoke-card', class extends KaraokeWidget {})
window.customCards = window.customCards || []
if (!window.customCards.some(card => card.type === 'karaoke-card')) window.customCards.push({ type: 'karaoke-card', name: 'Karaoké et Cast', description: 'Afficher le karaoké et le lancer sur Chromecast / Google TV.' })
