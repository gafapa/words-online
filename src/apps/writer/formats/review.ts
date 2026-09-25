// Review information for the exporters: where comments start and end in the
// body (first and last inline node with the comment's `commentRange` mark),
// and the suggestion mark of a node.

import type { JSONContent } from '@tiptap/core'
import type { CommentData, DocumentData } from './types'

export interface CommentMarkers {
  // Comments (with their replies, which share the range) starting before / ending after a node.
  starts: Map<JSONContent, CommentData[]>
  ends: Map<JSONContent, CommentData[]>
  // Comments that have a range, in order (replies after their parent).
  placed: CommentData[]
}

export function commentMarkers(data: DocumentData): CommentMarkers {
  const markers: CommentMarkers = { starts: new Map(), ends: new Map(), placed: [] }
  const list = data.comments ?? []
  if (!list.length) return markers
  const threads = new Map<string, CommentData[]>()
  for (const c of list) {
    const root = c.parentId ?? c.id
    threads.set(root, [...(threads.get(root) ?? []), c])
  }
  const first = new Map<string, JSONContent>()
  const last = new Map<string, JSONContent>()
  const walk = (node: JSONContent) => {
    for (const mark of node.marks ?? []) {
      if (mark.type !== 'commentRange') continue
      const id = String(mark.attrs?.id)
      if (!first.has(id)) first.set(id, node)
      last.set(id, node)
    }
    node.content?.forEach(walk)
  }
  walk(data.body)
  const add = (map: Map<JSONContent, CommentData[]>, node: JSONContent, items: CommentData[]) => map.set(node, [...(map.get(node) ?? []), ...items])
  for (const [id, thread] of threads) {
    const start = first.get(id)
    const end = last.get(id)
    if (!start || !end) continue
    add(markers.starts, start, thread)
    add(markers.ends, end, thread)
    markers.placed.push(...thread)
  }
  return markers
}

export interface Change {
  kind: 'insertion' | 'deletion'
  author: string
  date: number
}

// Tracked change of an inline node; a suggested deletion of a suggested insertion is a deletion.
export function changeOf(node: JSONContent): Change | null {
  const marks = node.marks ?? []
  const mark = marks.find((m) => m.type === 'deletion') ?? marks.find((m) => m.type === 'insertion')
  if (!mark) return null
  return { kind: mark.type as Change['kind'], author: String(mark.attrs?.author || 'Unknown'), date: Number(mark.attrs?.time) || Date.now() }
}
