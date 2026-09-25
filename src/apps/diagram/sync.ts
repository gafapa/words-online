// State-based collaboration for draw.io over Yjs.
//
// Yjs holds the diagram as pages → cells → fields (the JSON draw.io produces
// with getJsonForCell), so concurrent edits merge per field and every replica
// converges. draw.io's own diff/patch machinery is the bridge:
// - local edits: diffPages(shadow, current) tells which pages/cells/fields
//   changed; only those are written to Yjs;
// - remote edits: Yjs events are turned into a draw.io patch and applied with
//   file.patch, which keeps the local selection and undo history.

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Y from 'yjs'
import type { DrawioWindow, EditorUi } from './drawio'

type CellJson = Record<string, any> & { id: string }
type PageMap = Y.Map<any> // name, previous, viewBox, cells: Y.Map<Y.Map<any>>

const DIFF_INSERT = 'i'
const DIFF_REMOVE = 'r'
const DIFF_UPDATE = 'u'

// Fixed ids so replicas that start an empty diagram at the same time agree.
export const DEFAULT_XML =
  '<mxfile><diagram id="page-1" name="Page-1"><mxGraphModel><root>' +
  '<mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>'

// A base holding a Visio file waiting to be converted by draw.io (base64).
export const VSDX_PREFIX = 'vsdx:'

export class DiagramSync {
  readonly pages: Y.Map<PageMap>
  private shadow: any[] = []
  private applying = false

  constructor(
    private readonly doc: Y.Doc,
    private readonly ui: EditorUi,
    private readonly win: DrawioWindow,
  ) {
    this.pages = doc.getMap<PageMap>('diagram-pages')
  }

  // Initial mxfile XML for the editor: shared state, else the stored base (import), else empty.
  static initialXml(doc: Y.Doc, win: DrawioWindow): string {
    const pages = doc.getMap<PageMap>('diagram-pages')
    if (pages.size) return xmlFromState(pages, win)
    const base = doc.getMap('diagram').get('base')
    return typeof base === 'string' && !base.startsWith(VSDX_PREFIX) ? base : DEFAULT_XML
  }

  static setBase(doc: Y.Doc, xml: string): void {
    doc.getMap('diagram').set('base', xml)
  }

  // Base64 of an imported Visio file not converted yet (only while the diagram is empty).
  static pendingVisio(doc: Y.Doc): string | null {
    const base = doc.getMap('diagram').get('base')
    if (doc.getMap('diagram-pages').size || typeof base !== 'string' || !base.startsWith(VSDX_PREFIX)) return null
    return base.slice(VSDX_PREFIX.length)
  }

  // The shared pages now hold the diagram; the base is no longer needed.
  static clearBase(doc: Y.Doc): void {
    doc.getMap('diagram').delete('base')
  }

  start(): void {
    const { ui } = this
    // Seeding is idempotent (ids come from the file), so concurrent seeders agree.
    if (!this.pages.size) this.doc.transact(() => this.applyDiff(ui.diffPages([], ui.pages)), this)
    this.shadow = ui.clonePages(ui.pages)

    ui.editor.graph.model.addListener(this.win.mxEvent.CHANGE, () => {
      if (!this.applying) this.pushLocal()
    })
    this.pages.observeDeep((events, tr) => {
      if (tr.origin !== this) this.applyRemote(events)
    })
  }

  // ---------- Local → Yjs ----------

  private pushLocal(): void {
    const { ui } = this
    const diff = ui.diffPages(this.shadow, ui.pages)
    this.shadow = ui.clonePages(ui.pages)
    if (Object.keys(diff).length) this.doc.transact(() => this.applyDiff(diff), this)
  }

  private applyDiff(diff: any): void {
    for (const id of diff[DIFF_REMOVE] ?? []) this.pages.delete(id)

    for (const inserted of diff[DIFF_INSERT] ?? []) {
      const page = new Y.Map<any>()
      const cells = new Y.Map<Y.Map<any>>()
      const parsed = this.ui.getPagesForXml(`<mxfile>${inserted.data}</mxfile>`)[0]
      page.set('name', parsed?.getName() ?? '')
      page.set('previous', inserted.previous ?? '')
      if (parsed) {
        this.ui.updatePageRoot(parsed)
        for (const json of cellsOf(this.ui, parsed.root)) cells.set(json.id, fieldsMap(json))
      }
      page.set('cells', cells)
      this.pages.set(inserted.id, page)
    }

    for (const [pageId, pageDiff] of Object.entries<any>(diff[DIFF_UPDATE] ?? {})) {
      const page = this.pages.get(pageId)
      if (!page) continue
      for (const key of ['name', 'previous', 'viewBox']) if (key in pageDiff) page.set(key, pageDiff[key])
      const cellsDiff = pageDiff.cells
      if (!cellsDiff) continue
      const cells = page.get('cells') as Y.Map<Y.Map<any>>
      for (const id of cellsDiff[DIFF_REMOVE] ?? []) cells.delete(id)
      for (const json of cellsDiff[DIFF_INSERT] ?? []) cells.set(json.id, fieldsMap(json))
      for (const [id, fields] of Object.entries<any>(cellsDiff[DIFF_UPDATE] ?? {})) {
        const cell = cells.get(id)
        if (!cell) continue
        for (const [key, value] of Object.entries(fields)) {
          if (value === null || value === undefined) cell.delete(key)
          else cell.set(key, value)
          // A cell label is either a plain value or an XML user object.
          if (key === 'value') cell.delete('xmlValue')
          if (key === 'xmlValue') cell.delete('value')
        }
      }
    }
  }

  // ---------- Yjs → draw.io ----------

  private applyRemote(events: Y.YEvent<any>[]): void {
    const patch: any = {}
    const update = (pageId: string) => ((patch[DIFF_UPDATE] ??= {})[pageId] ??= {})
    const cellsPatch = (pageId: string) => (update(pageId).cells ??= {})
    const insertedPages = new Set<string>()
    const insertedCells = new Set<string>()

    for (const event of events) {
      const path = event.path as string[]
      if (event.target === this.pages) {
        for (const [key, change] of event.changes.keys) {
          if (change.action === 'delete') (patch[DIFF_REMOVE] ??= []).push(key)
          else {
            const page = this.pages.get(key)!
            insertedPages.add(key)
            ;(patch[DIFF_INSERT] ??= []).push({ id: key, data: pageXml(key, page, this.win), previous: page.get('previous') ?? '' })
            if (change.action === 'update') (patch[DIFF_REMOVE] ??= []).push(key)
          }
        }
      } else if (path.length === 1 && !insertedPages.has(path[0])) {
        const page = this.pages.get(path[0])
        for (const key of (event as Y.YMapEvent<any>).keysChanged) if (key !== 'cells') update(path[0])[key] = page?.get(key) ?? ''
      } else if (path.length === 2 && !insertedPages.has(path[0])) {
        const cells = event.target as Y.Map<Y.Map<any>>
        for (const [id, change] of event.changes.keys) {
          if (change.action !== 'add') (cellsPatch(path[0])[DIFF_REMOVE] ??= []).push(id)
          if (change.action !== 'delete') {
            insertedCells.add(`${path[0]}:${id}`)
            ;(cellsPatch(path[0])[DIFF_INSERT] ??= []).push(cells.get(id)!.toJSON())
          }
        }
      } else if (path.length === 3 && !insertedPages.has(path[0]) && !insertedCells.has(`${path[0]}:${path[2]}`)) {
        const cell = event.target as Y.Map<any>
        const fields = ((cellsPatch(path[0])[DIFF_UPDATE] ??= {})[path[2]] ??= {})
        for (const key of (event as Y.YMapEvent<any>).keysChanged) fields[key] = cell.get(key) ?? emptyValue(key)
      }
    }
    if (!Object.keys(patch).length) return

    const file = this.ui.getCurrentFile()
    this.applying = true
    try {
      file.patch([patch], null, false)
    } finally {
      this.applying = false
    }
    this.shadow = this.ui.clonePages(this.ui.pages)
  }
}

// Removal marker per field, as used by draw.io diffs.
function emptyValue(key: string): unknown {
  return ['parent', 'source', 'target', 'previous'].includes(key) ? '' : null
}

function fieldsMap(json: CellJson): Y.Map<any> {
  const map = new Y.Map<any>()
  for (const [key, value] of Object.entries(json)) if (value !== undefined && value !== null) map.set(key, value)
  return map
}

// All cells below `root` (included) as JSON, in document order with `previous`.
function cellsOf(ui: EditorUi, root: any): CellJson[] {
  const out: CellJson[] = []
  const visit = (cell: any, previous: any) => {
    out.push(ui.getJsonForCell(cell, previous))
    let prev = null
    for (let i = 0; i < cell.getChildCount(); i++) {
      const child = cell.getChildAt(i)
      visit(child, prev)
      prev = child
    }
  }
  if (root) visit(root, null)
  return out
}

// ---------- Materializing XML from the shared state ----------

function xmlFromState(pages: Y.Map<PageMap>, win: DrawioWindow): string {
  return `<mxfile>${orderByPrevious([...pages.keys()], (id) => pages.get(id)?.get('previous'))
    .map((id) => pageXml(id, pages.get(id)!, win))
    .join('')}</mxfile>`
}

function pageXml(id: string, page: PageMap, win: DrawioWindow): string {
  const cellsMap = page.get('cells') as Y.Map<Y.Map<any>> | undefined
  const json: CellJson[] = cellsMap ? [...cellsMap.values()].map((c) => c.toJSON() as CellJson) : []
  const codec = new win.mxCodec()
  // getCellForJson only needs a codec and EditorUi's cell property helpers.
  const factory = Object.assign(Object.create(win.EditorUi.prototype), { codec })
  const cells = new Map<string, any>()
  for (const j of json) cells.set(j.id, win.EditorUi.prototype.getCellForJson.call(factory, j))

  // Children in sibling order, following `previous` links.
  const byParent = new Map<string, CellJson[]>()
  let rootJson: CellJson | undefined
  for (const j of json) {
    if (!j.parent || !cells.has(j.parent)) {
      rootJson ??= j
      continue
    }
    const list = byParent.get(j.parent) ?? []
    list.push(j)
    byParent.set(j.parent, list)
  }
  const root = rootJson ? cells.get(rootJson.id) : new win.mxCell()
  if (!rootJson) root.setId('0')
  for (const [parentId, children] of byParent) {
    const parent = cells.get(parentId)
    for (const childId of orderByPrevious(children.map((c) => c.id), (cid) => children.find((c) => c.id === cid)?.previous)) {
      parent.insert(cells.get(childId))
    }
  }
  for (const j of json) {
    const cell = cells.get(j.id)
    if (j.source && cells.has(j.source)) cells.get(j.source).insertEdge(cell, true)
    if (j.target && cells.has(j.target)) cells.get(j.target).insertEdge(cell, false)
  }
  const model = new win.mxGraphModel(root)
  const node = codec.encode(model)
  const viewBox = page.get('viewBox')
  return (
    `<diagram id="${escapeAttr(id)}" name="${escapeAttr(page.get('name') ?? '')}"${viewBox ? ` viewBox="${escapeAttr(viewBox)}"` : ''}>` +
    `${win.mxUtils.getXml(node)}</diagram>`
  )
}

// Orders ids by a `previous` pointer chain; ties and orphans are resolved deterministically.
function orderByPrevious(ids: string[], previousOf: (id: string) => string | undefined): string[] {
  const set = new Set(ids)
  const after = new Map<string, string[]>()
  for (const id of ids) {
    const prev = previousOf(id)
    const key = prev && set.has(prev) && prev !== id ? prev : ''
    const list = after.get(key) ?? []
    list.push(id)
    after.set(key, list)
  }
  const out: string[] = []
  const seen = new Set<string>()
  const walk = (key: string) => {
    for (const id of (after.get(key) ?? []).sort()) {
      if (seen.has(id)) continue
      seen.add(id)
      out.push(id)
      walk(id)
    }
  }
  walk('')
  // Cycles (concurrent reorders) leave some ids unreached: append them in id order.
  for (const id of [...ids].sort()) if (!seen.has(id)) {
    seen.add(id)
    out.push(id)
    walk(id)
  }
  return out
}

function escapeAttr(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
