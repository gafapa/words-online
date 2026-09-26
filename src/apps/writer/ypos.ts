// Maps between ProseMirror positions and the Yjs XML tree that y-tiptap keeps
// in sync with the editor: absolute <-> Yjs relative positions (comment
// anchors that survive concurrent edits) and who created each piece of text.

import * as Y from 'yjs'
import type { Schema } from '@tiptap/pm/model'

interface TextEntry {
  start: number
  text: Y.XmlText
}

interface ElementEntry {
  // Position before the node and at the start of its content.
  before: number
  start: number
  end: number
  type: Y.XmlElement | Y.XmlFragment
}

// Position index of one Y.XmlFragment; build a new one after the document changes.
export class PositionIndex {
  private texts: TextEntry[] = []
  private elements: ElementEntry[] = []
  private starts = new Map<Y.AbstractType<unknown>, number>()
  private befores = new Map<Y.AbstractType<unknown>, number>()

  constructor(
    private fragment: Y.XmlFragment,
    private schema: Schema,
  ) {
    const end = this.walk(fragment, 0)
    this.elements.push({ before: 0, start: 0, end, type: fragment })
  }

  private walk(type: Y.XmlElement | Y.XmlFragment, pos: number): number {
    this.starts.set(type as Y.AbstractType<unknown>, pos)
    for (const child of type.toArray()) {
      this.befores.set(child as Y.AbstractType<unknown>, pos)
      if (child instanceof Y.XmlText) {
        this.texts.push({ start: pos, text: child })
        pos += child.length
      } else if (child instanceof Y.XmlElement) {
        const leaf = this.schema.nodes[child.nodeName]?.isLeaf
        if (leaf) pos += 1
        else {
          const end = this.walk(child, pos + 1)
          this.elements.push({ before: pos, start: pos + 1, end, type: child })
          pos = end + 1
        }
      }
    }
    return pos
  }

  toRelative(pos: number, assoc: number): Y.RelativePosition {
    // Inside (or at the edges of) a text run.
    let lo = 0
    let hi = this.texts.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const t = this.texts[mid]
      if (pos < t.start) hi = mid - 1
      else if (pos > t.start + t.text.length) lo = mid + 1
      else return Y.createRelativePositionFromTypeIndex(t.text, pos - t.start, assoc)
    }
    // Between nodes: index among the children of the deepest element containing pos.
    let best: ElementEntry = this.elements[this.elements.length - 1]
    for (const e of this.elements) if (pos >= e.start && pos <= e.end && e.end - e.start <= best.end - best.start) best = e
    const children = best.type.toArray()
    let index = children.findIndex((c) => (this.befores.get(c as Y.AbstractType<unknown>) ?? 0) >= pos)
    if (index < 0) index = children.length
    return Y.createRelativePositionFromTypeIndex(best.type, index, assoc)
  }

  toAbsolute(rel: Y.RelativePosition): number | null {
    const abs = Y.createAbsolutePositionFromRelativePosition(rel, this.fragment.doc!)
    if (!abs) return null
    const type = abs.type as Y.AbstractType<unknown>
    const start = this.starts.get(type)
    if (type instanceof Y.XmlText) {
      const at = this.befores.get(type as unknown as Y.AbstractType<unknown>)
      return at === undefined ? null : at + Math.min(abs.index, type.length)
    }
    if (start === undefined) return null
    const children = (type as unknown as Y.XmlElement).toArray()
    if (abs.index < children.length) return this.befores.get(children[abs.index] as Y.AbstractType<unknown>) ?? null
    const entry = this.elements.find((e) => e.type === (type as unknown))
    return entry ? entry.end : null
  }

  // Calls fn(from, to, clientId) for every piece of visible text and inline node.
  authorship(fn: (from: number, to: number, client: number) => void): void {
    for (const { start, text } of this.texts) {
      let pos = start
      let item = (text as unknown as { _start: YItem | null })._start
      while (item) {
        if (!item.deleted && item.countable) {
          fn(pos, pos + item.length, item.id.client)
          pos += item.length
        }
        item = item.right
      }
    }
    // Inline atoms (images, equations, footnotes) are elements of their own.
    for (const [type, before] of this.befores) {
      if (type instanceof Y.XmlElement && this.schema.nodes[type.nodeName]?.isLeaf && this.schema.nodes[type.nodeName]?.isInline) {
        const item = type._item
        if (item) fn(before, before + 1, item.id.client)
      }
    }
  }
}

interface YItem {
  deleted: boolean
  countable: boolean
  length: number
  id: { client: number }
  right: YItem | null
}

export type AnchorJSON = { start: unknown; end: unknown }

export function encodeAnchor(index: PositionIndex, from: number, to: number): AnchorJSON {
  return {
    start: Y.relativePositionToJSON(index.toRelative(from, 0)),
    end: Y.relativePositionToJSON(index.toRelative(to, -1)),
  }
}

export function decodeAnchor(index: PositionIndex, anchor: AnchorJSON): { from: number; to: number } | null {
  try {
    const from = index.toAbsolute(Y.createRelativePositionFromJSON(anchor.start))
    const to = index.toAbsolute(Y.createRelativePositionFromJSON(anchor.end))
    if (from === null || to === null) return null
    return { from: Math.min(from, to), to: Math.max(from, to) }
  } catch {
    return null
  }
}
