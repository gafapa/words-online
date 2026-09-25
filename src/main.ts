// Bootstrap: routes by URL fragment to the home screen or to an app, loading
// only the code that is needed.

import './ui/base.css'
import { appInfo } from './apps/registry'
import { docPath, parseRoute } from './core/router'
import { registerServiceWorker } from './core/offline'
import { openSession } from './core/session'

registerServiceWorker()

const root = document.getElementById('root')!
const route = parseRoute()

// Switching documents is done through the URL; a clean reload keeps state simple.
window.addEventListener('hashchange', () => location.reload())

if (route.kind === 'home') {
  const { mountHome } = await import('./home/home')
  mountHome(root)
} else {
  const info = appInfo(route.type)
  if (!info.load) {
    root.innerHTML = `<div class="notice"><h1>${info.name}s are coming soon</h1><p><a href="#">Back to all documents</a></p></div>`
  } else {
    // Normalize the URL (adds app/key when missing) without triggering a reload.
    history.replaceState(null, '', docPath(route.type, route.id, route.key))
    const [module, session] = await Promise.all([info.load(), openSession(route.type, route.id, route.key)])
    await module.mount(session)
  }
}
