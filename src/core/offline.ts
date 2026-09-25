// Offline support: service worker registration and warming the caches of the
// parts that are not precached (draw.io), so the suite works without network.

import { registerSW } from 'virtual:pwa-register'
import drawio from '../../scripts/drawio.json'

const READY_KEY = `words-online:offline-ready:${drawio.version}`

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  registerSW({ immediate: true })
}

export function isOfflineCapable(): boolean {
  return 'serviceWorker' in navigator && !import.meta.env.DEV
}

export function isDiagramsReady(): boolean {
  try {
    return localStorage.getItem(READY_KEY) === '1'
  } catch {
    return false
  }
}

// Loads draw.io once in a hidden frame; the service worker caches every file it requests.
export async function prepareDiagramsOffline(timeoutMs = 120_000): Promise<void> {
  await navigator.serviceWorker.ready
  if (!navigator.serviceWorker.controller) {
    // First visit: wait until the new service worker takes control of this page.
    await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }))
  }
  const { drawioUrl } = await import('../apps/diagram/drawio')
  const iframe = document.createElement('iframe')
  iframe.hidden = true
  iframe.src = drawioUrl()
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out while downloading the diagram editor')), timeoutMs)
    window.addEventListener('message', function onMessage(e) {
      if (e.source !== iframe.contentWindow || typeof e.data !== 'string' || !e.data.includes('"init"')) return
      window.removeEventListener('message', onMessage)
      clearTimeout(timer)
      resolve()
    })
    document.body.append(iframe)
  })
  iframe.remove()
  try {
    localStorage.setItem(READY_KEY, '1')
  } catch {
    // Storage unavailable: the cache is still warm.
  }
}
