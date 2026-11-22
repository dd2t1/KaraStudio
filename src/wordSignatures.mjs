import { animationPresets } from './animationPresets.mjs'
import { plainLyrics } from './lyricMarkup.mjs'
import { markLyrics, lyricUnits } from './visualLyrics.mjs'
import { normalizeWord, wordCandidates, targetTiming } from './aiSuggestions.mjs'
import { animationProfileId, validateAnimationProfile, validateProfileLibrary } from './animationProfiles.mjs'

export function repeatedAnimationWords(lines) {
  const words = new Map()
  for (const line of lines) {
    if (line.isInstrumental) continue
    for (const word of wordCandidates(plainLyrics(line.text))) {
      if (word.text.length < 3) continue
      const key = normalizeWord(word.text)
      const existing = words.get(key)
      if (existing) existing.count++
      else words.set(key, { word: word.text, count: 1 })
    }
  }
  return [...words.values()].filter(item => item.count > 1).sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, 'fr')).slice(0, 50)
}

export function signatureTargets(lines, { word, scope = 'phrase', lineIndex = 0 }) {
  const query = wordCandidates(word || '').map(item => normalizeWord(item.text))
  if (!query.length || query.length > 3 || word.length > 60) return []
  const selected = lines[lineIndex]
  const targets = []
  lines.forEach((line, index) => {
    if (line.isInstrumental || !Number.isFinite(line.start) || !Number.isFinite(line.end) || line.end <= line.start ||
        scope === 'phrase' && index !== lineIndex || scope === 'section' && (!selected?.section || line.section !== selected.section) || !['phrase', 'section', 'song'].includes(scope)) return
    const text = plainLyrics(line.text)
    const candidates = wordCandidates(text)
    const units = lyricUnits(line.text)
    for (let i = 0; i <= candidates.length - query.length; i++) {
      if (!query.every((value, j) => normalizeWord(candidates[i + j].text) === value)) continue
      const start = candidates[i].start, end = candidates[i + query.length - 1].end
      const marked = units.slice(start, end).filter(unit => unit.effect)
      const cue = marked.length && marked.every(unit => Number.isFinite(unit.cue) && unit.cue === marked[0].cue) ? marked[0].cue : null
      const timing = cue === null ? targetTiming(line, { start, end }) : { cue, timingSource: 'existing' }
      targets.push({ key: `${index}:${start}:${end}`, lineIndex: index, start, end, text: text.slice(start, end),
        conflict: marked.length > 0, ...timing, section: line.section || '', excerpt: text })
      i += query.length - 1
    }
  })
  return targets
}

export function applyWordSignature(lines, request) {
  const profile = request.profile ? validateAnimationProfile(request.profile) : null
  const effect = profile ? animationProfileId(profile) : request.effect
  const duration = profile?.duration || animationPresets.find(preset => preset.id === effect)?.duration
  if (!duration) throw new Error('Choisissez une animation valide.')
  const plan = signatureTargets(lines, request).filter(target => !request.keys || request.keys.includes(target.key))
  if (!plan.length) throw new Error('Aucune occurrence sélectionnée pour ce mot.')
  if (plan.some(target => target.conflict) && !request.replace) throw new Error('Confirmez le remplacement des animations existantes.')
  let applied = 0, estimated = 0, skipped = 0
  const next = lines.map((line, index) => {
    const targets = plan.filter(target => target.lineIndex === index)
    if (!targets.length) return line
    let text = line.text
    for (const target of targets) {
      const remaining = line.end - line.start - target.cue
      const seconds = Math.floor(Math.min(duration, remaining) * 100) / 100
      if (seconds < 0.2 || target.cue < 0 || target.cue >= line.end - line.start) { skipped++; continue }
      text = markLyrics(text, target.start, target.end, { effect, duration: seconds, cue: target.cue })
      applied++; if (target.timingSource === 'estimated') estimated++
    }
    if (text === line.text) return line
    const animationProfiles = profile ? validateProfileLibrary({ ...line.animationProfiles, [effect]: profile }) : line.animationProfiles
    const signatures = (line.animationSignatures || []).filter(item => normalizeWord(item.word) !== normalizeWord(request.word))
    return { ...line, text, ...(animationProfiles ? { animationProfiles } : {}),
      animationSignatures: [...signatures, { word: request.word.trim(), effect }].slice(-64) }
  })
  if (!applied) throw new Error('Ces occurrences sont trop courtes : recalez leurs repères avant d’animer.')
  return { lines: next, count: applied, estimated, skipped }
}

export function animationSignatureLibrary(lines) {
  const profiles = new Map()
  for (const line of lines) for (const [id, profile] of Object.entries(line.animationProfiles || {})) {
    try { profiles.set(id, validateAnimationProfile(profile)) } catch { /* Invalid imports are rejected at project loading. */ }
  }
  return [...profiles].map(([id, profile]) => ({ id, profile, label: profile.name }))
}
