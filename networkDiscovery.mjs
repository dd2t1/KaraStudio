import { Bonjour } from 'bonjour-service'
import { hostname } from 'node:os'

// Advertise only the public web listener, never the credential-bearing Node API.
export function advertiseKaraoke(port) {
  if (process.env.KARAOKE_DISCOVERY === 'false') return () => {}
  const bonjour = new Bonjour(undefined, () => console.warn('Découverte réseau indisponible ; utilisez l’URL manuelle.'))
  const service = bonjour.publish({ name: `Karaoke - ${hostname()}`, type: 'karaoke', protocol: 'tcp', port,
    txt: { app: 'karaoke-react', version: '1', path: '/', scheme: 'http' } })
  service.on('error', () => console.warn('Annonce réseau du karaoké indisponible.'))
  return () => bonjour.unpublishAll(() => bonjour.destroy())
}

export function karaokeDiscoveryPlugin() {
  const configure = server => {
    let stop
    const listener = server.httpServer
    listener?.once('listening', () => {
      const address = listener.address()
      if (address && typeof address === 'object') stop = advertiseKaraoke(address.port)
    })
    listener?.once('close', () => stop?.())
  }
  return { name: 'karaoke-network-discovery', configureServer: configure, configurePreviewServer: configure }
}
