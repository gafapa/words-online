// Drawing app: Excalidraw inside the common shell, synced over Yjs.
// Written with React.createElement to avoid a JSX build step.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createElement as h, useEffect, useMemo, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Excalidraw, MainMenu, exportToBlob, exportToSvg, serializeAsJSON } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { appInfo } from '../registry'
import { printImages } from '../../core/handin'
import { language, locale, t } from '../../core/i18n'
import { homePath, newDocPath } from '../../core/router'
import type { Session } from '../../core/session'
import { setupChrome } from '../../ui/chrome'
import { renderShell } from '../../ui/shell'
import { nextcloudActions } from '../../ui/nextcloud'
import { makeCopy, openVersionHistory, saveNamedVersion } from '../../ui/versions'
import { el, toast } from '../../ui/widgets'
import { DrawSync } from './sync'

export const DRAW_ACCEPT = '.excalidraw'

// Fonts are served from our own origin (copied by scripts/copy-excalidraw-assets.mjs).
;(window as any).EXCALIDRAW_ASSET_PATH = `${import.meta.env.BASE_URL}excalidraw/`

// Excalidraw API of each open session (for hand in).
export const drawApis = new WeakMap<Session, any>()

export async function exportDrawing(api: any, format: 'png' | 'svg' | 'excalidraw'): Promise<Blob> {
  const elements = api.getSceneElements()
  const appState = api.getAppState()
  const files = api.getFiles()
  if (format === 'png') return exportToBlob({ elements, appState: { ...appState, exportBackground: true }, files, mimeType: 'image/png' })
  if (format === 'svg') return new Blob([(await exportToSvg({ elements, appState: { ...appState, exportBackground: true }, files })).outerHTML], { type: 'image/svg+xml' })
  return new Blob([serializeAsJSON(elements, appState, files, 'local')], { type: 'application/json' })
}

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
      toast(t('Opening…'))
      const { importFile } = await import('./index')
      location.href = await importFile(file)
    } catch (err) {
      toast(t('Could not open the file: {message}', { message: (err as Error).message }))
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
      const blob = await exportDrawing(api, format)
      const a = el('a', { href: URL.createObjectURL(blob), download: `${title()}.${format}` })
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    }

    const item = (label: string, onSelect: () => void) => h(MainMenu.Item, { onSelect, children: label })
    const cloud = nextcloudActions(session)
    return h(
      Excalidraw,
      {
        initialData,
        excalidrawAPI: (api: any) => {
          apiRef.current = api
          drawApis.set(session, api)
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
        // Excalidraw's own interface in the suite's language.
        langCode: language === 'en' ? 'en' : locale,
        // Viewers and commenters cannot change the drawing.
        viewModeEnabled: !session.canEdit,
        UIOptions: { canvasActions: { loadScene: false } },
      },
      h(
        MainMenu,
        null,
        item(t('New drawing'), () => window.open(newDocPath('draw'), '_blank')),
        item(t('Open file (.excalidraw)…'), () => fileInput.click()),
        item(t('All documents'), () => (location.href = homePath())),
        item(t('Share…'), () => document.getElementById('btn-share')!.click()),
        h(MainMenu.Separator),
        item(t('Open from Nextcloud…'), cloud.open),
        item(t('Save to Nextcloud'), cloud.save),
        item(t('Save to Nextcloud as…'), cloud.saveAs),
        item(t('Nextcloud account…'), cloud.account),
        h(MainMenu.Separator),
        item(t('Make a copy'), () => void makeCopy(session)),
        session.canEdit ? item(t('Save version…'), () => void saveNamedVersion(session)) : null,
        item(t('Version history…'), () => void openVersionHistory(session)),
        h(MainMenu.Separator),
        item(t('Download PNG'), () => download('png')),
        item(t('Download SVG'), () => download('svg')),
        item(t('Download .excalidraw'), () => download('excalidraw')),
        h(MainMenu.Separator),
        h(MainMenu.DefaultItems.SaveAsImage),
        h(MainMenu.DefaultItems.ClearCanvas),
        h(MainMenu.DefaultItems.ToggleTheme),
        h(MainMenu.DefaultItems.ChangeCanvasBackground),
        h(MainMenu.DefaultItems.Help),
      ),
    )
  }

  const exportBlob = (format: 'png' | 'svg' | 'excalidraw') => async () => {
    const api = drawApis.get(session)
    if (!api) throw new Error(t('The drawing is still loading'))
    return exportDrawing(api, format)
  }
  session.hooks.exportFormats = () => [
    { ext: 'excalidraw', label: t('Excalidraw drawing (.excalidraw)'), build: exportBlob('excalidraw') },
    { ext: 'png', label: t('PNG image'), build: exportBlob('png') },
    { ext: 'svg', label: t('SVG image'), build: exportBlob('svg') },
  ]

  session.hooks.print = async () => {
    const api = drawApis.get(session)
    if (api) await printImages([await exportDrawing(api, 'png')])
  }

  createRoot(container).render(h(Editor))
}
