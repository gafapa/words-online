// Offline support: service worker registration. Every app is precached, so
// once the service worker is active the whole suite works without network.

import { registerSW } from 'virtual:pwa-register'

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  registerSW({ immediate: true })
}

export function isOfflineCapable(): boolean {
  return 'serviceWorker' in navigator && !import.meta.env.DEV
}

// Resolves once the service worker has cached the suite.
export async function whenOfflineReady(): Promise<void> {
  await navigator.serviceWorker.ready
}
