// Entry point of the drawing app, loaded on demand by the app registry.

import * as Y from 'yjs'
import { loadFromBlob } from '@excalidraw/excalidraw'
import type { Session, SubmitFile } from '../../core/session'
import { createLocalDocument } from '../../core/session'
import { applyStateGeneric, RESTORE_ORIGIN } from '../../core/versions'
import { DRAW_ACCEPT, drawApis, exportDrawing, mountDraw } from './app'
import { DrawSync } from './sync'
import { t } from '../../core/i18n'
import './draw.css'

export const accept = DRAW_ACCEPT

export function mount(session: Session): void {
  mountDraw(session, document.getElementById('root')!)
}

// Imports an .excalidraw file into a new local document; returns its path.
export async function importFile(file: File): Promise<string> {
  const scene = await loadFromBlob(file, null, null)
  const title = file.name.replace(/\.[^.]+$/, '')
  return createLocalDocument('draw', title, (doc) =>
    DrawSync.setScene(doc, scene.elements as never, (scene.files ?? {}) as never),
  )
}

// "Hand in": the .excalidraw file and a PNG.
export async function submitFiles(session: Session): Promise<SubmitFile[]> {
  const api = drawApis.get(session)
  if (!api) throw new Error(t('The drawing is still loading'))
  const title = String(session.doc.getMap('meta').get('title') || t('Untitled drawing'))
  return [
    { name: `${title}.excalidraw`, blob: await exportDrawing(api, 'excalidraw') },
    { name: `${title}.png`, blob: await exportDrawing(api, 'png') },
  ]
}

type Element = { id: string; version: number; versionNonce?: number; isDeleted?: boolean; updated?: number }

// Elements are versioned: restored ones get a higher version than the current
// ones, and elements added since the version become deleted tombstones.
export function restoreVersion(session: Session, state: Uint8Array): void {
  const snapshot = new Y.Doc()
  Y.applyUpdate(snapshot, state)
  const old = snapshot.getMap<Element>('draw-elements')
  const live = session.doc.getMap<Element>('draw-elements')
  const bump = (e: Element, base: number): Element => ({ ...e, version: base + 1, versionNonce: Math.floor(Math.random() * 2 ** 31), updated: Date.now() })
  session.doc.transact(() => {
    for (const [id, current] of live) {
      const previous = old.get(id)
      if (previous) {
        if (JSON.stringify(previous) !== JSON.stringify(current)) live.set(id, bump(previous, Math.max(previous.version, current.version)))
      } else if (!current.isDeleted) {
        live.set(id, bump({ ...current, isDeleted: true }, current.version))
      }
    }
    for (const [id, previous] of old) if (!live.has(id)) live.set(id, previous)
    applyStateGeneric(session.doc, state, { skip: ['draw-elements', 'draw-files'] })
    // Images are content-addressed: only add missing ones.
    const files = session.doc.getMap('draw-files')
    snapshot.getMap('draw-files').forEach((value, key) => files.has(key) || files.set(key, value))
  }, RESTORE_ORIGIN)
  snapshot.destroy()
}
