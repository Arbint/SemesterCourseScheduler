import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

function readBackendPort(): number {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, '../.backend_port'), 'utf-8')
    const port = parseInt(raw.trim(), 10)
    return isNaN(port) ? 8000 : port
  } catch {
    return 8000
  }
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    strictPort: false,
    proxy: {
      '/api': `http://localhost:${readBackendPort()}`,
    },
    allowedHosts: [
      'schedule.jtwoodson.com'
    ]
  },
})
