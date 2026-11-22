import { analyzeLyrics } from './lyricsLab.mjs'

self.onmessage = event => {
  try { self.postMessage({ report: analyzeLyrics(event.data) }) }
  catch (error) { self.postMessage({ error: error.message || 'Analyse indisponible.' }) }
}
