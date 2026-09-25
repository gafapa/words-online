// Diagram app: our own editor on maxGraph inside the common shell, synced over
// Yjs. Files are compatible with draw.io (.drawio / mxGraphModel XML).

import {
  Cell,
  CircleLayout,
  CompactTreeLayout,
  FastOrganicLayout,
  Geometry,
  HierarchicalLayout,
  InternalEvent,
  UndoManager,
  type EventObject,
  type GraphLayout,
  type UndoableEdit,
} from '@maxgraph/core'
import {
  Grid3x3,
  Maximize,
  Minus,
  PaintBucket,
  PanelLeft,
  PanelRight,
  Plus,
  Redo2,
  SendToBack,
  BringToFront,
  Trash2,
  Undo2,
  Pencil,
  type IconNode,
} from 'lucide'
import { appInfo } from '../registry'
import { homePath, newDocPath } from '../../core/router'
import type { Session } from '../../core/session'
import { setupChrome } from '../../ui/chrome'
import { renderShell } from '../../ui/shell'
import { colorPalette, createMenuBar, el, icon, openPopover, promptText, showContextMenu, showDialog, toast, type MenuEntry } from '../../ui/widgets'
import { renderSvg, svgToPng, svgToString } from './export'
import { FormatPanel } from './format'
import {
  buildCells,
  cellsToRecords,
  createGraph,
  isTyping,
  setStyleKey,
  styleFromString,
  styleToString,
} from './graph'
import type { CellRecord } from './model'
import { PALETTE } from './palette'
import { DiagramPresence } from './presence'
import { registerShapes } from './shapes'
import { ShapeSidebar } from './sidebar'
import { DiagramSync } from './sync'

export const DIAGRAM_ACCEPT = '.drawio,.xml'

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
const mod = (k: string) => (isMac ? `⌘${k}` : `Ctrl+${k}`)
const ZOOMS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]
const MIN_ZOOM = 0.1
const MAX_ZOOM = 8
const CLIPBOARD_PREFIX = 'words-online-diagram:'
const MAX_IMAGE_BYTES = 2 * 1024 * 1024

const formats = () => import('./formats/drawio')

export function mountDiagram(session: Session, root: HTMLElement): void {
  const info = appInfo('diagram')
  const shell = renderShell(info, root)
  setupChrome(session, info.untitled)
  registerShapes()

  const canvas = el('div', { class: 'diagram-canvas grid' })
  const body = el('div', { class: 'diagram-body' })
  const printArea = el('div', { class: 'diagram-print' })
  const fileInput = el('input', { type: 'file', accept: DIAGRAM_ACCEPT, hidden: true })
  document.body.append(printArea, fileInput)

  const graph = createGraph(canvas)
  const model = graph.getDataModel()
  const view = graph.view
  const sync = new DiagramSync(session.doc, graph)
  const meta = session.doc.getMap<unknown>('meta')
  const title = () => String(meta.get('title') || info.untitled).replace(/[\\/:*?"<>|]+/g, '_')

  // ---------- Undo ----------

  const undoManager = new UndoManager()
  model.addListener(InternalEvent.UNDO, (_sender: unknown, evt: EventObject) => {
    // Remote changes never enter the local history.
    if (!sync.applying) undoManager.undoableEditHappened(evt.getProperty('edit') as UndoableEdit)
  })
  const selectChanged = (_sender: unknown, evt: EventObject) => {
    const edit = evt.getProperty('edit') as UndoableEdit
    const cells = new Set<Cell>()
    for (const change of edit.changes as Record<string, unknown>[]) {
      const cell = (change.cell ?? change.child) as Cell | undefined
      if (cell && model.getCell(cell.getId()!) === cell) cells.add(cell)
    }
    graph.setSelectionCells([...cells])
  }
  undoManager.addListener(InternalEvent.UNDO, selectChanged)
  undoManager.addListener(InternalEvent.REDO, selectChanged)
  const undo = () => graph.isEditing() || undoManager.undo()
  const redo = () => graph.isEditing() || undoManager.redo()

  // ---------- View: zoom, pan, grid ----------

  let gridVisible = localStorage.getItem('diagram-grid') !== '0'
  const updateGrid = () => {
    const s = view.scale
    const size = graph.gridSize * s
    canvas.classList.toggle('grid', gridVisible && size >= 4)
    canvas.style.setProperty('--grid', `${size}px`)
    canvas.style.setProperty('--grid-major', `${size * 4}px`)
    canvas.style.backgroundPosition = `${view.translate.x * s}px ${view.translate.y * s}px`
    zoomLabel.textContent = `${Math.round(s * 100)}%`
  }
  const setGridVisible = (on: boolean) => {
    gridVisible = on
    localStorage.setItem('diagram-grid', on ? '1' : '0')
    updateGrid()
  }

  const zoomAt = (scale: number, clientX?: number, clientY?: number) => {
    const s = view.scale
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale))
    const rect = canvas.getBoundingClientRect()
    const px = clientX === undefined ? rect.width / 2 : clientX - rect.left
    const py = clientY === undefined ? rect.height / 2 : clientY - rect.top
    const t = view.translate
    view.scaleAndTranslate(next, px / next - (px / s - t.x), py / next - (py / s - t.y))
  }
  const zoomStep = (dir: 1 | -1) => {
    const s = view.scale
    const next = dir > 0 ? (ZOOMS.find((z) => z > s + 0.001) ?? s * 1.25) : ([...ZOOMS].reverse().find((z) => z < s - 0.001) ?? s / 1.25)
    zoomAt(next)
  }
  const fit = () => {
    const b = graph.getGraphBounds()
    const s = view.scale
    const t = view.translate
    const rect = canvas.getBoundingClientRect()
    if (!b.width || !b.height) {
      view.scaleAndTranslate(1, 20, 20)
      return
    }
    const gx = b.x / s - t.x
    const gy = b.y / s - t.y
    const gw = b.width / s
    const gh = b.height / s
    const margin = 32
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((rect.width - 2 * margin) / gw, (rect.height - 2 * margin) / gh, 1)))
    view.scaleAndTranslate(next, (rect.width / next - gw) / 2 - gx, (rect.height / next - gh) / 2 - gy)
  }
  const actualSize = () => zoomAt(1)

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) zoomAt(view.scale * Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY)
      else {
        const s = view.scale
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY
        view.setTranslate(view.translate.x - dx / s, view.translate.y - dy / s)
      }
    },
    { passive: false },
  )
  for (const event of [InternalEvent.SCALE, InternalEvent.TRANSLATE, InternalEvent.SCALE_AND_TRANSLATE]) view.addListener(event, updateGrid)

  // ---------- Commands ----------

  const selection = () => graph.getSelectionCells()
  const hasSelection = () => !graph.isSelectionEmpty()
  const vertices = () => selection().filter((c) => c.isVertex())

  const inBatch = <T>(fn: () => T): T => {
    model.beginUpdate()
    try {
      return fn()
    } finally {
      model.endUpdate()
    }
  }

  const insertCells = (cells: Cell[], x: number, y: number, target: Cell | null) => {
    // maxGraph's moveCells drops parentless edges with relative geometry: give them a scratch parent.
    const scratch = new Cell()
    cells.forEach((cell) => cell.getParent() || scratch.insert(cell))
    const inserted = inBatch(() => graph.importCells(cells, x, y, target ?? graph.getDefaultParent()))
    graph.setSelectionCells(inserted)
    canvas.focus()
  }

  // Inserts at the center of the view, shifted if something is already there.
  const insertAtCenter = (cells: Cell[]) => {
    const rect = canvas.getBoundingClientRect()
    const s = view.scale
    const t = view.translate
    const geo = cells[0].getGeometry() ?? new Geometry(0, 0, 0, 0)
    let x = graph.snap(rect.width / 2 / s - t.x - geo.width / 2)
    let y = graph.snap(rect.height / 2 / s - t.y - geo.height / 2)
    const occupied = (px: number, py: number) =>
      graph.getChildVertices(graph.getDefaultParent()).some((c) => {
        const g = c.getGeometry()
        return g && Math.abs(g.x - px) < 1 && Math.abs(g.y - py) < 1
      })
    while (occupied(x, y)) {
      x += graph.gridSize * 2
      y += graph.gridSize * 2
    }
    insertCells(cells, x, y, null)
  }

  const remove = () => {
    if (!hasSelection()) return
    inBatch(() => graph.removeCells(selection(), true))
  }
  const duplicate = () => {
    if (!hasSelection()) return
    const cells = graph.moveCells(graph.getSelectionCells(), graph.gridSize, graph.gridSize, true)
    graph.setSelectionCells(cells)
  }
  const selectAll = () => graph.selectAll(graph.getDefaultParent(), true)
  const selectVertices = () => graph.setSelectionCells(graph.getChildVertices(graph.getDefaultParent()))
  const selectEdges = () => graph.setSelectionCells(graph.getChildEdges(graph.getDefaultParent()))
  const toFront = () => hasSelection() && graph.orderCells(false, selection())
  const toBack = () => hasSelection() && graph.orderCells(true, selection())
  const group = () => {
    const cells = selection()
    if (cells.length < 2) return
    const groupCell = inBatch(() => graph.groupCells(null as unknown as Cell, 0, cells))
    graph.setSelectionCell(groupCell)
  }
  const ungroup = () => {
    if (!hasSelection()) return
    graph.setSelectionCells(inBatch(() => graph.ungroupCells(selection())))
  }
  graph.createGroupCell = () => {
    const cell = new Cell('', new Geometry(), styleFromString('group;'))
    cell.setVertex(true)
    cell.setConnectable(false)
    return cell
  }
  const align = (where: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => graph.alignCells(where, vertices())
  const distribute = (horizontal: boolean) => {
    const cells = vertices()
      .map((cell) => ({ cell, geo: cell.getGeometry()! }))
      .filter((c) => c.geo)
      .sort((a, b) => (horizontal ? a.geo.getCenterX() - b.geo.getCenterX() : a.geo.getCenterY() - b.geo.getCenterY()))
    if (cells.length < 3) return
    const first = horizontal ? cells[0].geo.getCenterX() : cells[0].geo.getCenterY()
    const last = horizontal ? cells.at(-1)!.geo.getCenterX() : cells.at(-1)!.geo.getCenterY()
    const step = (last - first) / (cells.length - 1)
    inBatch(() =>
      cells.forEach(({ cell, geo }, i) => {
        const g = geo.clone()
        if (horizontal) g.x = Math.round(first + step * i - g.width / 2)
        else g.y = Math.round(first + step * i - g.height / 2)
        model.setGeometry(cell, g)
      }),
    )
  }
  const flip = (key: 'flipH' | 'flipV') => {
    const cells = vertices()
    if (!cells.length) return
    const on = String((graph.getCellStyle(cells[0]) as Record<string, unknown>)[key] ?? '') === '1' || (graph.getCellStyle(cells[0]) as Record<string, unknown>)[key] === true
    setStyleKey(graph, cells, key, on ? null : 1)
  }
  const rotate = () => {
    const cells = vertices()
    if (!cells.length) return
    inBatch(() =>
      cells.forEach((cell) => {
        const current = Number((graph.getCellStyle(cell) as Record<string, unknown>).rotation ?? 0)
        setStyleKey(graph, [cell], 'rotation', (current + 90) % 360 || null)
      }),
    )
  }
  const editLabel = () => {
    const cell = graph.getSelectionCell()
    if (cell) graph.startEditingAtCell(cell)
  }
  const editStyle = async () => {
    const cells = selection()
    if (!cells.length) return
    const value = await promptText('Edit style', 'Style (draw.io format)', styleToString(cells[0].getStyle()), true)
    if (value === null) return
    const style = styleFromString(value.replace(/\s*\n\s*/g, ''))
    inBatch(() => cells.forEach((cell) => model.setStyle(cell, { ...style })))
  }
  const setFill = (color: string | null) => setStyleKey(graph, vertices(), 'fillColor', color ?? 'none')
  const setStroke = (color: string | null) => setStyleKey(graph, selection(), 'strokeColor', color ?? 'none')

  // Tree layouts start from the selected shape, else from the root they find.
  const layout = (make: () => GraphLayout) => {
    const parent = graph.getDefaultParent()
    const selected = graph.getSelectionCell()
    const rootCell = selected?.isVertex() ? selected : undefined
    const instance = make() as GraphLayout & { execute(parent: Cell, root?: Cell): void }
    inBatch(() => instance.execute(parent, rootCell))
    fit()
  }
  const treeLayout = (horizontal: boolean) => () => {
    const l = new CompactTreeLayout(graph, horizontal)
    l.levelDistance = 40
    l.nodeDistance = 20
    return l
  }

  // ---------- Clipboard ----------

  let pasteCount = 0
  let lastClipboard = ''

  const copyText = (): string => {
    const cells = graph.getExportableCells(graph.getSelectionCells())
    if (!cells.length) return ''
    return CLIPBOARD_PREFIX + JSON.stringify(cellsToRecords(cells))
  }
  const pasteRecords = (records: CellRecord[], offset: number) => {
    const cells = buildCells(records)
    if (!cells.length) return
    insertCells(cells, offset, offset, null)
  }
  const pasteText = async (text: string) => {
    if (text.startsWith(CLIPBOARD_PREFIX)) {
      pasteCount = text === lastClipboard ? pasteCount + 1 : 1
      lastClipboard = text
      pasteRecords(JSON.parse(text.slice(CLIPBOARD_PREFIX.length)) as CellRecord[], pasteCount * graph.gridSize)
      return
    }
    if (/<mxGraphModel|<mxfile/.test(text)) {
      try {
        const { parseDrawio } = await formats()
        const [page] = await parseDrawio(text)
        const rootId = page.cells.find((c) => !c.parent)?.id
        const layers = new Set(page.cells.filter((c) => c.parent === rootId).map((c) => c.id))
        const records = page.cells
          .filter((c) => c.id !== rootId && !layers.has(c.id))
          .map((c) => (c.parent && layers.has(c.parent) ? { ...c, parent: undefined, previous: undefined } : c))
        pasteRecords(records, 0)
      } catch (err) {
        toast(`Could not paste: ${(err as Error).message}`)
      }
      return
    }
    const trimmed = text.trim()
    if (!trimmed) return
    const cell = new Cell(escapeHtml(trimmed).replace(/\n/g, '<br>'), new Geometry(0, 0, 120, 40), styleFromString('text;html=1;whiteSpace=wrap;align=center;verticalAlign=middle;'))
    cell.setVertex(true)
    insertAtCenter([cell])
    graph.updateCellSize(cell, true)
  }
  const insertImage = (file: File, x?: number, y?: number) => {
    if (file.size > MAX_IMAGE_BYTES) {
      toast('Images larger than 2 MB are not supported')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, 400 / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        // draw.io keeps data URIs without ";base64" in style strings.
        const data = url.replace(';base64,', ',')
        const cell = new Cell('', new Geometry(0, 0, w, h), styleFromString(`shape=image;verticalLabelPosition=bottom;verticalAlign=top;imageAspect=0;aspect=fixed;image=${data};`))
        cell.setVertex(true)
        if (x === undefined || y === undefined) insertAtCenter([cell])
        else insertCells([cell], x - w / 2, y - h / 2, null)
      }
      img.src = url
    }
    reader.readAsDataURL(file)
  }
  const handlesClipboard = () => !isTyping(document.activeElement) && !graph.isEditing() && !document.querySelector('dialog[open]')

  document.addEventListener('copy', (e) => {
    if (!handlesClipboard()) return
    const text = copyText()
    if (!text) return
    e.clipboardData?.setData('text/plain', text)
    lastClipboard = text
    pasteCount = 0
    e.preventDefault()
  })
  document.addEventListener('cut', (e) => {
    if (!handlesClipboard()) return
    const text = copyText()
    if (!text) return
    e.clipboardData?.setData('text/plain', text)
    lastClipboard = text
    pasteCount = -1
    e.preventDefault()
    remove()
  })
  document.addEventListener('paste', (e) => {
    if (!handlesClipboard() || !e.clipboardData) return
    const image = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'))
    e.preventDefault()
    if (image) insertImage(image)
    else void pasteText(e.clipboardData.getData('text/plain'))
  })
  const menuCopy = (cut: boolean) => {
    const text = copyText()
    if (!text) return
    lastClipboard = text
    pasteCount = cut ? -1 : 0
    navigator.clipboard?.writeText(text).catch(() => {})
    if (cut) remove()
  }
  const menuPaste = async () => {
    let text = lastClipboard
    try {
      text = (await navigator.clipboard.readText()) || lastClipboard
    } catch {
      // Clipboard access denied: use what was copied here.
    }
    if (text) await pasteText(text)
  }

  canvas.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
  })
  canvas.addEventListener('drop', (e) => {
    const file = [...(e.dataTransfer?.files ?? [])][0]
    if (!file) return
    e.preventDefault()
    if (file.type.startsWith('image/')) {
      const p = graph.getPointForEvent(e as unknown as MouseEvent, false)
      insertImage(file, p.x, p.y)
    } else void openFile(file)
  })

  // ---------- Files ----------

  const download = (blob: Blob, ext: string) => {
    const a = el('a', { href: URL.createObjectURL(blob), download: `${title()}.${ext}` })
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const downloadDrawio = async () => {
    const { serializeDrawio } = await formats()
    download(new Blob([serializeDrawio(DiagramSync.readPages(session.doc))], { type: 'application/vnd.jgraph.mxfile' }), 'drawio')
  }
  const exportSvg = () => renderSvg(graph, { cells: hasSelection() ? selection() : undefined })
  const downloadSvg = () => download(new Blob([svgToString(exportSvg())], { type: 'image/svg+xml' }), 'svg')
  const downloadPng = async () => {
    try {
      download(await svgToPng(exportSvg()), 'png')
    } catch (err) {
      toast(`PNG export failed: ${(err as Error).message}`)
    }
  }
  const print = () => {
    graph.clearSelection()
    printArea.replaceChildren(renderSvg(graph, { border: 0 }))
    window.print()
    printArea.replaceChildren()
  }
  const openFile = async (file: File) => {
    try {
      toast('Opening…')
      const { importFile } = await import('./index')
      location.href = await importFile(file)
    } catch (err) {
      toast(`Could not open the file: ${(err as Error).message}`)
    }
  }
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (file) void openFile(file)
  })

  // ---------- Pages ----------

  const pageTabs = el('div', { class: 'page-tabs', role: 'tablist' })
  const addPage = () => {
    const id = sync.addPage(`Page-${sync.pageList().length + 1}`)
    sync.showPage(id)
  }
  const duplicatePage = () => {
    const current = sync.pageList().find((p) => p.id === sync.page)!
    const id = sync.addPage(`${current.name} (copy)`, sync.pageRecords(sync.page))
    sync.showPage(id)
  }
  const renamePage = async (id = sync.page) => {
    const current = sync.pageList().find((p) => p.id === id)
    if (!current) return
    const name = await promptText('Rename page', 'Name', current.name)
    if (name?.trim()) sync.renamePage(id, name.trim())
  }
  const deletePage = async (id = sync.page) => {
    if (sync.pageList().length <= 1) return
    const ok = await showDialog('Delete page', el('p', { textContent: 'Delete this page for everyone?' }), [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Delete', value: 'ok', primary: true },
    ])
    if (ok === 'ok') sync.deletePage(id)
  }
  const movePage = (dir: -1 | 1) => {
    const list = sync.pageList()
    const index = list.findIndex((p) => p.id === sync.page)
    if (dir < 0 && index > 0) sync.movePage(sync.page, list[index - 1].id)
    if (dir > 0 && index < list.length - 1) sync.movePage(sync.page, list[index + 2]?.id ?? null)
  }
  const renderTabs = () => {
    const peers = presence?.pagesOfPeers() ?? new Map()
    pageTabs.replaceChildren()
    for (const page of sync.pageList()) {
      const tab = el('button', { type: 'button', class: 'page-tab', textContent: page.name || 'Untitled page', role: 'tab' })
      tab.classList.toggle('active', page.id === sync.page)
      tab.setAttribute('aria-selected', String(page.id === sync.page))
      for (const user of peers.get(page.id) ?? []) {
        const dot = el('span', { class: 'page-peer', title: user.name })
        dot.style.background = user.color
        tab.append(dot)
      }
      tab.addEventListener('click', () => page.id !== sync.page && sync.showPage(page.id))
      tab.addEventListener('dblclick', () => void renamePage(page.id))
      tab.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        if (page.id !== sync.page) sync.showPage(page.id)
        showContextMenu(e.clientX, e.clientY, pageMenu())
      })
      pageTabs.append(tab)
    }
    const add = el('button', { type: 'button', class: 'page-add', title: 'New page' }, icon(Plus, 16))
    add.addEventListener('click', addPage)
    pageTabs.append(add)
  }
  const pageMenu = (): MenuEntry[] => [
    { label: 'New page', run: addPage },
    { label: 'Duplicate page', run: duplicatePage },
    { label: 'Rename page…', run: () => void renamePage() },
    { label: 'Delete page', run: () => void deletePage(), enabled: () => sync.pageList().length > 1 },
    '-',
    { label: 'Move page left', run: () => movePage(-1) },
    { label: 'Move page right', run: () => movePage(1) },
  ]

  // ---------- Menus ----------

  const one = () => graph.getSelectionCount() === 1
  const many = (n: number) => () => vertices().length >= n
  createMenuBar(shell.menubar, [
    {
      label: 'File',
      items: [
        { label: 'New diagram', run: () => window.open(newDocPath('diagram'), '_blank') },
        { label: 'Open file (.drawio)…', run: () => fileInput.click() },
        { label: 'All documents', run: () => (location.href = homePath()) },
        { label: 'Share…', run: () => document.getElementById('btn-share')!.click() },
        '-',
        { label: 'Download .drawio', run: () => void downloadDrawio() },
        { label: 'Download SVG', run: downloadSvg },
        { label: 'Download PNG', run: () => void downloadPng() },
        '-',
        { label: 'Print', shortcut: mod('P'), run: print },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: mod('Z'), run: undo, enabled: () => undoManager.canUndo() },
        { label: 'Redo', shortcut: mod('Y'), run: redo, enabled: () => undoManager.canRedo() },
        '-',
        { label: 'Cut', shortcut: mod('X'), run: () => menuCopy(true), enabled: hasSelection },
        { label: 'Copy', shortcut: mod('C'), run: () => menuCopy(false), enabled: hasSelection },
        { label: 'Paste', shortcut: mod('V'), run: () => void menuPaste() },
        { label: 'Duplicate', shortcut: mod('D'), run: duplicate, enabled: hasSelection },
        { label: 'Delete', shortcut: 'Del', run: remove, enabled: hasSelection },
        '-',
        { label: 'Select all', shortcut: mod('A'), run: selectAll },
        { label: 'Select shapes', run: selectVertices },
        { label: 'Select connectors', run: selectEdges },
        { label: 'Select none', shortcut: 'Esc', run: () => graph.clearSelection() },
        '-',
        { label: 'Edit label', shortcut: 'F2', run: editLabel, enabled: one },
        { label: 'Edit style…', run: () => void editStyle(), enabled: hasSelection },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Shapes', run: () => togglePanel(sidebar.element), active: () => !sidebar.element.hidden },
        { label: 'Format', run: () => togglePanel(format.element), active: () => !format.element.hidden },
        { label: 'Grid', run: () => setGridVisible(!gridVisible), active: () => gridVisible },
        '-',
        { label: 'Zoom in', shortcut: mod('+'), run: () => zoomStep(1) },
        { label: 'Zoom out', shortcut: mod('-'), run: () => zoomStep(-1) },
        { label: 'Actual size', shortcut: mod('0'), run: actualSize },
        { label: 'Fit', shortcut: `${mod('Shift+H')}`, run: fit },
      ],
    },
    {
      label: 'Arrange',
      items: [
        { label: 'To front', shortcut: mod('Shift+F'), run: toFront, enabled: hasSelection },
        { label: 'To back', shortcut: mod('Shift+B'), run: toBack, enabled: hasSelection },
        '-',
        { label: 'Group', shortcut: mod('G'), run: group, enabled: () => graph.getSelectionCount() > 1 },
        { label: 'Ungroup', shortcut: mod('Shift+U'), run: ungroup, enabled: hasSelection },
        '-',
        {
          label: 'Align',
          submenu: [
            { label: 'Left', run: () => align('left'), enabled: many(2) },
            { label: 'Center', run: () => align('center'), enabled: many(2) },
            { label: 'Right', run: () => align('right'), enabled: many(2) },
            '-',
            { label: 'Top', run: () => align('top'), enabled: many(2) },
            { label: 'Middle', run: () => align('middle'), enabled: many(2) },
            { label: 'Bottom', run: () => align('bottom'), enabled: many(2) },
          ],
        },
        {
          label: 'Distribute',
          submenu: [
            { label: 'Horizontally', run: () => distribute(true), enabled: many(3) },
            { label: 'Vertically', run: () => distribute(false), enabled: many(3) },
          ],
        },
        {
          label: 'Layout',
          submenu: [
            { label: 'Vertical tree', run: () => layout(treeLayout(false)) },
            { label: 'Horizontal tree', run: () => layout(treeLayout(true)) },
            { label: 'Hierarchical (top to bottom)', run: () => layout(() => new HierarchicalLayout(graph, 'north')) },
            { label: 'Hierarchical (left to right)', run: () => layout(() => new HierarchicalLayout(graph, 'west')) },
            { label: 'Circle', run: () => layout(() => new CircleLayout(graph)) },
            { label: 'Organic', run: () => layout(() => new FastOrganicLayout(graph)) },
          ],
        },
        '-',
        { label: 'Rotate 90°', shortcut: mod('R'), run: rotate, enabled: many(1) },
        { label: 'Flip horizontally', run: () => flip('flipH'), enabled: many(1) },
        { label: 'Flip vertically', run: () => flip('flipV'), enabled: many(1) },
      ],
    },
    { label: 'Page', items: pageMenu() },
    {
      label: 'Help',
      items: [{ label: 'Keyboard shortcuts', run: showShortcuts }],
    },
  ])

  // ---------- Toolbar ----------

  const toolbarUpdaters: (() => void)[] = []
  const tbGroup = (...items: HTMLElement[]) => shell.toolbar.append(el('div', { class: 'tb-group' }, ...items))
  const tbButton = (node: IconNode, label: string, run: () => void, enabled?: () => boolean, active?: () => boolean) => {
    const b = el('button', { type: 'button', class: 'tb-btn', title: label }, icon(node))
    b.setAttribute('aria-label', label)
    b.addEventListener('mousedown', (e) => e.preventDefault())
    b.addEventListener('click', run)
    if (enabled || active) {
      toolbarUpdaters.push(() => {
        if (enabled) b.disabled = !enabled()
        if (active) b.classList.toggle('active', active())
      })
    }
    return b
  }
  const zoomSelect = el('select', { class: 'tb-select tb-zoom', title: 'Zoom' })
  zoomSelect.setAttribute('aria-label', 'Zoom')
  const syncZoomSelect = () => {
    const pct = Math.round(view.scale * 100)
    zoomSelect.replaceChildren(
      ...ZOOMS.map((z) => el('option', { value: String(z), textContent: `${z * 100}%` })),
      el('option', { value: 'fit', textContent: 'Fit' }),
    )
    if (!ZOOMS.some((z) => Math.round(z * 100) === pct)) zoomSelect.prepend(el('option', { value: String(view.scale), textContent: `${pct}%` }))
    zoomSelect.value = String(ZOOMS.find((z) => Math.round(z * 100) === pct) ?? view.scale)
  }
  zoomSelect.addEventListener('change', () => {
    if (zoomSelect.value === 'fit') fit()
    else zoomAt(Number(zoomSelect.value))
    canvas.focus()
  })
  const colorTool = (node: IconNode, label: string, apply: (c: string | null) => void, reset: string) => {
    const b = tbButton(node, label, () => openPopover(b, colorPalette(apply, reset)), hasSelection)
    return b
  }
  tbGroup(
    tbButton(PanelLeft, 'Shapes panel', () => togglePanel(sidebar.element), undefined, () => !sidebar.element.hidden),
    tbButton(PanelRight, 'Format panel', () => togglePanel(format.element), undefined, () => !format.element.hidden),
  )
  tbGroup(
    tbButton(Undo2, `Undo (${mod('Z')})`, undo, () => undoManager.canUndo()),
    tbButton(Redo2, `Redo (${mod('Y')})`, redo, () => undoManager.canRedo()),
  )
  tbGroup(tbButton(Minus, 'Zoom out', () => zoomStep(-1)), zoomSelect, tbButton(Plus, 'Zoom in', () => zoomStep(1)), tbButton(Maximize, 'Fit', fit))
  tbGroup(
    tbButton(Trash2, 'Delete (Del)', remove, hasSelection),
    tbButton(BringToFront, 'To front', toFront, hasSelection),
    tbButton(SendToBack, 'To back', toBack, hasSelection),
  )
  tbGroup(
    colorTool(PaintBucket, 'Fill color', setFill, 'No fill'),
    colorTool(Pencil, 'Line color', setStroke, 'No line'),
    tbButton(Grid3x3, 'Grid', () => setGridVisible(!gridVisible), undefined, () => gridVisible),
  )
  const updateToolbar = () => {
    toolbarUpdaters.forEach((u) => u())
    syncZoomSelect()
  }

  // ---------- Layout ----------

  const sidebar = new ShapeSidebar(graph, PALETTE, insertCells, insertAtCenter)
  const format = new FormatPanel(graph, {
    toFront,
    toBack,
    group,
    ungroup,
    align,
    distribute,
    editStyle: () => void editStyle(),
    isGridVisible: () => gridVisible,
    setGridVisible,
    pageName: () => sync.pageList().find((p) => p.id === sync.page)?.name ?? '',
    renamePage: (name) => sync.renamePage(sync.page, name),
  })
  const narrow = window.matchMedia('(max-width: 800px)').matches
  sidebar.element.hidden = narrow
  format.element.hidden = narrow
  const togglePanel = (panel: HTMLElement) => {
    panel.hidden = !panel.hidden
    updateToolbar()
  }
  body.append(sidebar.element, canvas, format.element)
  shell.main.append(body)

  const zoomLabel = el('button', { type: 'button', class: 'zoom-value', title: 'Actual size' })
  zoomLabel.addEventListener('click', actualSize)
  const selectionLabel = el('span', { class: 'hide-narrow' })
  shell.statusbar.append(pageTabs, el('span', { class: 'spacer' }), selectionLabel, zoomLabel)

  // ---------- Keyboard ----------

  canvas.tabIndex = 0
  document.addEventListener('keydown', (e) => {
    if (isTyping(e.target) || graph.isEditing() || document.querySelector('dialog[open]')) return
    const modKey = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()
    let handled = true
    if (modKey && key === 'z' && !e.shiftKey) undo()
    else if (modKey && (key === 'y' || (key === 'z' && e.shiftKey))) redo()
    else if (modKey && key === 'a') selectAll()
    else if (modKey && key === 'd') duplicate()
    else if (modKey && key === 'g' && !e.shiftKey) group()
    else if (modKey && key === 'u' && e.shiftKey) ungroup()
    else if (modKey && key === 'f' && e.shiftKey) toFront()
    else if (modKey && key === 'b' && e.shiftKey) toBack()
    else if (modKey && key === 'h' && e.shiftKey) fit()
    else if (modKey && key === 'r') rotate()
    else if (modKey && key === 'p') print()
    else if (modKey && (key === '+' || key === '=')) zoomStep(1)
    else if (modKey && key === '-') zoomStep(-1)
    else if (modKey && key === '0') actualSize()
    else if (modKey && key === 's') toast('Changes are saved automatically in this browser')
    else if (modKey) handled = false
    else if (key === 'delete' || key === 'backspace') remove()
    else if (key === 'f2' || key === 'enter') editLabel()
    else if (key === 'escape') graph.clearSelection()
    else if (key.startsWith('arrow') && hasSelection()) {
      const step = e.shiftKey ? graph.gridSize : 1
      const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0
      const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0
      graph.moveCells(graph.getMovableCells(selection()), dx, dy)
    } else handled = false
    if (handled) e.preventDefault()
  })

  // ---------- Context menu ----------

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    const rect = canvas.getBoundingClientRect()
    const cell = graph.getCellAt(e.clientX - rect.left, e.clientY - rect.top)
    if (cell && !graph.isCellSelected(cell)) graph.setSelectionCell(cell)
    if (!cell) graph.clearSelection()
    const items: MenuEntry[] = hasSelection()
      ? [
          { label: 'Cut', shortcut: mod('X'), run: () => menuCopy(true) },
          { label: 'Copy', shortcut: mod('C'), run: () => menuCopy(false) },
          { label: 'Paste', shortcut: mod('V'), run: () => void menuPaste() },
          { label: 'Duplicate', shortcut: mod('D'), run: duplicate },
          { label: 'Delete', shortcut: 'Del', run: remove },
          '-',
          { label: 'Edit label', shortcut: 'F2', run: editLabel, enabled: one },
          { label: 'Edit style…', run: () => void editStyle() },
          '-',
          { label: 'To front', run: toFront },
          { label: 'To back', run: toBack },
          { label: 'Group', run: group, enabled: () => graph.getSelectionCount() > 1 },
          { label: 'Ungroup', run: ungroup },
        ]
      : [
          { label: 'Paste', shortcut: mod('V'), run: () => void menuPaste() },
          { label: 'Select all', shortcut: mod('A'), run: selectAll },
          '-',
          { label: 'Fit', run: fit },
          { label: 'Grid', run: () => setGridVisible(!gridVisible), active: () => gridVisible },
        ]
    showContextMenu(e.clientX, e.clientY, items)
  })

  // Double click on an empty spot adds a text box there.
  graph.addListener(InternalEvent.DOUBLE_CLICK, (_sender: unknown, evt: EventObject) => {
    if (evt.getProperty('cell')) return
    const me = evt.getProperty('event') as MouseEvent
    const p = graph.getPointForEvent(me, false)
    const cell = new Cell('Text', new Geometry(graph.snap(p.x - 30), graph.snap(p.y - 15), 60, 30), styleFromString('text;html=1;align=center;verticalAlign=middle;whiteSpace=wrap;'))
    cell.setVertex(true)
    inBatch(() => graph.addCell(cell, graph.getDefaultParent()))
    graph.setSelectionCell(cell)
    graph.startEditingAtCell(cell)
    evt.consume()
  })

  // ---------- Status and wiring ----------

  const updateStatus = () => {
    const n = graph.getSelectionCount()
    selectionLabel.textContent = n ? `${n} selected` : ''
    updateToolbar()
  }
  graph.getSelectionModel().addListener(InternalEvent.CHANGE, updateStatus)
  model.addListener(InternalEvent.CHANGE, updateStatus)
  undoManager.addListener(InternalEvent.CHANGE, updateStatus)
  undoManager.addListener(InternalEvent.ADD, updateStatus)

  // Declared before start(): showPage runs inside it.
  let presence: DiagramPresence | undefined
  let fitted = false
  sync.onPagesChange = renderTabs
  sync.onPageShown = () => {
    undoManager.clear()
    presence?.pageChanged()
    format.render()
    if (fitted) fit()
  }
  sync.start()
  presence = new DiagramPresence(graph, session.awareness, session.doc.clientID)
  session.awareness.on('change', () => renderTabs())

  requestAnimationFrame(() => {
    // Show the diagram at 100% when it fits, else fit it.
    const b = graph.getGraphBounds()
    const rect = canvas.getBoundingClientRect()
    if (b.width && (b.width > rect.width - 40 || b.height > rect.height - 40)) fit()
    else view.scaleAndTranslate(1, b.width ? 20 - (b.x - 0) : 20, b.width ? 20 - b.y : 20)
    fitted = true
    updateGrid()
    updateStatus()
  })
  updateGrid()
  updateStatus()

  // Save indicator: changes are stored locally as they happen.
  const saveState = document.getElementById('save-state')!
  let saveTimer = 0
  session.doc.on('update', () => {
    saveState.textContent = 'Saving…'
    clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => (saveState.textContent = 'Saved in this browser'), 600)
  })
  saveState.textContent = 'Saved in this browser'

  // Handles for automated browser tests in development builds only.
  if (import.meta.env.DEV) Object.assign(window, { diagramGraph: graph, diagramSync: sync, diagramUndo: undoManager })
}

function showShortcuts(): void {
  const rows: [string, string][] = [
    ['Undo / redo', `${mod('Z')} / ${mod('Y')}`],
    ['Cut / copy / paste', `${mod('X')} / ${mod('C')} / ${mod('V')}`],
    ['Duplicate', mod('D')],
    ['Delete', 'Del'],
    ['Select all', mod('A')],
    ['Edit label', 'F2 / Enter / double click'],
    ['Add text', 'Double click on the canvas'],
    ['Move', 'Arrow keys (Shift: grid step)'],
    ['Group / ungroup', `${mod('G')} / ${mod('Shift+U')}`],
    ['To front / to back', `${mod('Shift+F')} / ${mod('Shift+B')}`],
    ['Rotate 90°', mod('R')],
    ['Zoom', `${mod('+')} / ${mod('-')} / ${mod('Wheel')}`],
    ['Fit', mod('Shift+H')],
    ['Pan', 'Wheel, Space + drag or middle button'],
    ['Connect', 'Drag from the blue points of a shape'],
    ['Straight lines while dragging', 'Shift'],
  ]
  const table = el('table', { class: 'shortcuts' })
  for (const [action, keys] of rows) table.append(el('tr', {}, el('td', { textContent: action }), el('td', {}, el('kbd', { textContent: keys }))))
  void showDialog('Keyboard shortcuts', table, [{ label: 'Close', value: 'ok', primary: true }], true)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

