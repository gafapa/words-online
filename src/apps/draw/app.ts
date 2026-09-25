// Drawing app: Excalidraw inside the common shell, synced over Yjs.
// Written with React.createElement to avoid a JSX build step.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createElement as h, useEffect, useMemo, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Excalidraw, MainMenu, exportToBlob, exportToSvg, serializeAsJSON } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { appInfo } from '../registry'
import { homePath, newDocPath } from '../../core/router'
import type { Session } from '../../core/session'
import { setupChrome } from '../../ui/chrome'
import { renderShell } from '../../ui/shell'
import { el, toast } from '../../ui/widgets'
import { DrawSync } from './sync'

export const DRAW_ACCEPT = '.excalidraw'

// Fonts are served from our own origin (copied by scripts/copy-excalidraw-assets.mjs).
;(window as any).EXCALIDRAW_ASSET_PATH = `${import.meta.env.BASE_URL}excalidraw/`

export function mountDraw(session: Session, root: HTMLElement): void {
  const info = appInfo('draw')
  const shell = renderShell(info, root)
  shell.menubar.hidden = true // Excalidraw has its own main menu
  shell.toolbar.hidden = true
  shell.statusbar.hidden = true
  setupChrome(session, info.untitled)

  const container = el('div', { class: 'draw-host' })
  const fileInput = el('input', { type: 'file', accept: DRAW_ACCEPT, hidden: true })
  shell.main.append(container)
  document.body.append(fileInput)

  const sync = new DrawSync(session.doc, session.awareness)
  const title = () => String(session.doc.getMap('meta').get('title') || info.untitled).replace(/[\\/:*?"<>|]+/g, '_')

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

  function Editor() {
    const apiRef = useRef<any>(null)
    const initialData = useMemo(() => ({ ...sync.initialScene(), appState: { viewBackgroundColor: '#ffffff' } }) as any, [])

    useEffect(() => {
      const update = () => apiRef.current?.updateScene({ collaborators: sync.collaborators(session.doc.clientID) })
      session.awareness.on('change', update)
      return () => session.awareness.off('change', update)
    }, [])

    const download = async (format: 'png' | 'svg' | 'excalidraw') => {
      const api = apiRef.current
      if (!api) return
      const elements = api.getSceneElements()
      const appState = api.getAppState()
      const files = api.getFiles()
      let blob: Blob
      if (format === 'png') blob = await exportToBlob({ elements, appState: { ...appState, exportBackground: true }, files, mimeType: 'image/png' })
      else if (format === 'svg') blob = new Blob([(await exportToSvg({ elements, appState: { ...appState, exportBackground: true }, files })).outerHTML], { type: 'image/svg+xml' })
      else blob = new Blob([serializeAsJSON(elements, appState, files, 'local')], { type: 'application/json' })
      const a = el('a', { href: URL.createObjectURL(blob), download: `${title()}.${format}` })
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    }

    const item = (label: string, onSelect: () => void) => h(MainMenu.Item, { onSelect, children: label })
    return h(
      Excalidraw,
      {
        initialData,
        excalidrawAPI: (api: any) => {
          apiRef.current = api
          sync.attach(api)
          if (import.meta.env.DEV) Object.assign(window, { excalidrawAPI: api, drawSync: sync })
        },
        onChange: (_elements: readonly any[], _appState: any, files: any) => {
          const api = apiRef.current
          if (api) sync.onChange(api.getSceneElementsIncludingDeleted(), files)
        },
        onPointerUpdate: (payload: any) =>
          sync.onPointer(payload.pointer, payload.button, apiRef.current?.getAppState().selectedElementIds ?? {}),
        isCollaborating: true,
        UIOptions: { canvasActions: { loadScene: false } },
      },
      h(
        MainMenu,
        null,
        item('New drawing', () => window.open(newDocPath('draw'), '_blank')),
        item('Open file (.excalidraw)…', () => fileInput.click()),
        item('All documents', () => (location.href = homePath())),
        item('Share…', () => document.getElementById('btn-share')!.click()),
        h(MainMenu.Separator),
        item('Download PNG', () => download('png')),
        item('Download SVG', () => download('svg')),
        item('Download .excalidraw', () => download('excalidraw')),
        h(MainMenu.Separator),
        h(MainMenu.DefaultItems.SaveAsImage),
        h(MainMenu.DefaultItems.ClearCanvas),
        h(MainMenu.DefaultItems.ToggleTheme),
        h(MainMenu.DefaultItems.ChangeCanvasBackground),
        h(MainMenu.DefaultItems.Help),
      ),
    )
  }

  createRoot(container).render(h(Editor))
}
