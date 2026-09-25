// Entry point of the diagram editor, loaded on demand by the app registry.

import type { Session } from '../../core/session'
import { createLocalDocument } from '../../core/session'
import { DIAGRAM_ACCEPT, mountDiagram } from './app'
import { DiagramSync, VSDX_PREFIX } from './sync'
import './diagram.css'

export const accept = DIAGRAM_ACCEPT

export function mount(session: Session): Promise<void> {
  return mountDiagram(session, document.getElementById('root')!)
}

// Imports a draw.io or Visio file into a new local document; returns its path.
export async function importFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  const title = file.name.replace(/\.[^.]+$/, '')
  let base: string
  if (ext === 'vsdx') {
    // Converted by draw.io itself when the document is first opened.
    const bytes = new Uint8Array(await file.arrayBuffer())
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    base = VSDX_PREFIX + btoa(bin)
  } else {
    base = await file.text()
    if (!/<mxfile|<mxGraphModel/.test(base)) throw new Error('Not a draw.io diagram')
    if (!/<mxfile/.test(base)) base = `<mxfile><diagram id="page-1" name="Page-1">${base}</diagram></mxfile>`
  }
  return createLocalDocument('diagram', title, (doc) => DiagramSync.setBase(doc, base))
}
