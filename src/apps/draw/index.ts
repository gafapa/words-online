// Entry point of the drawing app, loaded on demand by the app registry.

import { loadFromBlob } from '@excalidraw/excalidraw'
import type { Session } from '../../core/session'
import { createLocalDocument } from '../../core/session'
import { DRAW_ACCEPT, mountDraw } from './app'
import { DrawSync } from './sync'
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
