import { defineConfig } from 'vite'

const SERVER = `http://localhost:${process.env.PORT || 8080}`

// Relative base so the build can be served from any static host or subpath.
// In development, API and WebSocket traffic is proxied to the LAN server.
export default defineConfig({
  base: './',
  server: {
    proxy: {
      '/api': SERVER,
      '/ws': { target: SERVER, ws: true },
    },
  },
})
