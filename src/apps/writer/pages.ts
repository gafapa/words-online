// Print layout: splits the continuous editor into pages by inserting spacer
// widgets between blocks. Each spacer draws the end of a page (footnotes and
// footer), the gap between sheets and the next page's header. Blocks are not
// split across pages; a block taller than a page simply overflows.

import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

export const PAGE_GAP_PX = 24
const MM_TO_PX = 96 / 25.4
// Containers whose children may be placed on different pages.
const SPLITTABLE = new Set(['bulletList', 'orderedList', 'taskList', 'blockquote'])

export interface PageGeometry {
  width: number // px
  height: number
  margins: { top: number; right: number; bottom: number; left: number }
}

export interface PageChrome {
  // HTML for header/footer with page fields resolved.
  header(page: number, total: number): string
  footer(page: number, total: number): string
}

interface PageBreakInfo {
  pos: number // document position where the new page starts
  page: number // index of the page that ends here (0-based)
  fill: number // blank space left at the bottom of the page, px
  indent: number // horizontal offset of the insertion point inside the content box
  notes: string[] // footnotes of the page that ends here
  firstNote: number // number of the first footnote on that page
}

export interface Layout {
  breaks: PageBreakInfo[]
  pages: number
  tailFill: number
  tailNotes: string[]
  tailFirstNote: number
}

export const paginationKey = new PluginKey<{ layout: Layout; decorations: DecorationSet }>('pagination')

export function mmToPx(mm: number): number {
  return mm * MM_TO_PX
}

export interface PaginationOptions {
  getGeometry: () => PageGeometry
  chrome: PageChrome
  onLayout: (layout: Layout) => void
}

const EMPTY_LAYOUT: Layout = { breaks: [], pages: 1, tailFill: 0, tailNotes: [], tailFirstNote: 1 }

export const Pagination = Extension.create<PaginationOptions>({
  name: 'pagination',
  addOptions: () => ({
    getGeometry: () => ({ width: 794, height: 1123, margins: { top: 94, right: 94, bottom: 94, left: 94 } }),
    chrome: { header: () => '', footer: () => '' },
    onLayout: () => {},
  }),
  addProseMirrorPlugins() {
    const options = this.options
    return [
      new Plugin({
        key: paginationKey,
        state: {
          init: () => ({ layout: EMPTY_LAYOUT, decorations: DecorationSet.empty }),
          apply(tr, value, _old, state) {
            const layout = tr.getMeta(paginationKey) as Layout | undefined
            if (layout) return { layout, decorations: buildDecorations(state, layout, options) }
            return { layout: value.layout, decorations: value.decorations.map(tr.mapping, tr.doc) }
          },
        },
        props: {
          decorations: (state) => paginationKey.getState(state)?.decorations,
        },
        view: (view) => new PaginationView(view, options),
      }),
    ]
  },
})

const views = new WeakMap<EditorView, PaginationView>()
// Bumped when geometry or header/footer content changes, so spacer widgets re-render.
let chromeVersion = 0

// Forces a new layout pass (e.g. after page setup or header changes).
export function relayout(view: EditorView): void {
  const pagination = views.get(view)
  if (!pagination) return
  pagination.reset()
  chromeVersion++
  // Geometry or chrome changed: rebuild decorations with the current layout first.
  const layout = paginationKey.getState(view.state)?.layout
  if (layout) view.dispatch(view.state.tr.setMeta(paginationKey, { ...layout }).setMeta('addToHistory', false))
  pagination.schedule()
}

class PaginationView {
  private frame = 0
  private observer: ResizeObserver
  private noteHeights = new Map<string, number>()
  private measurer: HTMLElement

  constructor(
    private view: EditorView,
    private options: PaginationOptions,
  ) {
    this.measurer = document.createElement('div')
    this.measurer.className = 'page-notes measure'
    // Measure inside the paper so notes inherit the document fonts.
    ;(view.dom.parentElement ?? document.body).append(this.measurer)
    // Images load asynchronously and fonts may swap: re-measure on size changes.
    this.observer = new ResizeObserver(() => this.schedule())
    this.observer.observe(view.dom)
    views.set(view, this)
    this.schedule()
  }

  reset() {
    this.noteHeights.clear()
  }

  update(view: EditorView, prev: EditorState) {
    this.view = view
    if (!prev.doc.eq(view.state.doc)) this.schedule()
  }

  schedule() {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.measure())
  }

  destroy() {
    cancelAnimationFrame(this.frame)
    this.observer.disconnect()
    this.measurer.remove()
  }

  private measure() {
    const { view } = this
    if (!view.dom.isConnected) return
    const geo = this.options.getGeometry()
    const pageStride = geo.height + PAGE_GAP_PX
    const contentTop = (page: number) => page * pageStride + geo.margins.top
    const pageLimit = (page: number) => page * pageStride + geo.height - geo.margins.bottom

    // Existing spacers shift everything below them; remove them from measurements.
    const spacers = [...view.dom.querySelectorAll<HTMLElement>(':scope .page-spacer')]
    const spacerAt = spacers.map((el) => ({ top: offsetWithin(el, view.dom).top, height: el.offsetHeight }))
    const naturalTop = (top: number) =>
      top - spacerAt.reduce((sum, s) => (s.top < top ? sum + s.height : sum), 0)

    const units = collectUnits(view)
    const breaks: PageBreakInfo[] = []
    let offset = 0
    let page = 0
    let pageNotes: string[] = []
    let notesHeight = 0
    let noteNumber = 1
    let firstNote = 1
    let forceBreak = false
    // Outer bottom (including margin) of the previous unit: where a spacer would start.
    let prevBottom: number | null = null

    for (const unit of units) {
      const top = contentTop(0) + naturalTop(unit.top) + offset
      const bottom = top + unit.height
      const unitNotes = unit.notes
      const unitNotesHeight = unitNotes.reduce((sum, n) => sum + this.noteHeight(n, geo), 0)
      const separator = pageNotes.length || unitNotes.length ? 16 : 0
      const limit = pageLimit(page) - notesHeight - unitNotesHeight - separator
      const atPageTop = top <= contentTop(page) + 1

      // A page break marker never overflows by itself: it ends the page it is on.
      if (forceBreak || (bottom > limit && !atPageTop && !unit.pageBreak)) {
        // The first block of a page loses its top margin (CSS), so it starts exactly at the content top.
        const start = prevBottom ?? top
        breaks.push({
          pos: unit.pos,
          page,
          fill: Math.max(0, pageLimit(page) - notesHeight - (pageNotes.length ? 16 : 0) - start),
          indent: unit.left,
          notes: pageNotes,
          firstNote,
        })
        offset += contentTop(page + 1) - top
        page++
        pageNotes = []
        notesHeight = 0
        firstNote = noteNumber
      }
      forceBreak = unit.pageBreak
      prevBottom = contentTop(0) + naturalTop(unit.top) + offset + unit.height
      pageNotes.push(...unitNotes)
      notesHeight += unitNotesHeight
      noteNumber += unitNotes.length
    }

    const endTop = contentTop(0) + naturalTop(view.dom.scrollHeight) + offset
    const layout: Layout = {
      breaks,
      pages: page + 1,
      tailFill: Math.max(0, pageLimit(page) - notesHeight - (pageNotes.length ? 16 : 0) - endTop),
      tailNotes: pageNotes,
      tailFirstNote: firstNote,
    }
    const current = paginationKey.getState(view.state)?.layout
    if (!current || !sameLayout(current, layout)) {
      view.dispatch(view.state.tr.setMeta(paginationKey, layout).setMeta('addToHistory', false))
    }
    this.options.onLayout(layout)
  }

  private noteHeight(text: string, geo: PageGeometry): number {
    const key = `${geo.width}|${text}`
    let h = this.noteHeights.get(key)
    if (h === undefined) {
      this.measurer.style.width = `${geo.width - geo.margins.left - geo.margins.right}px`
      this.measurer.innerHTML = `<div class="page-note"><sup>0</sup> ${escapeHtml(text)}</div>`
      h = this.measurer.offsetHeight
      this.noteHeights.set(key, h)
    }
    return h
  }
}

interface Unit {
  pos: number
  top: number
  height: number
  left: number
  notes: string[]
  pageBreak: boolean
}

// Top-level blocks, descending into lists and quotes so they can span pages.
function collectUnits(view: EditorView): Unit[] {
  const units: Unit[] = []
  const visit = (node: PMNode, pos: number) => {
    if (SPLITTABLE.has(node.type.name) && node.childCount > 1) {
      node.forEach((child, offset) => visit(child, pos + 1 + offset))
      return
    }
    const dom = view.nodeDOM(pos)
    if (!(dom instanceof HTMLElement)) return
    const { top, left } = offsetWithin(dom, view.dom)
    const notes: string[] = []
    node.descendants((n) => {
      if (n.type.name === 'footnote') notes.push(String(n.attrs.content ?? ''))
    })
    const style = getComputedStyle(dom)
    const marginBottom = parseFloat(style.marginBottom) || 0
    units.push({
      pos,
      top,
      height: dom.offsetHeight + marginBottom,
      left: left - (parseFloat(getComputedStyle(view.dom).paddingLeft) || 0),
      notes,
      pageBreak: node.type.name === 'pageBreak',
    })
  }
  view.state.doc.forEach((node, offset) => visit(node, offset))
  return units
}

function offsetWithin(el: HTMLElement, ancestor: HTMLElement): { top: number; left: number } {
  let top = 0
  let left = 0
  let current: HTMLElement | null = el
  while (current && current !== ancestor) {
    top += current.offsetTop
    left += current.offsetLeft
    current = current.offsetParent as HTMLElement | null
  }
  return { top, left }
}

function sameLayout(a: Layout, b: Layout): boolean {
  if (a.pages !== b.pages || a.breaks.length !== b.breaks.length) return false
  if (Math.abs(a.tailFill - b.tailFill) > 1 || a.tailNotes.join('\u0000') !== b.tailNotes.join('\u0000')) return false
  return a.breaks.every((x, i) => {
    const y = b.breaks[i]
    return x.pos === y.pos && Math.abs(x.fill - y.fill) <= 1 && x.indent === y.indent && x.notes.join('\u0000') === y.notes.join('\u0000')
  })
}

function buildDecorations(state: EditorState, layout: Layout, options: PaginationOptions): DecorationSet {
  const geo = options.getGeometry()
  const decorations = layout.breaks
    .filter((b) => b.pos <= state.doc.content.size)
    .map((b) =>
      Decoration.widget(b.pos, () => spacerElement(b, layout.pages, geo, options.chrome), {
        side: -1,
        ignoreSelection: true,
        key: `page-${chromeVersion}-${b.page}-${Math.round(b.fill)}-${b.indent}-${layout.pages}-${b.firstNote}-${b.notes.join('|')}`,
      }),
    )
  return DecorationSet.create(state.doc, decorations)
}

function spacerElement(b: PageBreakInfo, total: number, geo: PageGeometry, chrome: PageChrome): HTMLElement {
  const el = document.createElement('div')
  el.className = 'page-spacer'
  el.contentEditable = 'false'
  el.style.marginLeft = `${-(geo.margins.left + b.indent)}px`
  el.style.width = `${geo.width}px`
  el.innerHTML =
    `<div class="page-fill" style="--fill:${b.fill}px"></div>` +
    notesHtml(b.notes, b.firstNote) +
    `<div class="page-footer" style="height:${geo.margins.bottom}px;padding:0 ${geo.margins.right}px 0 ${geo.margins.left}px">${chrome.footer(b.page + 1, total)}</div>` +
    `<div class="page-gap" style="height:${PAGE_GAP_PX}px"></div>` +
    `<div class="page-header" style="height:${geo.margins.top}px;padding:0 ${geo.margins.right}px 0 ${geo.margins.left}px">${chrome.header(b.page + 2, total)}</div>`
  // Notes live inside the page's content box.
  el.querySelectorAll<HTMLElement>('.page-notes').forEach((n) => (n.style.padding = `0 ${geo.margins.right}px 0 ${geo.margins.left}px`))
  return el
}

export function notesHtml(notes: string[], first: number): string {
  if (!notes.length) return ''
  return (
    '<div class="page-notes"><hr />' +
    notes.map((n, i) => `<div class="page-note"><sup>${first + i}</sup> ${escapeHtml(n)}</div>`).join('') +
    '</div>'
  )
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
