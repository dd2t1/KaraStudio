export const normalizeLabWord = word => word.normalize('NFC').toLocaleLowerCase('fr').replace(/[’ʼ]/gu, "'")
export const LAB_WORD_PATTERN = /[\p{L}\p{N}]+(?:['’ʼ-][\p{L}\p{N}]+)*/gu
const commonWords = new Set('je tu il elle on nous vous ils elles le la les un une des de du au aux à et ou mais donc car en dans pour par sur sous avec sans ce cet cette ces mon ton son ma ta sa mes tes ses nos vos leurs ne pas plus que qui quoi se me te lui leur y est sont être avoir'.split(' '))

export function nearbyGroups(occurrences) {
  const groups = []
  for (const item of [...occurrences].sort((a, b) => a.line - b.line)) {
    const last = groups.at(-1)
    if (last && item.line - last.at(-1).line <= 1) last.push(item)
    else groups.push([item])
  }
  return groups
}

// Exploratory suffix families, deliberately not presented as grammatical lemmas.
export function variantRoot(word) {
  const normalized = normalizeLabWord(word)
  const apostrophe = normalized.lastIndexOf("'")
  const prefix = normalized.slice(0, apostrophe + 1)
  const base = normalized.slice(apostrophe + 1)
  const root = base.replace(/(?:eraient|erions|erais|erait|eront|aient|ions|ées|ais|ait|ant|ent|ons|ez|er|és|ée|é|es|e|s|x)$/u, '')
  return prefix + (root.length >= 3 ? root : base)
}

export function rhymeEnding(word) {
  const base = normalizeLabWord(word).split(/['-]/u).at(-1)
  const patterns = [
    [/(?:œurs?|oeurs?|eurs?)$/u, 'eur'],
    [/(?:oires?|oirs?)$/u, 'oir'],
    [/(?:uits?)$/u, 'ui'],
    [/(?:eaux?|aux|ots?)$/u, 'o'],
    [/(?:tions?|sions?)$/u, 'sion'],
    [/(?:ées?|és?|ez)$/u, 'é'],
  ]
  for (const [pattern, key] of patterns) if (pattern.test(base)) return { key, basis: 'Terminaison française rapprochée par une règle ; prononciation à confirmer.' }
  // Avoid treating short -er words and common exceptions as infinitives.
  if (base.length >= 5 && /er$/u.test(base) && !['hiver', 'enfer', 'amer', 'super', 'laser', 'cuiller'].includes(base)) return { key: 'é', basis: 'Finale -er rapprochée de -é ; ambiguïtés possibles.' }
  if (base.length < 3) return null
  return { key: `écrit:${base.slice(-3)}`, basis: 'Trois dernières lettres identiques : ressemblance écrite, pas une rime phonétique confirmée.' }
}

export function analyzePatterns(rows, motifs = []) {
  const families = new Map(), endings = new Map(), similar = new Map()
  const countsByWord = new Map()
  for (const row of rows) {
    for (const [wordIndex, word] of row.words.entries()) {
      if (!countsByWord.has(word)) countsByWord.set(word, new Map())
      const counts = countsByWord.get(word)
      counts.set(row.line, (counts.get(row.line) || 0) + 1)
      if (commonWords.has(word)) continue
      const root = variantRoot(word)
      if (!families.has(root)) families.set(root, [])
      families.get(root).push({ word, line: row.line })
      const ending = rhymeEnding(word)
      if (ending) {
        if (!endings.has(ending.key)) endings.set(ending.key, { ...ending, occurrences: [] })
        endings.get(ending.key).occurrences.push({ word, line: row.line, wordIndex, atEnd: wordIndex === row.words.length - 1 })
      }
    }
    if (row.words.length >= 3) {
      const key = row.words.map(variantRoot).join(' ')
      if (!similar.has(key)) similar.set(key, [])
      similar.get(key).push({ text: row.text, line: row.line, normalized: row.words.join(' ') })
    }
  }
  const variants = [...families].flatMap(([root, occurrences]) => nearbyGroups(occurrences)
    .filter(group => new Set(group.map(item => item.word)).size > 1).map(group => {
      const forms = [...new Set(group.map(item => item.word))].map(word => {
        const hits = group.filter(item => item.word === word)
        return { word, count: hits.length, lines: [...new Set(hits.map(item => item.line))] }
      })
      return { root, forms, lines: [...new Set(group.map(item => item.line))] }
    })).slice(0, 80).map((group, id) => ({ ...group, id: `v${id}` }))
  const rhymes = [...endings.values()].flatMap(group => nearbyGroups(group.occurrences).map(occurrences => ({ ...group, occurrences })))
    .filter(group => new Set(group.occurrences.map(item => item.word)).size >= 2)
    .slice(0, 60).map((group, id) => ({ ...group, id: `r${id}` }))
  const nearLines = [...similar.values()].flatMap(nearbyGroups).filter(group => new Set(group.map(item => item.normalized)).size > 1)
    .slice(0, 40).map(group => group.map(({ text, line }) => ({ text, line })))
  const variantByWord = new Map(variants.flatMap(group => group.forms.flatMap(form => form.lines.map(line => [`${line}:${form.word}`, group]))))
  const rhymeByWord = new Map(rhymes.flatMap(group => group.occurrences.map(item => [`${item.line}:${item.wordIndex}`, group])))
  const motifWords = new Set()
  for (const motif of motifs) for (const occurrence of motif.occurrences) {
    for (let i = occurrence.wordIndex; i < occurrence.wordIndex + motif.text.split(' ').length; i++) motifWords.add(`${occurrence.line}:${i}`)
  }
  const annotatedLines = rows.map(row => {
    let cursor = 0, index = 0
    const tokens = []
    for (const match of row.text.matchAll(LAB_WORD_PATTERN)) {
      if (match.index > cursor) tokens.push({ text: row.text.slice(cursor, match.index) })
      const word = normalizeLabWord(match[0])
      const family = row.words.length ? variantByWord.get(`${row.line}:${word}`) : null
      const rhyme = rhymeByWord.get(`${row.line}:${index}`)
      const counts = countsByWord.get(word)
      const repeated = row.words.length > 0 && [row.line - 1, row.line, row.line + 1].reduce((sum, line) => sum + (counts?.get(line) || 0), 0) > 1
      tokens.push({ text: match[0], repeated, subdued: commonWords.has(word) && !motifWords.has(`${row.line}:${index}`),
        variant: family ? { id: family.id, root: family.root, split: family.root.length } : null,
        rhyme: rhyme ? { id: rhyme.id, key: rhyme.key } : null })
      cursor = match.index + match[0].length
      index++
    }
    if (cursor < row.text.length) tokens.push({ text: row.text.slice(cursor) })
    return { line: row.line, start: row.start, tokens }
  })
  return { variants, rhymes, nearLines, annotatedLines }
}
