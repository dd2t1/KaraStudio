export const lyricFonts = { default: null, sans: 'Arial, sans-serif', serif: 'Georgia, serif', rounded: 'Trebuchet MS, sans-serif', mono: 'Courier New, monospace' }
export const lyricTransitions = ['none', 'fade', 'slide', 'rise', 'zoom']

export function lyricPresentation(line, scale = 1) {
  const fontFamily = lyricFonts[line?.fontFamily] || undefined
  const size = Number(line?.fontSize)
  return { ...(fontFamily ? { fontFamily } : {}), ...(Number.isFinite(size) && size >= 20 && size <= 120 ? { fontSize: `clamp(${Math.round(size * scale * 0.5)}px, ${size * scale / 16}vw, ${size * scale}px)` } : {}) }
}

export function lyricTransition(line, time) {
  const transition = lyricTransitions.includes(line?.transition) ? line.transition : 'none'
  return { className: `lyric-transition-${transition}`, style: { animationPlayState: 'paused', animationDelay: `-${(time < 0 ? 0.6 : Math.max(0, time || 0))}s` } }
}
