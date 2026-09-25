// Diagram app: self-hosted draw.io inside the common shell, synced over Yjs.
// draw.io keeps its own menus and panels; the suite's file actions are added
// to its File menu and collaborators are shown on the canvas.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { appInfo } from '../registry'
import { homePath, newDocPath } from '../../core/router'
import type { Session } from '../../core/session'
import { setupChrome } from '../../ui/chrome'
import { renderShell } from '../../ui/shell'
import { el, toast } from '../../ui/widgets'
import { mountDrawio, type EditorUi } from './drawio'
import { DiagramPresence } from './presence'
import { DiagramSync, VSDX_PREFIX } from './sync'

export const DIAGRAM_ACCEPT = '.drawio,.xml,.vsdx'

export async function mountDiagram(session: Session, root: HTMLElement): Promise<void> {
  const info = appInfo('diagram')
  const shell = renderShell(info, root)
  // draw.io brings its own menu bar, toolbar and panels.
  shell.menubar.hidden = true
  shell.toolbar.hidden = true
  shell.statusbar.hidden = true
  setupChrome(session, info.untitled)

  const container = el('div', { class: 'diagram-host' })
  const fileInput = el('input', { type: 'file', accept: DIAGRAM_ACCEPT, hidden: true })
  shell.main.append(container)
  document.body.append(fileInput)

  const host = await mountDrawio(container, (win) => DiagramSync.initialXml(session.doc, win))
  const { ui, win } = host

  // A Visio file imported from the home screen is converted once draw.io is available.
  const pendingVisio = DiagramSync.pendingVisio(session.doc)
  if (pendingVisio) {
    const xml = await convertVisio(ui, pendingVisio)
    if (xml) {
      const loaded = host.next('load')
      host.post({ action: 'load', xml, autosave: 0 })
      await loaded
    }
  }

  const sync = new DiagramSync(session.doc, ui, win)
  sync.start()
  if (pendingVisio) DiagramSync.clearBase(session.doc)
  new DiagramPresence(ui, win, session.awareness, session.doc.clientID)

  // ---------- Suite actions in draw.io's File menu ----------

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file) return
    try {
      toast('Opening…')
      const { importFile } = await import('./index')
      location.href = await importFile(file)
    } catch (err) {
      toast(`Could not open the file: ${(err as Error).message}`)
    }
  })

  const fileMenu = ui.menus.get('file')
  const original = fileMenu.funct
  fileMenu.funct = function (menu: any, parent: any) {
    menu.addItem('New diagram', null, () => window.open(newDocPath('diagram'), '_blank'), parent)
    menu.addItem('Open file (.drawio, .vsdx)…', null, () => fileInput.click(), parent)
    menu.addItem('All documents', null, () => (location.href = homePath()), parent)
    menu.addItem('Share…', null, () => document.getElementById('btn-share')!.click(), parent)
    menu.addItem('Download .drawio', null, () => downloadDrawio(ui, session), parent)
    menu.addSeparator(parent)
    original.apply(this, [menu, parent])
  }

  // Save indicator: changes are stored locally as they happen.
  const saveState = document.getElementById('save-state')!
  let saveTimer = 0
  session.doc.on('update', () => {
    saveState.textContent = 'Saving…'
    clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => (saveState.textContent = 'Saved in this browser'), 600)
  })
  saveState.textContent = 'Saved in this browser'

  // Handles for automated browser tests in development builds only.
  if (import.meta.env.DEV) Object.assign(window, { drawio: host, diagramSync: sync })
}

function downloadDrawio(ui: EditorUi, session: Session): void {
  const xml = ui.getFileData(true, null, null, null, null, null, null, null, null, false)
  const title = String(session.doc.getMap('meta').get('title') || 'diagram')
  const a = el('a', {
    href: URL.createObjectURL(new Blob([xml], { type: 'application/vnd.jgraph.mxfile' })),
    download: `${title.replace(/[\\/:*?"<>|]+/g, '_')}.drawio`,
  })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// Converts a Visio file with draw.io's client-side importer.
function convertVisio(ui: EditorUi, base64: string): Promise<string | null> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'application/vnd.ms-visio.drawing' })
  return new Promise((resolve) => {
    ui.importVisio(
      blob,
      (xml: string) => resolve(xml),
      (err: unknown) => {
        toast(`Could not convert the Visio file: ${(err as Error)?.message ?? err}`)
        resolve(null)
      },
      'import.vsdx',
    )
  })
}

export { VSDX_PREFIX }
