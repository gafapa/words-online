// Word processor: TipTap editor in a paged print layout with menus, toolbar,
// status bar, find & replace, headers/footers, footnotes and page setup.

import * as Y from 'yjs'
import { Editor, generateHTML, getSchema, type JSONContent } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { yXmlFragmentToProsemirrorJSON, prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap'
import { Node as PMNode, type Schema } from '@tiptap/pm/model'
import { Transform } from '@tiptap/pm/transform'
import { allExtensions, bodyExtensions, headerFooterExtensions } from './editor/extensions'
import { exportFile, importFile, OPEN_ACCEPT, type ExportFormat } from './formats'
import { DEFAULT_PAGE, pageDimensionsMm, type DocumentData, type PageSettings } from './formats/types'
import { appInfo } from '../registry'
import { docPath, newDocPath } from '../../core/router'
import { createLocalDocument, type Session } from '../../core/session'
import { setupChrome } from '../../ui/chrome'
import { renderShell } from '../../ui/shell'
import { toast } from '../../ui/widgets'
import { Find, setupFindPanel } from './find'
import { mmToPx, notesHtml, Pagination, relayout, type Layout, type PageGeometry } from './pages'
import { buildMenus, buildToolbar, setupContextMenu } from './commands'
import { t, tn } from '../../core/i18n'
import { authorDirectory, PENDING_COMMENTS, userIdOf, type Access } from './collab'
import { Review, type CommentRecord, type CommentThread } from './review'
import { AuthorshipView } from './authorship'
import { editEquation } from '../../ui/equation'
import type { EquationEditDetail } from './editor/equation'
import { PositionIndex, encodeAnchor } from './ypos'
import type { CommentData } from './formats/types'
import { authorColor } from './formats/review'

const UNTITLED = t('Untitled document')
const ZOOM_KEY = 'words-online:zoom'

const MAIN_HTML = `
  <div id="find-panel" class="find-panel" hidden>
    <div class="find-row">
      <input data-find placeholder="${t('Find in document')}" aria-label="${t('Find')}" />
      <span data-count class="find-count"></span>
      <button type="button" data-prev title="${t('Previous (Shift+Enter)')}">↑</button>
      <button type="button" data-next title="${t('Next (Enter)')}">↓</button>
      <button type="button" data-close title="${t('Close (Esc)')}">✕</button>
    </div>
    <div class="find-row" data-replace-row>
      <input data-replace placeholder="${t('Replace with')}" aria-label="${t('Replace with')}" />
      <button type="button" data-replace-one>${t('Replace')}</button>
      <button type="button" data-replace-all>${t('Replace all')}</button>
    </div>
    <label class="find-option"><input type="checkbox" data-case /> ${t('Match case')}</label>
  </div>
  <div id="canvas" class="canvas">
    <div class="canvas-row">
      <div id="zoom-wrap" class="zoom-wrap">
        <div id="paper" class="paper">
          <div id="first-header" class="page-header"></div>
          <div id="editor"></div>
          <div id="page-tail" class="page-tail"></div>
        </div>
      </div>
      <aside id="review-rail" class="review-rail" aria-label="${t('Comments and suggestions')}" hidden></aside>
    </div>
  </div>
  <input id="file-input" type="file" hidden />
  <input id="image-input" type="file" accept="image/*" hidden />`

const STATUS_HTML = `
  <span id="status-page"></span>
  <span id="status-words"></span>
  <span id="status-chars" class="hide-narrow"></span>
  <span class="spacer"></span>
  <span id="status-mode" class="status-mode" hidden></span>
  <button id="status-comments" class="status-comments" hidden></button>
  <span class="hide-narrow">${t('Zoom')}</span>
  <input id="zoom-range" type="range" min="50" max="200" step="10" value="100" aria-label="${t('Zoom')}" class="hide-narrow" />
  <button id="zoom-value" class="zoom-value" title="${t('Reset zoom')}">100%</button>`

export interface WriterContext {
  session: Session
  editor: Editor
  meta: Y.Map<unknown>
  getPage: () => PageSettings
  setPage: (page: PageSettings) => void
  setZoom: (zoom: number) => void
  getZoom: () => number
  find: { open: (replace?: boolean) => void }
  newDocument: () => void
  openFile: () => void
  download: (format: ExportFormat) => void
  print: () => void
  openUrl: (id: string, key: string) => string
  pages: () => number
  access: Access
  review: Review
  authorship: AuthorshipView
  // Local editing mode for editors: direct edits or suggestions.
  isSuggesting: () => boolean
  setSuggesting: (on: boolean) => void
  insertEquation: (display?: boolean) => void
  showContributions: () => void
}

export function mountWriter(session: Session, root: HTMLElement): WriterContext {
  const { doc, awareness, user } = session
  const access = session.access
  const editable = session.canEdit
  const meta = doc.getMap<unknown>('meta')
  const shell = renderShell(appInfo('writer'), root)
  shell.main.innerHTML = MAIN_HTML
  shell.statusbar.innerHTML = STATUS_HTML
  setupChrome(session, UNTITLED)

  // ---------- Page settings (shared) ----------

  const getPage = (): PageSettings => {
    const raw = meta.get('page')
    if (typeof raw === 'string') {
      try {
        return { ...DEFAULT_PAGE, ...JSON.parse(raw) }
      } catch {
        // Fall through to defaults.
      }
    }
    return DEFAULT_PAGE
  }
  const setPage = (page: PageSettings) => meta.set('page', JSON.stringify(page))

  const geometry = (): PageGeometry => {
    const page = getPage()
    const { width, height } = pageDimensionsMm(page)
    return {
      width: Math.round(mmToPx(width)),
      height: Math.round(mmToPx(height)),
      margins: {
        top: Math.round(mmToPx(page.margins.top)),
        right: Math.round(mmToPx(page.margins.right)),
        bottom: Math.round(mmToPx(page.margins.bottom)),
        left: Math.round(mmToPx(page.margins.left)),
      },
    }
  }

  // ---------- Header / footer rendering ----------

  const headerFragment = doc.getXmlFragment('header')
  const footerFragment = doc.getXmlFragment('footer')
  const hfExtensions = headerFooterExtensions()
  let headerHtml = ''
  let footerHtml = ''
  const renderFragment = (fragment: Y.XmlFragment) => {
    if (fragment.length === 0) return ''
    try {
      const json = yXmlFragmentToProsemirrorJSON(fragment) as JSONContent
      return isEmptyDoc(json) ? '' : generateHTML(json, hfExtensions)
    } catch {
      return ''
    }
  }
  const refreshChrome = () => {
    headerHtml = renderFragment(headerFragment)
    footerHtml = renderFragment(footerFragment)
  }
  refreshChrome()
  const fillFields = (html: string, page: number, total: number) =>
    html.replace(/<span([^>]*data-page-field[^>]*)>[^<]*<\/span>/g, (_m, attrs: string) =>
      `<span${attrs}>${/data-kind="total"/.test(attrs) ? total : page}</span>`,
    )
  const chrome = {
    header: (page: number, total: number) => fillFields(headerHtml, page, total),
    footer: (page: number, total: number) => fillFields(footerHtml, page, total),
  }

  // ---------- Editor ----------

  const paper = document.getElementById('paper')!
  const firstHeader = document.getElementById('first-header')!
  const tail = document.getElementById('page-tail')!
  let layout: Layout = { breaks: [], pages: 1, tailFill: 0, tailNotes: [], tailFirstNote: 1 }
  let review: Review | null = null

  const editor = new Editor({
    element: document.getElementById('editor')!,
    extensions: [
      ...bodyExtensions({ history: false, placeholder: t('Start typing…') }),
      Collaboration.configure({ document: doc, field: 'body' }),
      CollaborationCaret.configure({
        provider: { awareness },
        user: { name: user.name, color: user.color },
      }),
      Pagination.configure({ getGeometry: geometry, chrome, onLayout: (l) => applyLayout(l) }),
      Find,
    ],
    editable,
    editorProps: {
      attributes: { spellcheck: 'true', lang: navigator.language },
      handlePaste: (_view, event) => insertImageFiles(event.clipboardData?.files),
      handleDrop: (_view, event) => insertImageFiles((event as DragEvent).dataTransfer?.files),
    },
    autofocus: editable ? 'start' : false,
  })

  // ---------- Review: comments, suggestions, authorship ----------

  const rail = document.getElementById('review-rail')!
  rail.setAttribute('aria-label', t('Comments and suggestions'))
  review = new Review({ session, editor, access, rail, paper, onVisibilityChange: () => updateZoomBox() })
  const authors = authorDirectory(session)
  const authorship = new AuthorshipView(editor, session, authors)
  editor.registerPlugin(review.plugin())
  editor.registerPlugin(authorship.plugin())
  const suggestionStorage = editor.storage.suggestions
  const syncSuggestionUser = () => {
    const me = session.user
    suggestionStorage.user = { id: userIdOf(session), name: me.name, color: me.color }
  }
  syncSuggestionUser()
  suggestionStorage.client = doc.clientID
  awareness.on('change', syncSuggestionUser)

  function insertImageFiles(files: FileList | undefined | null): boolean {
    const images = [...(files ?? [])].filter((f) => f.type.startsWith('image/'))
    if (!images.length) return false
    images.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => editor.chain().focus().setImage({ src: String(reader.result) }).run()
      reader.readAsDataURL(file)
    })
    return true
  }

  function applyLayout(next: Layout) {
    layout = next
    const geo = geometry()
    paper.style.setProperty('--pages', String(layout.pages))
    firstHeader.innerHTML = chrome.header(1, layout.pages)
    tail.innerHTML =
      `<div class="page-fill" style="--fill:${layout.tailFill}px"></div>` +
      notesHtml(layout.tailNotes, layout.tailFirstNote) +
      `<div class="page-footer" style="height:${geo.margins.bottom}px">${chrome.footer(layout.pages, layout.pages)}</div>`
    tail.querySelectorAll<HTMLElement>('.page-notes, .page-footer').forEach((n) => (n.style.padding = `0 ${geo.margins.right}px 0 ${geo.margins.left}px`))
    updateStatus()
    updateZoomBox()
    review?.reposition()
  }

  // Applies page geometry to the paper and the print stylesheet.
  const printStyle = document.createElement('style')
  document.head.append(printStyle)
  function applyGeometry() {
    const geo = geometry()
    const page = getPage()
    const { width, height } = pageDimensionsMm(page)
    paper.style.width = `${geo.width}px`
    paper.style.setProperty('--page-height', `${geo.height}px`)
    firstHeader.style.height = `${geo.margins.top}px`
    firstHeader.style.padding = `0 ${geo.margins.right}px 0 ${geo.margins.left}px`
    editor.view.dom.style.padding = `0 ${geo.margins.right}px 0 ${geo.margins.left}px`
    printStyle.textContent = `@page { size: ${width}mm ${height}mm; margin: 0 }`
    relayout(editor.view)
  }
  applyGeometry()

  meta.observe((event) => {
    if (event.keysChanged.has('page')) applyGeometry()
  })
  const onChromeChange = () => {
    refreshChrome()
    relayout(editor.view)
  }
  headerFragment.observeDeep(onChromeChange)
  footerFragment.observeDeep(onChromeChange)

  // ---------- Zoom ----------

  const canvas = document.getElementById('canvas')!
  const zoomWrap = document.getElementById('zoom-wrap')!
  const zoomRange = document.getElementById('zoom-range') as HTMLInputElement
  const zoomValue = document.getElementById('zoom-value')!
  let zoom = Number(localStorage.getItem(ZOOM_KEY)) || (window.innerWidth < 900 ? 0 : 1)
  const railWidth = () => (rail.hidden || window.innerWidth <= 760 ? 0 : rail.offsetWidth + 16)
  const effectiveZoom = () => (zoom > 0 ? zoom : Math.min(2, (canvas.clientWidth - 32 - railWidth()) / geometry().width))
  function updateZoomBox() {
    const z = effectiveZoom()
    paper.style.transform = `scale(${z})`
    zoomWrap.style.width = `${paper.offsetWidth * z}px`
    zoomWrap.style.height = `${paper.offsetHeight * z}px`
    zoomRange.value = String(Math.round(z * 100))
    zoomValue.textContent = zoom > 0 ? `${Math.round(z * 100)}%` : t('Fit')
    review?.reposition()
  }
  const setZoom = (value: number) => {
    zoom = value
    try {
      localStorage.setItem(ZOOM_KEY, String(zoom))
    } catch {
      // Storage unavailable: zoom is not remembered.
    }
    updateZoomBox()
  }
  zoomRange.addEventListener('input', () => setZoom(Number(zoomRange.value) / 100))
  zoomValue.addEventListener('click', () => setZoom(1))
  new ResizeObserver(updateZoomBox).observe(paper)
  window.addEventListener('resize', updateZoomBox)

  // ---------- Status bar ----------

  const statusPage = document.getElementById('status-page')!
  const statusWords = document.getElementById('status-words')!
  const statusChars = document.getElementById('status-chars')!
  function currentPage(): number {
    try {
      const coords = editor.view.coordsAtPos(editor.state.selection.head)
      const rect = paper.getBoundingClientRect()
      const y = (coords.top - rect.top) / effectiveZoom()
      return Math.min(layout.pages, Math.max(1, Math.floor(y / (geometry().height + 24)) + 1))
    } catch {
      return 1
    }
  }
  function updateStatus() {
    const words = editor.storage.characterCount.words() as number
    const chars = editor.storage.characterCount.characters() as number
    statusPage.textContent = t('Page {page} of {pages}', { page: currentPage(), pages: layout.pages })
    statusWords.textContent = tn(words, '{n} word', '{n} words')
    statusChars.textContent = tn(chars, '{n} character', '{n} characters')
  }
  editor.on('update', updateStatus)
  editor.on('selectionUpdate', updateStatus)

  const saveState = document.getElementById('save-state')!
  let saveTimer = 0
  doc.on('update', () => {
    saveState.textContent = t('Saving…')
    clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => (saveState.textContent = t('Saved in this browser')), 600)
  })
  saveState.textContent = t('Saved in this browser')

  // ---------- Documents ----------

  const openUrl = (id: string, key: string) => docPath('writer', id, key)
  const newDocument = () => window.open(newDocPath('writer'), '_blank')

  const fileInput = document.getElementById('file-input') as HTMLInputElement
  fileInput.accept = OPEN_ACCEPT
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file) return
    try {
      toast(t('Opening…'))
      location.href = await importFileAsDocument(file)
    } catch (err) {
      toast(t('Could not open the file: {message}', { message: (err as Error).message }))
    }
  })

  const documentData = (): DocumentData => {
    const header = yXmlFragmentToProsemirrorJSON(headerFragment) as JSONContent
    const footer = yXmlFragmentToProsemirrorJSON(footerFragment) as JSONContent
    const { body, comments } = bodyWithComments(editor, review!.collectThreads())
    return {
      title: String(meta.get('title') || UNTITLED),
      body,
      comments,
      header: headerFragment.length && !isEmptyDoc(header) ? header : null,
      footer: footerFragment.length && !isEmptyDoc(footer) ? footer : null,
      page: getPage(),
    }
  }

  async function download(format: ExportFormat) {
    try {
      const data = documentData()
      const blob = await exportFile(format, data, editor.getHTML(), editor.getText({ blockSeparator: '\n' }))
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${data.title.replace(/[\\/:*?"<>|]+/g, '_')}.${format}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    } catch (err) {
      toast(t('Download failed: {message}', { message: (err as Error).message }))
    }
  }

  const print = () => {
    // Printing uses the same page geometry as the screen at 100%.
    paper.style.transform = 'none'
    window.print()
    updateZoomBox()
  }

  // ---------- Wiring ----------

  const find = setupFindPanel(editor, document.getElementById('find-panel')!)
  const ctx: WriterContext = {
    session,
    editor,
    meta,
    getPage,
    setPage,
    setZoom,
    getZoom: () => zoom,
    find,
    newDocument,
    openFile: () => fileInput.click(),
    download,
    print,
    openUrl,
    pages: () => layout.pages,
    access,
    review,
    authorship,
    isSuggesting: () => suggestionStorage.enabled,
    setSuggesting: (on) => {
      if (!editable) return
      editor.commands.setSuggesting(on)
      updateMode()
    },
    insertEquation: async (display = false) => {
      if (!editable) return
      const { from, to } = editor.state.selection
      const value = await editEquation({ display })
      if (!value) return
      editor.chain().focus().insertContentAt({ from, to }, { type: 'equation', attrs: value }).run()
    },
    showContributions: () => void import('./authorship').then((a) => a.contributionsDialog(editor, session, authors)),
  }
  buildMenus(ctx, shell.menubar)
  buildToolbar(ctx, shell.toolbar)
  setupContextMenu(ctx)

  // Double-click on a header or footer area to edit them.
  paper.addEventListener('dblclick', (e) => {
    const target = e.target as HTMLElement
    if (editable && target.closest('.page-header, .page-footer')) import('./dialogs').then((d) => d.editHeaderFooter(ctx))
  })
  // Click on a footnote reference to edit it.
  editor.view.dom.addEventListener('click', (e) => {
    if (!editable) return
    const ref = (e.target as HTMLElement).closest('sup.footnote-ref')
    if (ref) import('./dialogs').then((d) => d.editFootnoteAt(ctx, editor.view.posAtDOM(ref, 0)))
  })
  // Double click (or Enter) on an equation edits it.
  editor.view.dom.addEventListener('equation-edit', async (e) => {
    if (!editable) return
    const { pos, latex, display } = (e as CustomEvent<EquationEditDetail>).detail
    const value = await editEquation({ latex, display })
    const node = editor.state.doc.nodeAt(pos)
    if (!value || node?.type.name !== 'equation') return
    editor.chain().focus().command(({ tr }) => {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...value })
      return true
    }).run()
  })

  // Status bar: editing mode and, on narrow screens, the comments panel.
  const statusMode = document.getElementById('status-mode')!
  const statusComments = document.getElementById('status-comments')!
  function updateMode() {
    // Read-only access is shown by the app bar badge.
    statusMode.hidden = !suggestionStorage.enabled
    statusMode.textContent = t('Suggesting')
    statusMode.className = 'status-mode suggesting'
    document.body.classList.toggle('writer-readonly', !editable)
  }
  updateMode()
  statusComments.addEventListener('click', () => {
    review!.panelOpen = !review!.panelOpen
    rail.classList.toggle('open', review!.panelOpen)
    review!.reposition()
  })
  const updateCommentsButton = () => {
    const n = review!.count
    statusComments.hidden = n === 0
    statusComments.textContent = t('Comments ({n})', { n })
  }
  editor.on('transaction', updateCommentsButton)

  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey
    if (!mod) return
    const key = e.key.toLowerCase()
    if (key === 'f' && !e.shiftKey) {
      e.preventDefault()
      find.open(false)
    } else if (key === 'h') {
      e.preventDefault()
      find.open(true)
    } else if (key === 'p') {
      e.preventDefault()
      print()
    } else if (key === 's') {
      e.preventDefault()
      toast(t('All changes are saved automatically in this browser'))
    } else if (key === 'o') {
      e.preventDefault()
      fileInput.click()
    } else if ((key === 'm' || e.code === 'KeyM') && e.altKey) {
      e.preventDefault()
      review!.startComment()
    }
  })

  // Handle for automated browser tests in development builds only.
  if (import.meta.env.DEV) (window as unknown as { editor: Editor }).editor = editor

  updateStatus()
  updateZoomBox()
  // Header/footer schema must be registered for rendering even before first use.
  void getSchema(hfExtensions)
  return ctx
}

function isEmptyDoc(json: JSONContent): boolean {
  const content = json.content ?? []
  return content.length === 0 || (content.length === 1 && content[0].type === 'paragraph' && !content[0].content?.length)
}

// Imports a Word/ODT/HTML/text file into a new local document; returns its path.
export async function importFileAsDocument(file: File): Promise<string> {
  const imported = await importFile(file)
  const title = file.name.replace(/\.[^.]+$/, '')
  const schema = getSchema(allExtensions())
  const { body, ranges } = extractCommentRanges(schema, imported.body)
  return createLocalDocument('writer', title, (ydoc) => {
    prosemirrorJSONToYXmlFragment(schema, body, ydoc.getXmlFragment('body'))
    if (imported.header && !isEmptyDoc(imported.header)) prosemirrorJSONToYXmlFragment(schema, imported.header, ydoc.getXmlFragment('header'))
    if (imported.footer && !isEmptyDoc(imported.footer)) prosemirrorJSONToYXmlFragment(schema, imported.footer, ydoc.getXmlFragment('footer'))
    ydoc.getMap<unknown>('meta').set('page', JSON.stringify(imported.page))
    // The new document has no comments channel yet: the first editor to open it moves them there.
    if (imported.comments?.length) writeImportedComments(ydoc, schema, ranges, imported.comments)
  })
}

// Body JSON for the converters, with comment ranges as `commentRange` marks
// (added in a transaction that is never applied), and the comments themselves.
function bodyWithComments(editor: Editor, threads: CommentThread[]): { body: JSONContent; comments: CommentData[] } {
  const type = editor.schema.marks.commentRange
  const tr = editor.state.tr
  const comments: CommentData[] = []
  for (const { comment, replies, range } of threads) {
    // Comments whose text was deleted have nothing to attach to.
    if (!range || range.from >= range.to) continue
    tr.addMark(range.from, range.to, type.create({ id: comment.id }))
    comments.push({ id: comment.id, author: comment.author, date: comment.time, text: comment.text, resolved: comment.resolved })
    for (const r of replies) comments.push({ id: r.id, parentId: comment.id, author: r.author, date: r.time, text: r.text })
  }
  return { body: tr.doc.toJSON() as JSONContent, comments }
}

interface CommentSpan {
  from: number
  to: number
  quote?: string
}

// Comment ranges of an imported body (commentRange marks), and the body without them.
function extractCommentRanges(schema: Schema, json: JSONContent): { body: JSONContent; ranges: Map<string, CommentSpan> } {
  const ranges = new Map<string, CommentSpan>()
  const type = schema.marks.commentRange
  let doc: PMNode
  try {
    doc = PMNode.fromJSON(schema, json)
  } catch {
    return { body: json, ranges }
  }
  let found = false
  doc.descendants((node, pos) => {
    for (const mark of node.marks) {
      if (mark.type !== type) continue
      found = true
      const id = String(mark.attrs.id)
      const r = ranges.get(id)
      ranges.set(id, { from: Math.min(r?.from ?? pos, pos), to: Math.max(r?.to ?? 0, pos + node.nodeSize) })
    }
    return true
  })
  if (!found) return { body: json, ranges }
  for (const r of ranges.values()) r.quote = doc.textBetween(r.from, r.to, ' ', '▫').slice(0, 200)
  const tr = new Transform(doc).removeMark(0, doc.content.size, type)
  return { body: tr.doc.toJSON() as JSONContent, ranges }
}

function writeImportedComments(ydoc: Y.Doc, schema: Schema, ranges: Map<string, CommentSpan>, comments: CommentData[]) {
  const map = ydoc.getMap<CommentRecord>(PENDING_COMMENTS)
  const index = new PositionIndex(ydoc.getXmlFragment('body'), schema)
  const ids = new Set(comments.map((c) => c.id))
  for (const c of comments) {
    const parent = c.parentId && ids.has(c.parentId) ? c.parentId : undefined
    const range = ranges.get(c.id)
    if (!parent && !range) continue
    const record: CommentRecord = {
      id: `i${c.id}`,
      authorId: `import:${c.author}`,
      author: c.author || t('Unknown author'),
      color: authorColor(c.author),
      time: c.date || Date.now(),
      text: c.text,
      ...(parent ? { parent: `i${parent}` } : { anchor: encodeAnchor(index, range!.from, range!.to), quote: range!.quote }),
      ...(c.resolved ? { resolved: true } : {}),
    }
    map.set(record.id, record)
  }
}

export { OPEN_ACCEPT }
