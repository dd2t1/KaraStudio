import 'dotenv/config'
import net from 'node:net'
import { pathToFileURL } from 'node:url'

export function portAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', error => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') resolve(false)
      else reject(error)
    })
    server.listen(port, '0.0.0.0', () => server.close(() => resolve(true)))
  })
}

export async function checkLauncher({ env = process.env, available = portAvailable, log = console.log } = {}) {
  const apiPort = Number(env.TRANSCRIPTION_PORT || 8787)
  if (apiPort !== 8787) {
    log('Le port API configure ne correspond pas a celui de l\'interface (8787).')
    log('Verifiez TRANSCRIPTION_PORT dans .env et vite.config.js avant de lancer.')
    return false
  }
  const ports = [[8787, 'serveur API'], [5173, 'interface']]
  let ready = true
  for (const [port, name] of ports) {
    if (!await available(port)) {
      log(`Le port ${port} (${name}) est deja utilise ou bloque.`)
      ready = false
    }
  }
  if (!ready) {
    log('Si Karaoke tourne deja, utilisez sa fenetre existante.')
    log('Sinon, arretez l\'ancien lancement avec Ctrl+C, puis recommencez.')
    log('Aucun processus existant n\'a ete arrete par ce lanceur.')
  }
  return ready
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!await checkLauncher()) process.exitCode = Number(process.env.TRANSCRIPTION_PORT || 8787) === 8787 ? 2 : 1
  } catch {
    console.error('Impossible de verifier les ports. Verifiez les autorisations reseau locales.')
    process.exitCode = 1
  }
}
