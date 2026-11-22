import { lyricQuizzes, parseLyricMarkup } from './lyricMarkup.mjs'
import { PROFILE_ID, validateProfileLibrary } from './animationProfiles.mjs'
export function parsePlayLevel(source, { requireQuizCues = false } = {}) {
  let data
  try {
    data = JSON.parse(source)
  } catch {
    throw new Error('Le fichier doit être un export JSON valide de l’éditeur.')
  }
  if (!Array.isArray(data?.lyrics) || !data.lyrics.length) {
    throw new Error('Ce fichier ne contient aucune parole synchronisée.')
  }

  let previousStart = -1
  return data.lyrics.map((line, index) => {
    if (!line || typeof line.text !== 'string' ||
        !Number.isFinite(line.start) || !Number.isFinite(line.end) ||
        line.start < 0 || line.end <= line.start || line.start < previousStart) {
      throw new Error(`La ligne ${index + 1} contient un texte ou des horaires invalides. Corrigez-la dans l’éditeur.`)
    }
    const targets = lyricQuizzes(line.text, false)
    const animationProfiles = validateProfileLibrary(line.animationProfiles)
    for (const token of parseLyricMarkup(line.text)) if (PROFILE_ID.test(token.effect || '')) {
      if (!animationProfiles[token.effect]) throw new Error(`Ligne ${index + 1} : profil d’animation manquant.`)
      if (token.cue !== null && (token.cue < 0 || token.cue + token.duration > line.end - line.start + 0.011)) throw new Error(`Ligne ${index + 1} : animation personnalisée hors de la phrase.`)
    }
    if (line.animationSignatures !== undefined && (!Array.isArray(line.animationSignatures) || line.animationSignatures.length > 64 || line.animationSignatures.some(item =>
      !item || typeof item.word !== 'string' || item.word.length > 60 || typeof item.effect !== 'string'))) throw new Error('Signatures de mots invalides.')
    for (const target of targets) {
      if ((target.cue !== null && (!Number.isFinite(target.cue) || target.cue < 0 || target.cue >= line.end - line.start)) ||
          (target.duration !== null && (!Number.isFinite(target.duration) || target.duration < 0))) {
        throw new Error(`Le repère du mot « ${target.answer} » sort de la ligne ${index + 1}. Recalez-le avec V.`)
      }
    }
    if (requireQuizCues && line.gameModes?.isMissingWord !== false && targets.length > 1 && (targets.some(target => target.cue === null) || new Set(targets.map(target => target.cue)).size !== targets.length)) {
      throw new Error(`Ligne ${index + 1} : chaque mot caché doit avoir un repère V distinct.`)
    }
    previousStart = line.start
    return {
      ...line,
      ...(Object.keys(animationProfiles).length ? { animationProfiles } : {}),
      gameModes: {
        ...line.gameModes,
        wordChoices: Array.isArray(line.gameModes?.wordChoices)
          ? line.gameModes.wordChoices.map(choices => Array.isArray(choices) ? choices.filter(choice => typeof choice === 'string' && choice.trim()) : []) : [],
        isMissingWord: Boolean(line.text.trim() && (line.gameModes?.isMissingWord ?? targets.length > 0)),
        multipleChoices: Array.isArray(line.gameModes?.multipleChoices)
          ? line.gameModes.multipleChoices.filter(choice => typeof choice === 'string' && choice.trim())
          : [],
        muteDuration: Number.isFinite(line.gameModes?.muteDuration) && line.gameModes.muteDuration >= 0
          ? line.gameModes.muteDuration : 2,
      },
    }
  })
}
