// One graph per media element. Deferred disposal tolerates React StrictMode's
// setup/cleanup/setup cycle without ever reconnecting a second source.
const graphs = new WeakMap()

function recordFor(audio) {
  if (!graphs.has(audio)) graphs.set(audio, { users: 0, timer: null, context: null, analyser: null })
  return graphs.get(audio)
}

export function retainConcertAudio(audio) {
  const record = recordFor(audio)
  clearTimeout(record.timer)
  record.users++
  return () => {
    record.users--
    record.timer = setTimeout(() => {
      if (record.users) return
      record.source?.disconnect()
      record.analyser?.disconnect()
      record.context?.close().catch(() => {})
      graphs.delete(audio)
    }, 0)
  }
}

export async function prepareConcertAudio(audio) {
  const record = recordFor(audio)
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext
  if (!Context) return
  if (!record.context) {
    let context
    try {
      context = new Context()
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.85
      const source = context.createMediaElementSource(audio)
      source.connect(context.destination)
      source.connect(analyser) // Analysis branch never adds a second audible path.
      Object.assign(record, { context, source, analyser })
    } catch {
      context?.close().catch(() => {})
      return // Native playback remains available when graph creation is unsupported.
    }
  }
  if (record.context.state === 'suspended') await record.context.resume()
}

export function getConcertAnalyser(audio) {
  const record = graphs.get(audio)
  return record?.context?.state === 'running' ? record.analyser : null
}
