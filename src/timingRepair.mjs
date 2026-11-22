// Repair a recording where each saved start was actually tapped at line end.
export function repairEndMarkers(lyrics, firstStart) {
  if (!Number.isFinite(firstStart) || firstStart < 0) throw new Error('Début invalide')
  return lyrics.map((line, index) => {
    const start = index === 0 ? firstStart : lyrics[index - 1].start
    const end = line.start
    if (!Number.isFinite(end) || end <= start) throw new Error(`Repère invalide à la ligne ${index + 1}`)
    return { ...line, start, end, words: [] }
  })
}
