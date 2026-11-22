import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { karaokeDiscoveryPlugin } from './networkDiscovery.mjs'

const publicHosts = process.env.PUBLIC_HOSTS
  ? process.env.PUBLIC_HOSTS.split(',').map(h => h.trim()).filter(Boolean)
  : []

const apiProxy = {
  target: 'http://127.0.0.1:8787',
  rewrite: path => path.replace(/^\/dev(?=\/)/, ''),
  configure(proxy) {
    proxy.on('proxyReq', (proxyRequest, request) => {
      // Preserve the API's same-origin check across reverse proxies if host matches.
      const host = request.headers.host
      if (publicHosts.includes(host) && request.headers.origin === `https://${host}`) {
        proxyRequest.setHeader('Origin', `http://${host}`)
      }
    })
  },
}

function reverseProxyPrefix() {
  const configure = server => {
    const restorePrefix = request => {
      // The /dev reverse proxy strips its prefix before forwarding to Vite.
      if (publicHosts.includes(request.headers.host) && request.url?.startsWith('/') &&
          request.url !== '/dev' && !request.url.startsWith('/dev/')) request.url = `/dev${request.url}`
    }
    server.middlewares.use((request, _response, next) => { restorePrefix(request); next() })
    server.httpServer?.prependListener('upgrade', restorePrefix)
  }
  return { name: 'karaoke-reverse-proxy-prefix', configureServer: configure, configurePreviewServer: configure }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/dev/',
  plugins: [reverseProxyPrefix(), react(), karaokeDiscoveryPlugin()],
  preview: { host: '0.0.0.0', allowedHosts: publicHosts.length ? publicHosts : true },
  server: {
    host: '0.0.0.0',
    allowedHosts: publicHosts.length ? publicHosts : true,
    proxy: {
      '/dev/api': apiProxy,
      '/api': apiProxy,
    },
  },
})
