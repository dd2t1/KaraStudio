// The cursor points to the next segment whose start must be recorded.
export function syncAction({ cursor, count, time, duration, paused, ended, completed }) {
  if (completed || count === 0) return 'ignore'
  const atEnd = ended || (Number.isFinite(duration) && duration > 0 && time >= duration)
  if (cursor === count) return 'finish'
  if (atEnd) return 'incomplete'
  return paused ? 'paused' : 'stamp'
}

export function stampSegment(lines, cursor, time) {
  if (!Number.isFinite(time) || time < 0 || cursor < 0 || cursor > lines.length) return null
  if (cursor > 0 && time <= lines[cursor - 1].start) return null
  return lines.map((line, index) => {
    if (index === cursor) return { ...line, start: time, end: 0, words: [] }
    if (index === cursor - 1) return { ...line, end: time }
    return line
  })
}

export function rewindSegment(lines, index) {
  const time = Math.max(index > 0 ? lines[index - 1].start : 0, lines[index].start - 2, 0)
  return {
    time,
    lines: lines.map((line, i) => i >= index
      ? { ...line, start: 0, end: 0, words: [] }
      : i === index - 1 ? { ...line, end: 0 } : line),
  }
}
