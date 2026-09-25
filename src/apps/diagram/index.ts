// Entry point of the diagram editor, loaded on demand by the app registry.

import type { Session } from '../../core/session'
import { createLocalDocument } from '../../core/session'
import { DIAGRAM_ACCEPT, mountDiagram } from './app'
import { DiagramSync } from './sync'
import './diagram.css'

export const accept = DIAGRAM_ACCEPT

export function mount(session: Session): void {
  mountDiagram(session, document.getElementById('root')!)
}

// Imports a draw.io file into a new local document; returns its path.
export async function importFile(file: File): Promise<string> {
  const { parseDrawio } = await import('./formats/drawio')
  const pages = await parseDrawio(await file.text())
  const title = file.name.replace(/\.(drawio|xml)$/i, '')
  return createLocalDocument('diagram', title, (doc) => DiagramSync.setPages(doc, pages))
}
