import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

class Element {
  children = []
  dataset = {}
  textContent = ''
  append(...items) { this.children.push(...items) }
  replaceChildren(...items) { this.children = items }
}

test('HA search card submits once, displays evidence badges and does not interpret result text as HTML', async () => {
  const fields = Object.fromEntries(['#song-query', '#search-button', '#search-results', '#search-status', '#search-filter'].map(key => [key, new Element()]))
  fields['#song-query'].value = 'Titre <test>'
  fields['#search-filter'].value = 'all'
  const registry = new Map()
  const context = vm.createContext({
    HTMLElement: class { attachShadow() { this.shadowRoot = { querySelector: key => fields[key] } } },
    customElements: { get: key => registry.get(key), define: (key, value) => registry.set(key, value) },
    window: {}, document: { createElement: () => new Element() }, URL, encodeURIComponent,
  })
  vm.runInContext(readFileSync('home-assistant/custom_components/karaoke_storage/frontend/karaoke.js', 'utf8'), context)
  const card = new (registry.get('karaoke-card'))()
  let calls = 0
  let resolve
  card._hass = { callApi: (method, path) => {
    calls++
    assert.equal(method, 'GET')
    assert.equal(path, 'karaoke_storage/search?q=Titre%20%3Ctest%3E')
    return new Promise(done => { resolve = done })
  } }
  const pending = card._search({ preventDefault() {} })
  await card._search({ preventDefault() {} })
  assert.equal(calls, 1)
  resolve({ results: [{ title: '<img onerror=bad>', badges: ['Spotify', 'Paroles synchronisées'], spotify_id: 'x'.repeat(22) }], messages: [] })
  await pending
  const row = fields['#search-results'].children[0]
  assert.equal(row.children[0].textContent, '<img onerror=bad>')
  assert.equal(row.children[1].children[1].textContent, 'Paroles synchronisées')
  assert.equal(row.children[2].href, `https://open.spotify.com/track/${'x'.repeat(22)}`)
  assert.equal(fields['#search-button'].disabled, false)
})
