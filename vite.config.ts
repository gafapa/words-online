import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const drawio = JSON.parse(readFileSync(new URL('./scripts/drawio.json', import.meta.url), 'utf8')) as { version: string }

// Relative base so the build can be served from any static host or subpath.
export default defineConfig({
  base: './',
  plugins: [
    // Installable web app that works offline. The suite and its apps are
    // precached; draw.io (large) and CJK fonts are cached the first time they
    // are used, or ahead of time from the home screen.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'Words Online',
        short_name: 'Words Online',
        description: 'Collaborative office suite that runs in your browser: documents, spreadsheets, drawings and diagrams.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1a73e8',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
        file_handlers: [
          {
            action: './',
            accept: {
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
              'application/vnd.oasis.opendocument.text': ['.odt'],
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
              'application/vnd.oasis.opendocument.spreadsheet': ['.ods'],
              'text/csv': ['.csv'],
              'application/vnd.jgraph.mxfile': ['.drawio'],
              'application/json': ['.excalidraw'],
            },
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,ico,webmanifest}'],
        globIgnores: ['drawio/**', 'excalidraw/fonts/Xiaolai/**'],
        // The spreadsheet engine is a single large chunk.
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/drawio\//],
        cleanupOutdatedCaches: true,
        // Take control right away, so the first visit already works offline afterwards.
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/drawio/'),
            handler: 'CacheFirst',
            options: {
              // Versioned: a new draw.io release starts a fresh cache.
              cacheName: `drawio-${drawio.version}`,
              expiration: { maxEntries: 5000 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/excalidraw/fonts/'),
            handler: 'CacheFirst',
            options: { cacheName: 'excalidraw-fonts', cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
})
