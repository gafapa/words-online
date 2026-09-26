// Suggestions (track changes). In suggesting mode, local edits are rewritten
// before they are applied: inserted text gets an `insertion` mark and deleted
// text stays in the document with a `deletion` mark. Deleting one's own
// suggested insertion removes it for real. Suggestions are then accepted or
// rejected by id. Remote changes and undo/redo (which come through Yjs) are
// never rewritten.

import { Extension, Mark, mergeAttributes } from '@tiptap/core'
import type { Mark as PMMark, MarkType, Node as PMNode } from '@tiptap/pm/model'
import { Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Mapping, ReplaceStep } from '@tiptap/pm/transform'
import { ySyncPluginKey } from '@tiptap/y-tiptap'

export const SKIP_SUGGESTION = 'suggestion-skip'

export interface SuggestionUser {
  id: string
  name: string
  color: string
}

export interface Suggestion {
  id: string
  kind: 'insertion' | 'deletion'
  author: string
  authorId: string
  color: string
  time: number
  from: number
  to: number
  text: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    suggestions: {
      setSuggesting: (on: boolean) => ReturnType
      acceptSuggestion: (id: string) => ReturnType
      rejectSuggestion: (id: string) => ReturnType
      acceptAllSuggestions: () => ReturnType
      rejectAllSuggestions: () => ReturnType
    }
  }
  interface Storage {
    suggestions: { enabled: boolean; user: SuggestionUser; client: number }
  }
}

const suggestionAttributes = () => ({
  id: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-suggestion') ?? '' },
  author: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-author') ?? '' },
  authorId: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-author-id') ?? '' },
  color: { default: '#1a73e8', parseHTML: (el: HTMLElement) => el.getAttribute('data-color') ?? '#1a73e8' },
  time: { default: 0, parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-time')) || 0 },
})

const renderSuggestion = (tag: string, cls: string) =>
  ({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) => {
    const { id, author, authorId, color, time, ...rest } = HTMLAttributes
    return [
      tag,
      mergeAttributes(rest, {
        'data-suggestion': id,
        'data-author': author,
        'data-author-id': authorId,
        'data-color': color,
        'data-time': time,
        class: cls,
        style: `--sg-color: ${color}`,
        title: String(author),
      }),
      0,
    ] as [string, Record<string, unknown>, 0]
  }

export const Insertion = Mark.create({
  name: 'insertion',
  inclusive: false,
  addAttributes: suggestionAttributes,
  parseHTML: () => [{ tag: 'ins[data-suggestion]' }],
  renderHTML: renderSuggestion('ins', 'sg-ins'),
})

export const Deletion = Mark.create({
  name: 'deletion',
  inclusive: false,
  addAttributes: suggestionAttributes,
  parseHTML: () => [{ tag: 'del[data-suggestion]' }],
  renderHTML: renderSuggestion('del', 'sg-del'),
})

// Who inserted a piece of text (Yjs client id of the author's session). Unlike
// the Yjs items themselves, marks follow text that y-tiptap re-creates (for
// instance the second half of a paragraph split by someone else).
export const Authorship = Mark.create({
  name: 'authorship',
  inclusive: true,
  addAttributes: () => ({ client: { default: 0 } }),
  parseHTML: () => [],
  renderHTML: () => ['span', {}, 0],
})

export const newSuggestionId = () => Math.random().toString(36).slice(2, 10)

export const Suggesting = Extension.create({
  name: 'suggestions',
  addStorage: () => ({ enabled: false, user: { id: '', name: '', color: '#1a73e8' } as SuggestionUser, client: 0 }),
  addExtensions: () => [Insertion, Deletion, Authorship],
  dispatchTransaction({ transaction, next }) {
    const tr = transaction
    if (!tr.docChanged || tr.getMeta(ySyncPluginKey) || !this.editor.isEditable) {
      next(tr)
      return
    }
    let out = tr
    if (this.storage.enabled && !tr.getMeta(SKIP_SUGGESTION)) {
      try {
        out = convert(this.editor.state, tr, this.storage.user) ?? tr
      } catch (err) {
        console.warn('Suggestion tracking failed; change applied directly', err)
      }
    }
    if (this.storage.client) markAuthorship(out, this.storage.client)
    next(out)
  },
  addCommands() {
    const resolve =
      (accept: boolean, id: string | null) =>
      ({ state, dispatch }: { state: EditorState; dispatch?: (tr: Transaction) => void }) => {
        const tr = state.tr.setMeta(SKIP_SUGGESTION, true)
        const done = resolveSuggestions(tr, accept, id)
        if (done && dispatch) dispatch(tr)
        return done
      }
    return {
      setSuggesting:
        (on) =>
        ({ tr }) => {
          this.storage.enabled = on
          tr.setMeta('suggesting', on)
          return true
        },
      acceptSuggestion: (id) => resolve(true, id),
      rejectSuggestion: (id) => resolve(false, id),
      acceptAllSuggestions: () => resolve(true, null),
      rejectAllSuggestions: () => resolve(false, null),
    }
  },
})

// ---------- Rewriting edits ----------

function convert(state: EditorState, tr: Transaction, user: SuggestionUser): Transaction | null {
  const steps = tr.steps
  // Only plain replacements are tracked; structural steps (lists, marks, attributes) pass through.
  if (!steps.some((s) => s instanceof ReplaceStep)) return null
  const schema = state.schema
  const ins = schema.marks.insertion
  const del = schema.marks.deletion
  const out = state.tr
  const time = Date.now()
  const origMaps = tr.mapping.maps
  // Maps positions of the original transaction's document before step i into `out`.
  const mappingAt = (i: number) => {
    const m = new Mapping()
    for (let k = i - 1; k >= 0; k--) m.appendMap(origMaps[k].invert())
    m.appendMapping(out.mapping)
    return m
  }
  const toOut = (pos: number, i: number, assoc: number) => mappingAt(i).map(pos, assoc)
  let cursor: number | null = null
  const single = steps.length === 1
  const oldSel = state.selection

  steps.forEach((step, i) => {
    if (!(step instanceof ReplaceStep)) {
      const mapped = step.map(mappingAt(i))
      if (mapped) out.maybeStep(mapped)
      return
    }
    const { from, to, slice } = step as unknown as { from: number; to: number; slice: import('@tiptap/pm/model').Slice }
    let cf = toOut(from, i, 1)
    let ct = Math.max(cf, toOut(to, i, -1))
    if (from === to) cf = ct = toOut(from, i, 1)
    let keptEnd = ct
    if (cf < ct) {
      if (!hasInline(out.doc, cf, ct)) {
        // Only block boundaries (joining paragraphs): applied directly.
        out.replace(cf, ct)
        keptEnd = cf
      } else {
        const own: [number, number][] = []
        const marked: [number, number][] = []
        out.doc.nodesBetween(cf, ct, (node, pos, parent) => {
          if (!node.isInline) return true
          const a = Math.max(pos, cf)
          const b = Math.min(pos + node.nodeSize, ct)
          if (a >= b) return false
          const mine = node.marks.some((m) => m.type === ins && m.attrs.authorId === user.id)
          if (mine || !parent?.type.allowsMarkType(del)) own.push([a, b])
          else if (!node.marks.some((m) => m.type === del)) marked.push([a, b])
          return false
        })
        if (marked.length) {
          const mark = adjacentMark(out.doc, marked[0][0], marked[marked.length - 1][1], del, user) ?? del.create({ id: newSuggestionId(), author: user.name, authorId: user.id, color: user.color, time })
          for (const [a, b] of marked) out.addMark(a, b, mark)
        }
        const before = out.steps.length
        for (const [a, b] of own.reverse()) out.delete(a, b)
        const m = out.mapping.slice(before)
        cf = m.map(cf, -1)
        keptEnd = m.map(ct, 1)
      }
    }
    let end = keptEnd
    if (slice.size) {
      const before = out.steps.length
      out.replace(keptEnd, keptEnd, stripSuggestions(slice, schema.marks.deletion, ins))
      const m = out.mapping.slice(before)
      const start = m.map(keptEnd, -1)
      end = m.map(keptEnd, 1)
      if (start < end) {
        const mark = adjacentMark(out.doc, start, end, ins, user) ?? ins.create({ id: newSuggestionId(), author: user.name, authorId: user.id, color: user.color, time })
        out.addMark(start, end, mark)
      }
      cursor = end
    } else if (single) {
      // Backspace leaves the caret before the struck text; Delete and range deletions after it.
      cursor = oldSel.empty && oldSel.head === to ? cf : keptEnd
    }
  })

  if (!out.docChanged) return null
  // Selection
  let selection: Selection
  if (cursor !== null) selection = TextSelection.near(out.doc.resolve(Math.min(cursor, out.doc.content.size)))
  else selection = safeMapSelection(tr, out)
  out.setSelection(selection)
  if (tr.storedMarksSet) out.setStoredMarks(tr.storedMarks?.filter((m) => m.type !== ins && m.type !== del) ?? null)
  if (tr.scrolledIntoView) out.scrollIntoView()
  for (const [key, value] of Object.entries((tr as unknown as { meta: Record<string, unknown> }).meta ?? {})) out.setMeta(key, value)
  return out
}

function safeMapSelection(tr: Transaction, out: Transaction): Selection {
  try {
    const head = Math.min(tr.selection.head, out.doc.content.size)
    return TextSelection.near(out.doc.resolve(head))
  } catch {
    return Selection.atEnd(out.doc)
  }
}

function hasInline(doc: PMNode, from: number, to: number): boolean {
  let found = false
  doc.nodesBetween(from, to, (node) => {
    if (found) return false
    if (node.isInline) found = true
    return !found
  })
  return found
}

// The same author's suggestion right before or after a range, which the range joins.
function adjacentMark(doc: PMNode, from: number, to: number, type: MarkType, user: SuggestionUser): PMMark | null {
  const find = (node: PMNode | null | undefined) => node?.marks.find((m) => m.type === type && m.attrs.authorId === user.id)
  try {
    return find(doc.resolve(from).nodeBefore) ?? find(doc.resolve(to).nodeAfter) ?? null
  } catch {
    return null
  }
}

function stripSuggestions(slice: import('@tiptap/pm/model').Slice, ...types: MarkType[]) {
  const strip = (fragment: import('@tiptap/pm/model').Fragment): import('@tiptap/pm/model').Fragment => {
    const nodes: PMNode[] = []
    fragment.forEach((node) => {
      if (node.isInline) nodes.push(node.mark(node.marks.filter((m) => !types.includes(m.type))))
      else nodes.push(node.copy(strip(node.content)))
    })
    return (fragment.constructor as typeof import('@tiptap/pm/model').Fragment).from(nodes)
  }
  return new (slice.constructor as typeof import('@tiptap/pm/model').Slice)(strip(slice.content), slice.openStart, slice.openEnd)
}

// Marks everything the transaction inserted as written by `client`.
function markAuthorship(tr: Transaction, client: number): void {
  const type = tr.doc.type.schema.marks.authorship
  if (!type) return
  const ranges: [number, number][] = []
  tr.steps.forEach((step, i) => {
    if (!(step instanceof ReplaceStep)) return
    const rest = tr.mapping.slice(i + 1)
    step.getMap().forEach((_a, _b, start, end) => {
      if (end > start) ranges.push([rest.map(start, 1), rest.map(end, -1)])
    })
  })
  const mark = type.create({ client })
  for (const [a, b] of ranges) if (b > a) tr.addMark(a, b, mark)
}

// ---------- Accept / reject ----------

function resolveSuggestions(tr: Transaction, accept: boolean, id: string | null): boolean {
  const schema = tr.doc.type.schema
  const ranges: { from: number; to: number; mark: PMMark }[] = []
  tr.doc.descendants((node, pos) => {
    if (!node.isInline) return true
    for (const mark of node.marks) {
      if ((mark.type.name === 'insertion' || mark.type.name === 'deletion') && (id === null || mark.attrs.id === id)) {
        ranges.push({ from: pos, to: pos + node.nodeSize, mark })
      }
    }
    return false
  })
  if (!ranges.length) return false
  // Marks first (positions unchanged), then deletions from the end.
  const removals: [number, number][] = []
  for (const r of ranges) {
    const isInsertion = r.mark.type === schema.marks.insertion
    if (isInsertion === accept) tr.removeMark(r.from, r.to, r.mark)
    else removals.push([r.from, r.to])
  }
  removals.sort((a, b) => b[0] - a[0]).forEach(([a, b]) => tr.delete(a, b))
  return true
}

// Suggestions in document order, with consecutive ranges of the same id merged.
export function collectSuggestions(doc: PMNode): Suggestion[] {
  const out: Suggestion[] = []
  const byKey = new Map<string, Suggestion>()
  doc.descendants((node, pos) => {
    if (!node.isInline) return true
    for (const mark of node.marks) {
      const kind = mark.type.name
      if (kind !== 'insertion' && kind !== 'deletion') continue
      const key = `${kind}:${mark.attrs.id}`
      const text = node.isText ? node.text! : node.type.name === 'equation' ? '∑' : '▫'
      let s = byKey.get(key)
      if (!s) {
        s = {
          id: mark.attrs.id,
          kind,
          author: mark.attrs.author,
          authorId: mark.attrs.authorId,
          color: mark.attrs.color,
          time: mark.attrs.time,
          from: pos,
          to: pos + node.nodeSize,
          text: '',
        }
        byKey.set(key, s)
        out.push(s)
      }
      s.to = Math.max(s.to, pos + node.nodeSize)
      s.text += text
    }
    return false
  })
  return out
}
