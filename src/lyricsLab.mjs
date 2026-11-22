import { plainLyrics } from './lyricMarkup.mjs'
import { analyzePatterns, nearbyGroups } from './lyricsLabPatterns.mjs'

export const VECTOR_DIMENSIONS = ['fréquence', 'part des lignes', 'position moyenne', 'longueur en lettres', 'répétitions consécutives']
const round = value => Math.round(value * 1000) / 1000
const wordsIn = text => plainLyrics(text).normalize('NFC').toLocaleLowerCase('fr').replace(/[’ʼ]/gu, "'").match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu) || []
const ranked = map => [...map.values()].flatMap(item => nearbyGroups(item.occurrences).filter(group => group.length > 1).map(occurrences => ({ text: item.text, count: occurrences.length, lines: new Set(occurrences.map(hit => hit.line)), occurrences }))).sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'fr'))

// Pure, bounded analysis: no project writes, model requests, audio decoding or storage.
export function analyzeLyrics(lines) {
  if (!Array.isArray(lines) || lines.length > 2000) throw new Error('Le laboratoire accepte au maximum 2 000 lignes.')
  if (lines.reduce((total, line) => total + String(line?.text || '').length, 0) > 500000) throw new Error('Texte trop volumineux pour cette version du laboratoire.')
  const rows = lines.map((line, index) => {
    const words = line?.isInstrumental ? [] : wordsIn(String(line?.text || ''))
    const duration = Number.isFinite(line?.start) && Number.isFinite(line?.end) && line.start >= 0 && line.end > line.start ? line.end - line.start : null
    return { line: index + 1, text: plainLyrics(String(line?.text || '')).normalize('NFC'), start: duration ? line.start : null, words,
      duration, wordsPerSecond: words.length && duration ? round(words.length / duration) : null }
  })
  const totalWords = rows.reduce((sum, row) => sum + row.words.length, 0)
  if (totalWords > 25000) throw new Error('Le laboratoire accepte au maximum 25 000 mots par analyse.')
  const words = new Map(), phrases = new Map(), openings = new Map(), motifs = new Map(), runs = []
  let ordinal = 0
  const add = (map, text, line, wordIndex = 0) => {
    if (!map.has(text)) map.set(text, { text, count: 0, lines: new Set(), occurrences: [] })
    const entry = map.get(text)
    entry.count++
    entry.lines.add(line)
    entry.occurrences.push({ line, wordIndex })
  }
  for (const row of rows) {
    if (!row.words.length) continue
    add(phrases, row.words.join(' '), row.line)
    if (row.words.length >= 2) add(openings, row.words.slice(0, 2).join(' '), row.line)
    for (let i = 0; i < row.words.length; i++) {
      const word = row.words[i]
      if (!words.has(word)) words.set(word, { word, count: 0, lines: new Set(), positions: [], consecutive: 0 })
      const entry = words.get(word)
      entry.count++
      entry.lines.add(row.line)
      entry.positions.push(totalWords > 1 ? ordinal / (totalWords - 1) : 0)
      if (i > 0 && word === row.words[i - 1]) entry.consecutive++
      ordinal++
      // Overlapping occurrences count; motifs never cross a lyric-line boundary.
      for (let length = 2; length <= 5 && i + length <= row.words.length; length++) add(motifs, row.words.slice(i, i + length).join(' '), row.line, i)
      if (i === 0 || word !== row.words[i - 1]) {
        let end = i + 1
        while (row.words[end] === word) end++
        if (end - i >= 2) runs.push({ text: word, count: end - i, line: row.line, wordIndex: i + 1 })
      }
    }
  }
  const serialize = entries => entries.slice(0, 40).map(item => ({ ...item, lines: [...item.lines] }))
  const sungLines = rows.filter(row => row.words.length).length
  const vocabulary = [...words.values()].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, 'fr')).map(entry => ({
    word: entry.word, count: entry.count, lines: [...entry.lines],
    vector: [entry.count, round(entry.lines.size / (sungLines || 1)), round(entry.positions.reduce((a, b) => a + b, 0) / entry.count), [...entry.word.replace(/[^\p{L}]/gu, '')].length, entry.consecutive],
  }))
  const timedRows = rows.filter(row => row.wordsPerSecond !== null)
  return {
    version: 1,
    method: 'Analyse lexicale locale. Casse et apostrophes normalisées ; accents conservés. Un mot avec apostrophe ou tiret compte comme un seul token. Passages instrumentaux exclus des comptages.',
    limits: 'Les variantes sont des familles de terminaisons, pas des synonymes ni des lemmes validés. Les rimes proposées reposent sur des règles françaises et des ressemblances écrites, à confirmer à l’écoute. Le débit utilise les timings existants, pas le son. Aucune détection de structure, de tempo ou d’émotion.',
    summary: { lines: lines.length, sungLines, words: totalWords, uniqueWords: vocabulary.length, lexicalDiversity: totalWords ? round(vocabulary.length / totalWords) : 0, timedLines: timedRows.length },
    vectorDimensions: VECTOR_DIMENSIONS,
    vocabulary,
    analysisWindow: 'Même ligne et lignes immédiatement voisines. Les comptages du vocabulaire restent globaux.',
    ...analyzePatterns(rows, serialize(ranked(motifs))),
    repeatedLines: serialize(ranked(phrases)),
    repeatedOpenings: serialize(ranked(openings)),
    motifs: serialize(ranked(motifs)),
    immediateRepeats: runs.slice(0, 100),
    density: timedRows.map(({ line, words, duration, wordsPerSecond }) => ({ line, words: words.length, duration: round(duration), wordsPerSecond })),
    lineLengths: rows.map(row => ({ line: row.line, words: row.words.length })),
  }
}
