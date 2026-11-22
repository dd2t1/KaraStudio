export const AI_STAGES = {
  'cache-check': 'Vérification du cache serveur', queued: 'En attente du moteur',
  'loading-model': 'Chargement du modèle Laya', laya: 'Laya examine la phrase',
  selected: 'Phrase retenue par Laya', skipped: 'Phrase écartée : pas d’appel LM Studio',
  lmstudio: 'LM Studio génère les propositions', validating: 'Validation et contrôles locaux',
  cache: 'Résultat récupéré du cache serveur', complete: 'Analyse terminée',
}

export async function readAiResponse(response, onProgress = () => {}) {
  if (!response.ok) {
    const payload = await response.json()
    throw new Error(payload.error || 'Analyse indisponible.')
  }
  if (!response.headers.get('content-type')?.includes('text/event-stream')) return response.json()
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      if (buffer.length > 1024 * 1024) throw new Error('Réponse IA trop volumineuse.')
      let boundary
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index)
        buffer = buffer.slice(boundary.index + boundary[0].length)
        const lines = frame.split(/\r?\n/)
        const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim()
        const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
        if (!data) continue
        const payload = JSON.parse(data)
        if (event === 'progress' && Object.hasOwn(AI_STAGES, payload.stage)) onProgress(payload)
        if (event === 'result') return payload
        if (event === 'error') throw new Error(payload.error || 'Analyse indisponible.')
      }
      if (done) throw new Error('Le suivi IA a été interrompu. Réessayez.')
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
