// Entry point of the presentations app, loaded on demand by the app registry.

import type { Session } from '../../core/session'
import { createLocalDocument } from '../../core/session'
import { DiagramSync } from '../diagram/sync'
import { SLIDES_ACCEPT, mountSlides } from './app'
import { writePresentation } from './model'
import '../diagram/diagram.css'
import './slides.css'

export const accept = SLIDES_ACCEPT

export function mount(session: Session): void {
  mountSlides(session, document.getElementById('root')!)
}

// Imports a PowerPoint file into a new local presentation; returns its path.
export async function importFile(file: File): Promise<string> {
  const { parsePptx } = await import('./formats/pptx-import')
  const data = await parsePptx(await file.arrayBuffer())
  const title = file.name.replace(/\.pptx$/i, '')
  return createLocalDocument('slides', title, (doc) => writePresentation(doc, data, DiagramSync.setPages))
}
