import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'receiver', base: './', plugins: [react()],
  build: { outDir: '../home-assistant/custom_components/karaoke_storage/frontend/receiver', emptyOutDir: true, target: 'chrome79' },
})
