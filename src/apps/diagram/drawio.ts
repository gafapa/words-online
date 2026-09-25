// Hosts the self-hosted draw.io web app (public/drawio) in a same-origin
// iframe and returns its EditorUi instance once a diagram is loaded.

/* eslint-disable @typescript-eslint/no-explicit-any */
export type DrawioWindow = Window & Record<string, any>
export type EditorUi = any

export interface DrawioHost {
  iframe: HTMLIFrameElement
  win: DrawioWindow
  ui: EditorUi
  // Sends a message using draw.io's embed protocol.
  post(message: Record<string, unknown>): void
  // Waits for the next embed event with the given name.
  next(event: string): Promise<Record<string, any>>
}

const PARAMS = new URLSearchParams({
  embed: '1',
  proto: 'json',
  spin: '1',
  noSaveBtn: '1',
  noExitBtn: '1',
  saveAndExit: '0',
  libraries: '1',
  lang: 'en',
  // No external services: everything runs from our own static copy.
  stealth: '1',
  pwa: '0',
  gapi: '0',
  od: '0',
  tr: '0',
  gh: '0',
  gl: '0',
  db: '0',
})

// `loadXml` is called when draw.io is ready and must return the initial mxfile XML.
export function mountDrawio(container: HTMLElement, loadXml: (win: DrawioWindow) => string): Promise<DrawioHost> {
  const iframe = document.createElement('iframe')
  iframe.className = 'drawio-frame'
  iframe.title = 'Diagram editor'
  iframe.src = `${import.meta.env.BASE_URL}drawio/index.html?${PARAMS}`
  container.append(iframe)

  const waiters = new Map<string, ((data: Record<string, any>) => void)[]>()
  window.addEventListener('message', (e) => {
    if (e.source !== iframe.contentWindow || typeof e.data !== 'string') return
    let data: Record<string, any>
    try {
      data = JSON.parse(e.data)
    } catch {
      return
    }
    const list = waiters.get(data.event)
    if (list?.length) list.shift()!(data)
  })
  const next = (event: string) =>
    new Promise<Record<string, any>>((resolve) => {
      const list = waiters.get(event) ?? []
      list.push(resolve)
      waiters.set(event, list)
    })
  const post = (message: Record<string, unknown>) => iframe.contentWindow!.postMessage(JSON.stringify(message), '*')

  return (async () => {
    await next('init')
    const win = iframe.contentWindow as DrawioWindow
    const loaded = next('load')
    post({ action: 'load', xml: loadXml(win), autosave: 0 })
    await loaded
    // Official plugin entry point: hands out the EditorUi instance.
    const ui = await new Promise<EditorUi>((resolve) => win.Draw.loadPlugin((instance: EditorUi) => resolve(instance)))
    return { iframe, win, ui, post, next }
  })()
}
