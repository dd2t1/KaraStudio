const sectionNames = new Map([
  ['couplet', 'Couplet'], ['verse', 'Couplet'],
  ['refrain', 'Refrain'], ['chorus', 'Refrain'],
  ['pre-refrain', 'Pré-refrain'], ['pre-chorus', 'Pré-refrain'],
  ['post-refrain', 'Post-refrain'], ['post-chorus', 'Post-refrain'],
  ['pont', 'Pont'], ['bridge', 'Pont'], ['intro', 'Intro'], ['outro', 'Outro'],
  ['instrumental', 'Instrumental'], ['instrumentale', 'Instrumental'],
  ['solo', 'Solo'], ['interlude', 'Interlude'], ['sans paroles', 'Sans paroles'],
])

export const SECTION_OPTIONS = ['Couplet', 'Pré-refrain', 'Refrain', 'Post-refrain', 'Pont', 'Intro', 'Outro', 'Instrumental', 'Solo', 'Interlude']

function unwrapHeader(line) {
  let text = line.trim()
  let previous
  do {
    previous = text
    text = text.replace(/\s*:\s*$/u, '').replace(/^(\*{1,3}|_{1,3})(.+)\1$/su, '$2').trim()
      .replace(/^(?:\[\s*(.*?)\s*\]|\(\s*(.*?)\s*\)|\{\s*(.*?)\s*\})$/su, (_, square, round, curly) => square ?? round ?? curly).trim()
  } while (text !== previous)
  return text
}

export function compileSectionPattern(source) {
  if (!source.trim()) return { pattern: null, error: '' }
  try { return { pattern: new RegExp(`^(?:${source})$`, 'isu'), error: '' } }
  catch { return { pattern: null, error: 'Regex invalide : vérifiez les crochets, parenthèses et caractères échappés. La détection automatique reste active.' } }
}

export function detectSection(line, pattern = null) {
  const text = line.trim()
  const custom = pattern?.exec(text)
  if (custom && custom[0]) {
    const label = unwrapHeader(custom[1]?.trim() || custom[0])
    return detectSection(label) || label
  }
  const clean = unwrapHeader(text)
    .replace(/\s+/gu, ' ')
    .normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[–—]/gu, '-')
    .replace(/^pre[ -]?(refrain|chorus)/u, 'pre-$1').replace(/^post[ -]?(refrain|chorus)/u, 'post-$1')
    .replace(/(?:\s+-\s+|\s*:\s+).+$/u, '')
  const match = clean.match(/^(.+?)(?:\s+(\d+|[ivx]+))?$/u)
  const name = sectionNames.get(match?.[1])
  return name ? `${name}${match[2] ? ` ${match[2].toUpperCase()}` : ''}` : null
}

// Keep physical lines for the input mirror; a complete framed heading may span several.
export function scanLyricsHeaders(source, pattern = null) {
  const rows = source.replace(/\r\n?/gu, '\n').split('\n').map(raw => ({ raw, section: null, continuation: false }))
  for (let index = 0; index < rows.length; index++) {
    const text = rows[index].raw.trim()
    rows[index].section = detectSection(text, pattern)
    if (rows[index].section) continue
    const opening = /^(\*{1,3}|_{1,3})?([\[({])?/u.exec(text)
    if (!opening[0]) continue
    const closing = ({ '[': ']', '(': ')', '{': '}' }[opening[2]] || '') + (opening[1] || '')
    if (text.endsWith(closing)) continue
    for (let end = index + 1; end < rows.length && rows[end].raw.trim(); end++) {
      if (!rows[end].raw.trim().endsWith(closing)) continue
      const block = rows.slice(index, end + 1).map(row => row.raw).join('\n')
      const section = detectSection(block, pattern)
      if (section) {
        for (let cursor = index; cursor <= end; cursor++) {
          rows[cursor].section = section
          rows[cursor].continuation = cursor > index
        }
        index = end
      }
      break
    }
  }
  return rows
}

export function parseLyricsStructure(source, pattern = null) {
  const lines = []
  let section = ''
  let sectionId = 0
  let headers = 0
  let paragraphBreak = false
  for (const { raw, section: detected, continuation } of scanLyricsHeaders(source, pattern)) {
    if (continuation) continue
    const text = raw.trim()
    if (!text) { paragraphBreak = true; continue }
    if (detected) {
      section = detected
      sectionId += 1
      headers += 1
      paragraphBreak = false
      // These explicit markers represent a timed interval without sung text.
      if (/^(Instrumental|Solo|Interlude|Sans paroles)(?:\s|$)/u.test(section)) {
        lines.push({ text: '♫ Passage sans paroles', section, sectionId, isInstrumental: true })
      }
      continue
    }
    if (paragraphBreak && !section) sectionId += 1
    paragraphBreak = false
    lines.push({ text, section, sectionId, isInstrumental: false })
  }
  return { lines, headers }
}

export function prepareReferenceLyrics(source, pattern = null) {
  const parsed = parseLyricsStructure(source, pattern)
  return {
    text: parsed.lines.filter(line => !line.isInstrumental).map(line => line.text).join('\n'),
    ignoredHeaders: parsed.headers,
  }
}
