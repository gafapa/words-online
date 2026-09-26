// Diagram app: our own editor on maxGraph inside the common shell, synced over
// Yjs. Files are compatible with draw.io (.drawio / mxGraphModel XML).
// The editor itself (graph, commands, panels, keyboard) lives in editor.ts.

import { Grid3x3, PaintBucket, PanelLeft, PanelRight, Pencil, Plus, Redo2, SendToBack, BringToFront, Trash2, Undo2 } from 'lucide'
import { appInfo } from '../registry'
import { homePath, newDocPath } from '../../core/router'
import type { Session } from '../../core/session'
import { t } from '../../core/i18n'
import { setupChrome } from '../../ui/chrome'
import { renderShell } from '../../ui/shell'
import { documentMenuItems } from '../../ui/versions'
import { createMenuBar, el, icon, promptText, showContextMenu, showDialog, toast, type MenuEntry } from '../../ui/widgets'
import { createDiagramEditor, mod, showShortcuts } from './editor'
import { renderSvg, svgToPng, svgToString } from './export'
import { DiagramSync } from './sync'
import { createPageSettings, type PageSettings } from './page'

export const DIAGRAM_ACCEPT = '.drawio,.xml,.vsdx,.vssx'

const formats = () => import('./formats/drawio')

export function mountDiagram(session: Session, root: HTMLElement): void {
  const info = appInfo('diagram')
  const shell = renderShell(info, root)
  setupChrome(session, info.untitled)

  const canvas = el('div', { class: 'diagram-canvas grid' })
  const body = el('div', { class: 'diagram-body' })
  const printArea = el('div', { class: 'diagram-print' })
  const fileInput = el('input', { type: 'file', accept: DIAGRAM_ACCEPT, hidden: true })
  document.body.append(printArea, fileInput)

  const meta = session.doc.getMap<unknown>('meta')
  const title = () => String(meta.get('title') || info.untitled).replace(/[\\/:*?"<>|]+/g, '_')

  const openFile = async (file: File) => {
    try {
      toast(t('Opening…'))
      const { importFile } = await import('./index')
      location.href = await importFile(file)
    } catch (err) {
      toast(t('Could not open the file: {error}', { error: (err as Error).message }))
    }
  }
  const print = () => {
    graph.clearSelection()
    printArea.replaceChildren(renderSvg(graph, { border: 0, background: page?.background() ?? '#ffffff' }))
    window.print()
    printArea.replaceChildren()
  }

  let page: PageSettings | undefined
  const editor = createDiagramEditor(session, {
    canvas,
    diagramOptions: () => page?.formatRows() ?? [],
    // Links with view or comment access open the diagram read-only.
    readOnly: !session.canEdit,
    openFile: (file) => void openFile(file),
    print,
    onPagesChange: () => {
      renderTabs()
      page?.update()
    },
    onPageShown: () => page?.update(),
  })
  const { graph, sync, readOnly } = editor
  // "Hand in" → print uses the same page rendering.
  session.hooks.print = print
  const editable = editor.editable
  page = createPageSettings(editor, canvas)
  const background = () => page!.background() ?? '#ffffff'

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
  const exportSvg = () => renderSvg(graph, { cells: editor.hasSelection() ? editor.selection() : undefined, background: background() })
  const downloadSvg = () => download(new Blob([svgToString(exportSvg())], { type: 'image/svg+xml' }), 'svg')
  const downloadPng = async () => {
    try {
      download(await svgToPng(exportSvg()), 'png')
    } catch (err) {
      toast(t('PNG export failed: {error}', { error: (err as Error).message }))
    }
  }
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (file) void openFile(file)
  })
  // Formats for "Save to Nextcloud" (the whole current page for images).
  session.hooks.exportFormats = () => [
    { ext: 'drawio', label: t('draw.io diagram (.drawio)'), build: async () => new Blob([(await formats()).serializeDrawio(DiagramSync.readPages(session.doc))], { type: 'application/vnd.jgraph.mxfile' }) },
    { ext: 'svg', label: t('SVG image (current page)'), build: async () => new Blob([svgToString(renderSvg(graph, { background: background() }))], { type: 'image/svg+xml' }) },
    { ext: 'png', label: t('PNG image (current page)'), build: () => svgToPng(renderSvg(graph, { background: background() })) },
  ]

  // ---------- Pages ----------

  const pageTabs = el('div', { class: 'page-tabs', role: 'tablist' })
  const addPage = () => {
    const id = sync.addPage(`Page-${sync.pageList().length + 1}`)
    sync.showPage(id)
  }
  const duplicatePage = () => {
    const current = sync.pageList().find((p) => p.id === sync.page)!
    const id = sync.addPage(`${current.name} (copy)`, sync.pageRecords(sync.page), sync.pageAttrs(sync.page))
    sync.showPage(id)
  }
  const renamePage = async (id = sync.page) => {
    if (readOnly) return
    const current = sync.pageList().find((p) => p.id === id)
    if (!current) return
    const name = await promptText(t('Rename page'), t('Name'), current.name)
    if (name?.trim()) sync.renamePage(id, name.trim())
  }
  const deletePage = async (id = sync.page) => {
    if (sync.pageList().length <= 1) return
    const ok = await showDialog(t('Delete page'), el('p', { textContent: t('Delete this page for everyone?') }), [
      { label: t('Cancel'), value: 'cancel' },
      { label: t('Delete'), value: 'ok', primary: true },
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
    const peers = editor.presence()?.pagesOfPeers() ?? new Map()
    pageTabs.replaceChildren()
    for (const page of sync.pageList()) {
      const tab = el('button', { type: 'button', class: 'page-tab', textContent: page.name || t('Untitled page'), role: 'tab' })
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
    if (readOnly) return
    const add = el('button', { type: 'button', class: 'page-add', title: t('New page') }, icon(Plus, 16))
    add.addEventListener('click', addPage)
    pageTabs.append(add)
  }
  const pageMenu = (): MenuEntry[] => [
    { label: t('New page'), run: addPage, enabled: editable() },
    { label: t('Duplicate page'), run: duplicatePage, enabled: editable() },
    { label: t('Rename page…'), run: () => void renamePage(), enabled: editable() },
    { label: t('Delete page'), run: () => void deletePage(), enabled: editable(() => sync.pageList().length > 1) },
    '-',
    { label: t('Move page left'), run: () => movePage(-1), enabled: editable() },
    { label: t('Move page right'), run: () => movePage(1), enabled: editable() },
    '-',
    ...page!.menu(() => pageTabs),
  ]

  // ---------- Menus ----------

  createMenuBar(shell.menubar, [
    {
      label: t('File'),
      items: [
        { label: t('New diagram'), run: () => window.open(newDocPath('diagram'), '_blank') },
        { label: t('Open file (.drawio, .vsdx)…'), run: () => fileInput.click() },
        { label: t('All documents'), run: () => (location.href = homePath()) },
        { label: t('Share…'), run: () => document.getElementById('btn-share')!.click() },
        '-',
        { label: t('Download .drawio'), run: () => void downloadDrawio() },
        { label: t('Download SVG'), run: downloadSvg },
        { label: t('Download PNG'), run: () => void downloadPng() },
        '-',
        ...documentMenuItems(session),
        '-',
        { label: t('Print'), shortcut: mod('P'), run: print },
      ],
    },
    { label: t('Edit'), items: editor.editMenu() },
    { label: t('View'), items: [...editor.panelMenu(), ...page.viewMenu(), '-', ...editor.zoomMenu()] },
    { label: t('Arrange'), items: editor.arrangeMenu() },
    { label: t('Page'), items: pageMenu() },
    { label: t('Help'), items: [{ label: t('Keyboard shortcuts'), run: () => showShortcuts() }] },
  ])

  // ---------- Toolbar ----------

  const tbGroup = (...items: HTMLElement[]) => shell.toolbar.append(el('div', { class: 'tb-group' }, ...items))
  const { tbButton, colorTool, hasSelection } = editor
  const { sidebar, format } = editor
  const canEdit = (fn?: () => boolean) => editable(fn)
  if (!readOnly) {
    tbGroup(
      tbButton(PanelLeft, t('Shapes panel'), () => editor.togglePanel(sidebar.element), undefined, () => !sidebar.element.hidden),
      tbButton(PanelRight, t('Format panel'), () => editor.togglePanel(format.element), undefined, () => !format.element.hidden),
    )
    tbGroup(
      tbButton(Undo2, `${t('Undo')} (${mod('Z')})`, editor.undo, canEdit(() => editor.undoManager.canUndo())),
      tbButton(Redo2, `${t('Redo')} (${mod('Y')})`, editor.redo, canEdit(() => editor.undoManager.canRedo())),
    )
  }
  tbGroup(...editor.zoomTools())
  if (!readOnly) {
    tbGroup(
      tbButton(Trash2, t('Delete (Del)'), editor.remove, canEdit(hasSelection)),
      tbButton(BringToFront, t('To front'), editor.toFront, canEdit(hasSelection)),
      tbButton(SendToBack, t('To back'), editor.toBack, canEdit(hasSelection)),
    )
    tbGroup(
      colorTool(PaintBucket, t('Fill color'), editor.setFill, t('No fill')),
      colorTool(Pencil, t('Line color'), editor.setStroke, t('No line')),
      tbButton(Grid3x3, t('Grid'), () => editor.setGridVisible(!editor.isGridVisible()), undefined, () => editor.isGridVisible()),
    )
  }

  // ---------- Layout ----------

  body.append(sidebar.element, canvas, format.element)
  shell.main.append(body)
  shell.statusbar.append(pageTabs, el('span', { class: 'spacer' }), editor.selectionLabel, editor.zoomLabel)
  editor.zoomLabel.addEventListener('click', editor.actualSize)

  editor.start(() => {
    // Show the diagram at 100% when it fits, else fit it.
    const b = graph.getGraphBounds()
    const rect = canvas.getBoundingClientRect()
    if (b.width && (b.width > rect.width - 40 || b.height > rect.height - 40)) editor.fit()
    else graph.view.scaleAndTranslate(1, b.width ? 20 - (b.x - 0) : 20, b.width ? 20 - b.y : 20)
  })

  // Save indicator: changes are stored locally as they happen.
  const saveState = document.getElementById('save-state')!
  let saveTimer = 0
  session.doc.on('update', () => {
    saveState.textContent = t('Saving…')
    clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => (saveState.textContent = t('Saved in this browser')), 600)
  })
  saveState.textContent = t('Saved in this browser')
}
