export function getPlayerLines(lines, time) {
  // Half-open intervals switch to the new line exactly at its start.
  const active = lines.findIndex(line => time >= line.start && time < line.end)
  const upcoming = lines.findIndex(line => !line.isInstrumental && line.start > time)
  const current = active >= 0 ? (lines[active].isInstrumental ? -1 : active) : upcoming
  const next = current >= 0
    ? lines.findIndex((line, index) => index > current && !line.isInstrumental && line.end > time)
    : upcoming
  return { active, current, next }
}
