export function castTime(snapshot, elapsed, latency = 0) {
  const age = Math.max(0, snapshot.serverTime - snapshot.updatedAt) + elapsed + latency
  if (age > 2000) return { time: snapshot.time, stale: true }
  return { time: snapshot.time + (snapshot.playing ? age * snapshot.rate / 1000 : 0), stale: false }
}
