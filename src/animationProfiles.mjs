// Animation profiles are data, never CSS text, scripts, URLs or selectors.
export const PROFILE_ID = /^anim-[a-f0-9]{16}$/
const ranges = { at: [0, 1], x: [-40, 40], y: [-40, 40], scale: [0.8, 1.35], rotate: [-20, 20], opacity: [0.75, 1], glow: [0, 20] }
const neutral = { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, glow: 0 }

export const animationProfileSchema = {
  type: 'object', additionalProperties: false, required: ['name', 'duration', 'easing', 'frames'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 60 },
    duration: { type: 'number', minimum: 0.4, maximum: 3 },
    easing: { type: 'string', enum: ['linear', 'smooth'] },
    frames: { type: 'array', minItems: 2, maxItems: 6, items: {
      type: 'object', additionalProperties: false, required: Object.keys(ranges),
      properties: Object.fromEntries(Object.entries(ranges).map(([key, [minimum, maximum]]) => [key, { type: 'number', minimum, maximum }])),
    } },
  },
}

export function validateAnimationProfile(raw) {
  if (!raw || typeof raw !== 'object' || Object.keys(raw).some(key => !['name', 'duration', 'easing', 'frames'].includes(key)) ||
      typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 60 || /[\u0000-\u001f<>]/u.test(raw.name) ||
      !Number.isFinite(raw.duration) || raw.duration < 0.4 || raw.duration > 3 || !['linear', 'smooth'].includes(raw.easing) ||
      !Array.isArray(raw.frames) || raw.frames.length < 2 || raw.frames.length > 6) throw new Error('Profil d’animation invalide.')
  const frames = raw.frames.map((frame, i) => {
    if (!frame || Object.keys(frame).some(key => !Object.hasOwn(ranges, key))) throw new Error('Propriété d’animation non autorisée.')
    const clean = {}
    for (const [key, [min, max]] of Object.entries(ranges)) {
      const value = frame[key]
      if (!Number.isFinite(value) || value < min || value > max) throw new Error('Valeur d’animation hors limites.')
      clean[key] = value
    }
    if (i && clean.at - raw.frames[i - 1].at < 0.12) throw new Error('Les étapes de l’animation sont trop rapprochées.')
    return clean
  })
  if (frames[0].at !== 0 || frames.at(-1).at !== 1 ||
      [frames[0], frames.at(-1)].some(frame => Object.entries(neutral).some(([key, value]) => frame[key] !== value))) throw new Error('L’animation doit commencer et terminer au repos.')
  return { name: raw.name.trim(), duration: raw.duration, easing: raw.easing, frames }
}

export function animationProfileId(profile) {
  const source = JSON.stringify(validateAnimationProfile(profile))
  let a = 2166136261, b = 3335557771
  for (let i = 0; i < source.length; i++) {
    a = Math.imul(a ^ source.charCodeAt(i), 16777619)
    b = Math.imul(b ^ source.charCodeAt(i), 2246822519)
  }
  return `anim-${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`
}

export function validateProfileLibrary(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length > 64) throw new Error('Bibliothèque d’animations invalide (64 profils maximum).')
  return Object.fromEntries(Object.entries(raw).map(([id, definition]) => {
    const profile = validateAnimationProfile(definition)
    if (!PROFILE_ID.test(id) || animationProfileId(profile) !== id) throw new Error('Identifiant de profil d’animation invalide.')
    return [id, profile]
  }))
}

// Deterministic sampling at the audio clock: pause and seek never desynchronize it.
export function profileStyle(profile, position, duration = profile.duration) {
  const at = Math.min(1, Math.max(0, position / duration))
  const end = Math.max(1, profile.frames.findIndex(frame => frame.at >= at))
  const right = profile.frames[end === -1 ? profile.frames.length - 1 : end]
  const left = profile.frames[Math.max(0, end - 1)]
  let progress = (at - left.at) / Math.max(0.001, right.at - left.at)
  if (profile.easing === 'smooth') progress = progress * progress * (3 - 2 * progress)
  const sample = key => left[key] + (right[key] - left[key]) * progress
  return { transform: `translate(${sample('x').toFixed(3)}px, ${sample('y').toFixed(3)}px) scale(${sample('scale').toFixed(4)}) rotate(${sample('rotate').toFixed(3)}deg)`,
    opacity: sample('opacity'), textShadow: `0 0 ${sample('glow').toFixed(2)}px currentColor` }
}
