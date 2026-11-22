export const animationPresets = [
  { id: 'saut', label: 'Saut', duration: 0.8 },
  { id: 'vague', label: 'Vague', duration: 0.8 },
  { id: 'flash', label: 'Néon', duration: 0.8 },
  { id: 'pulse', label: 'Pulsation', duration: 0.8 },
  { id: 'elastic', label: 'Élastique', duration: 0.8 },
  { id: 'swing', label: 'Balancement', duration: 0.8 },
]

export function effectDuration(value) {
  return Number.isFinite(value) ? Math.min(3, Math.max(0.2, value)) : 0.8
}

export function lineAnimationStyle(effect, time) {
  const period = { shake: 0.5, wave: 2, blink: 2 }[effect]
  if (!period) return {}
  return { animationPlayState: 'paused', animationDelay: `-${Math.max(0, time) % period}s` }
}

// A paused CSS animation is sampled at the audio time, including looping effects.
export function sampleEffect(token, time) {
  const duration = effectDuration(token.duration)
  const timed = Number.isFinite(token.cue)
  const elapsed = (time ?? 0) - (timed ? token.cue : 0)
  const active = Boolean(token.effect) && elapsed >= 0 && (!timed || elapsed < duration)
  return { active, duration, position: active ? (timed ? elapsed : elapsed % duration) : 0 }
}

export function applyEffectMarkup(text, effect, duration, cue = null) {
  if (!animationPresets.some(preset => preset.id === effect)) throw new Error('Effet inconnu.')
  if (cue !== null && (!Number.isFinite(cue) || cue < 0)) throw new Error('Le décalage doit être positif ou nul.')
  // Selecting an existing effect replaces it instead of creating nested effects.
  const existing = /^\*(?:saut|vague|flash|pulse|elastic|swing)(?:@\d+(?:\.\d+)?)?(?:\/\d+(?:\.\d+)?)?:([\s\S]+)\*$/.exec(text)
  return `*${effect}${cue === null ? '' : `@${cue.toFixed(2)}`}/${effectDuration(duration).toFixed(2)}:${existing ? existing[1] : text}*`
}
