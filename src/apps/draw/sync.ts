// Collaboration for Excalidraw over Yjs.
//
// Every element (deleted ones included, as tombstones) is a value in a shared
// Y.Map keyed by element id; z-order comes from the elements' fractional
// `index`. Local changes are detected with Excalidraw's per-element version
// counter and written to Yjs; remote changes replace the local copies without
// entering the local undo history. Image data lives in a separate map.

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import { CaptureUpdateAction } from '@excalidraw/excalidraw'

type Element = Record<string, any> & { id: string; version: number; versionNonce: number; index?: string | null }
type FileData = Record<string, any> & { id: string }
type Api = any

export class DrawSync {
  readonly elements: Y.Map<Element>
  readonly files: Y.Map<FileData>
  // Last version seen per element, to detect local edits.
  private versions = new Map<string, number>()
  private applying = false

  constructor(
    private readonly doc: Y.Doc,
    private readonly awareness: Awareness,
  ) {
    this.elements = doc.getMap<Element>('draw-elements')
    this.files = doc.getMap<FileData>('draw-files')
  }

  // Elements and files for Excalidraw's initialData.
  initialScene(): { elements: Element[]; files: Record<string, FileData> } {
    const elements = sortByIndex([...this.elements.values()])
    for (const e of elements) this.versions.set(e.id, e.version)
    return { elements, files: this.files.toJSON() as Record<string, FileData> }
  }

  attach(api: Api): void {
    this.elements.observe((event, tr) => {
      if (tr.origin === this) return
      const current = new Map<string, Element>(api.getSceneElementsIncludingDeleted().map((e: Element) => [e.id, e]))
      for (const id of event.keysChanged) {
        const remote = this.elements.get(id)
        if (remote) {
          current.set(id, remote)
          this.versions.set(id, remote.version)
        }
      }
      this.applying = true
      try {
        api.updateScene({ elements: sortByIndex([...current.values()]), captureUpdate: CaptureUpdateAction.NEVER })
      } finally {
        this.applying = false
      }
    })
    this.files.observe((event, tr) => {
      if (tr.origin === this) return
      const added = [...event.keysChanged].map((id) => this.files.get(id)).filter(Boolean)
      if (added.length) api.addFiles(added)
    })
  }

  // Called from Excalidraw's onChange with all elements (deleted included).
  onChange(elements: readonly Element[], files: Record<string, FileData>): void {
    if (this.applying) return
    const changed = elements.filter((e) => this.versions.get(e.id) !== e.version)
    const newFiles = Object.values(files ?? {}).filter((f) => !this.files.has(f.id))
    if (!changed.length && !newFiles.length) return
    this.doc.transact(() => {
      for (const e of changed) {
        this.versions.set(e.id, e.version)
        this.elements.set(e.id, { ...e })
      }
      for (const f of newFiles) this.files.set(f.id, { ...f })
    }, this)
  }

  // Shares the local pointer and selection.
  onPointer(pointer: { x: number; y: number; tool: 'pointer' | 'laser' }, button: 'up' | 'down', selectedElementIds: Record<string, boolean>): void {
    this.awareness.setLocalStateField('draw', { pointer, button, selectedElementIds })
  }

  // Collaborators map for Excalidraw from the awareness states.
  collaborators(selfId: number): Map<string, any> {
    const out = new Map<string, any>()
    for (const [clientId, state] of this.awareness.getStates()) {
      if (clientId === selfId || !state.user) continue
      out.set(String(clientId), {
        id: String(clientId),
        username: state.user.name,
        color: { background: state.user.color, stroke: state.user.color },
        pointer: state.draw?.pointer,
        button: state.draw?.button,
        selectedElementIds: state.draw?.selectedElementIds,
      })
    }
    return out
  }

  // Seeds a new document with an imported scene.
  static setScene(doc: Y.Doc, elements: Element[], files: Record<string, FileData>): void {
    const map = doc.getMap<Element>('draw-elements')
    const fileMap = doc.getMap<FileData>('draw-files')
    for (const e of elements) map.set(e.id, e)
    for (const f of Object.values(files)) fileMap.set(f.id, f)
  }
}

function sortByIndex(elements: Element[]): Element[] {
  return elements.sort((a, b) => {
    const x = a.index ?? ''
    const y = b.index ?? ''
    return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : 1
  })
}
