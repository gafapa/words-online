// Menu bar and toolbar of the word processor.

import type { Editor } from '@tiptap/core'
import {
  Baseline,
  Bold,
  ChevronDown,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link,
  List,
  ListChecks,
  ListIndentDecrease,
  ListIndentIncrease,
  ListOrdered,
  MessageSquarePlus,
  Minus,
  Plus,
  Printer,
  Redo2,
  RemoveFormatting,
  Search,
  Sigma,
  Strikethrough,
  Table,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignJustify,
  TextAlignStart,
  Underline,
  Undo2,
  type IconNode,
} from 'lucide'
import { DEFAULT_FONT, DEFAULT_FONT_SIZE_PT } from './formats/types'
import type { ParagraphStyle } from './editor/nodes'
import { closePopover, colorPalette, createMenuBar, el, icon, openPopover, showContextMenu, tableGrid, type MenuEntry } from '../../ui/widgets'
import type { WriterContext } from './app'
import { homePath } from '../../core/router'
import { t } from '../../core/i18n'
import { documentMenuItems } from '../../ui/versions'

export const FONTS = [
  'Arial',
  'Calibri',
  'Cambria',
  'Comic Sans MS',
  'Courier New',
  'Garamond',
  'Georgia',
  'Helvetica',
  'Liberation Sans',
  'Liberation Serif',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
]
const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72]
const LINE_HEIGHTS = ['1', '1.15', '1.5', '2', '2.5', '3']
const STYLES: [ParagraphStyle, string][] = [
  ['normal', 'Normal text'],
  ['title', 'Title'],
  ['subtitle', 'Subtitle'],
  ['h1', 'Heading 1'],
  ['h2', 'Heading 2'],
  ['h3', 'Heading 3'],
  ['h4', 'Heading 4'],
]
const ZOOMS = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2]

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
const mod = (k: string) => (isMac ? `⌘${k}` : `Ctrl+${k}`)

const dialogs = () => import('./dialogs')

// Marks that record review information rather than formatting.
const REVIEW_MARKS = new Set(['authorship', 'insertion', 'deletion', 'commentRange'])

export function clearFormatting(editor: Editor): void {
  editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      const { from, to, empty } = state.selection
      if (empty) tr.setStoredMarks([])
      else for (const type of Object.values(state.schema.marks)) if (!REVIEW_MARKS.has(type.name)) tr.removeMark(from, to, type)
      return true
    })
    .run()
}

// Disables document-changing items for people who cannot edit.
function guard(items: MenuEntry[], editable: () => boolean): MenuEntry[] {
  return items.map((item) => {
    if (item === '-') return item
    const enabled = item.enabled
    return {
      ...item,
      submenu: item.submenu ? guard(item.submenu, editable) : undefined,
      enabled: () => editable() && (enabled ? enabled() : true),
    }
  })
}

export function currentStyle(editor: Editor): ParagraphStyle {
  for (let level = 1; level <= 4; level++) if (editor.isActive('heading', { level })) return `h${level}` as ParagraphStyle
  const styleId = editor.getAttributes('paragraph').styleId
  return styleId === 'title' || styleId === 'subtitle' ? styleId : 'normal'
}

export function currentFontSize(editor: Editor): number {
  const size = parseFloat(editor.getAttributes('textStyle').fontSize ?? '')
  return Number.isFinite(size) ? size : DEFAULT_FONT_SIZE_PT
}

function setFontSize(editor: Editor, pt: number) {
  const size = Math.max(1, Math.min(400, Math.round(pt * 2) / 2))
  editor.chain().focus().setFontSize(`${size}pt`).run()
}

function stepFontSize(editor: Editor, dir: 1 | -1) {
  const size = currentFontSize(editor)
  const next = dir > 0 ? FONT_SIZES.find((s) => s > size) : [...FONT_SIZES].reverse().find((s) => s < size)
  setFontSize(editor, next ?? size + dir)
}

// ---------- Menus ----------

export function buildMenus(ctx: WriterContext, container: HTMLElement): void {
  const { editor } = ctx
  const run = (fn: (e: Editor) => unknown) => () => fn(editor)
  const inTable = () => editor.isActive('table')
  const can = (fn: (c: ReturnType<Editor['can']>) => boolean) => () => fn(editor.can())
  const editable = () => editor.isEditable
  const canComment = () => ctx.access !== 'view'
  const comment = () => ctx.review.startComment()

  createMenuBar(container, [
    {
      label: 'File',
      items: [
        { label: 'New document', run: ctx.newDocument },
        { label: 'All documents', run: () => (location.href = homePath()) },
        { label: 'Open file…', shortcut: mod('O'), run: ctx.openFile },
        { label: 'My documents…', run: () => dialogs().then((d) => d.openDocuments(ctx)) },
        '-',
        { label: 'Share…', run: () => document.getElementById('btn-share')!.click() },
        {
          label: 'Download',
          submenu: [
            { label: 'Word document (.docx)', run: () => ctx.download('docx') },
            { label: 'OpenDocument text (.odt)', run: () => ctx.download('odt') },
            { label: 'PDF (via Print)', run: ctx.print },
            { label: 'Web page (.html)', run: () => ctx.download('html') },
            { label: 'Plain text (.txt)', run: () => ctx.download('txt') },
          ],
        },
        '-',
        ...documentMenuItems(ctx.session),
        '-',
        { label: 'Page setup…', run: () => dialogs().then((d) => d.pageSetup(ctx)), enabled: editable },
        { label: 'Print', shortcut: mod('P'), run: ctx.print },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: mod('Z'), run: run((e) => e.chain().focus().undo().run()), enabled: () => editable() && editor.can().undo() },
        { label: 'Redo', shortcut: mod('Y'), run: run((e) => e.chain().focus().redo().run()), enabled: () => editable() && editor.can().redo() },
        '-',
        { label: 'Cut', shortcut: mod('X'), run: () => clipboardCommand(editor, 'cut'), enabled: editable },
        { label: 'Copy', shortcut: mod('C'), run: () => clipboardCommand(editor, 'copy') },
        { label: 'Paste', shortcut: mod('V'), run: () => dialogs().then((d) => d.pasteHint()), enabled: editable },
        '-',
        { label: 'Select all', shortcut: mod('A'), run: run((e) => e.chain().focus().selectAll().run()) },
        '-',
        { label: 'Find', shortcut: mod('F'), run: () => ctx.find.open(false) },
        { label: 'Find and replace', shortcut: mod('H'), run: () => ctx.find.open(true), enabled: editable },
      ],
    },
    {
      label: 'View',
      items: [
        {
          label: 'Zoom',
          submenu: [
            ...ZOOMS.map((z) => ({ label: `${z * 100}%`, run: () => ctx.setZoom(z), active: () => ctx.getZoom() === z })),
            { label: 'Fit to width', run: () => ctx.setZoom(0), active: () => ctx.getZoom() === 0 },
          ],
        },
        { label: 'Word count…', run: () => dialogs().then((d) => d.wordCount(ctx)) },
        '-',
        { label: t('Show authorship'), run: () => ctx.authorship.toggle(), active: () => ctx.authorship.enabled },
        { label: t('Contributions…'), run: ctx.showContributions },
        { label: t('Show resolved comments'), run: () => toggleResolved(ctx), active: () => ctx.review.showResolved },
      ],
    },
    {
      label: 'Insert',
      items: [
        { label: t('Comment'), shortcut: isMac ? '⌥⌘M' : 'Ctrl+Alt+M', run: comment, enabled: canComment },
        '-',
        ...guard(
          [
            { label: t('Equation…'), run: () => ctx.insertEquation(false) },
            { label: t('Display equation…'), run: () => ctx.insertEquation(true) },
            '-',
            { label: 'Image from file…', run: () => pickImage(editor) },
            { label: 'Image from URL…', run: () => dialogs().then((d) => d.imageFromUrl(ctx)) },
            { label: 'Table…', run: () => dialogs().then((d) => d.insertTableDialog(ctx)) },
            { label: 'Link…', shortcut: mod('K'), run: () => dialogs().then((d) => d.editLink(ctx)) },
            '-',
            { label: 'Footnote…', shortcut: isMac ? '⌥⌘F' : 'Ctrl+Alt+F', run: () => dialogs().then((d) => d.insertFootnote(ctx)) },
            { label: 'Header and footer…', run: () => dialogs().then((d) => d.editHeaderFooter(ctx)) },
            '-',
            { label: 'Page break', shortcut: mod('Enter'), run: run((e) => e.chain().focus().setPageBreak().run()) },
            { label: 'Horizontal line', run: run((e) => e.chain().focus().setHorizontalRule().run()) },
            { label: 'Special character…', run: () => dialogs().then((d) => d.specialCharacters(ctx)) },
          ],
          editable,
        ),
      ],
    },
    {
      label: 'Format',
      items: guard([
        {
          label: 'Text',
          submenu: [
            { label: 'Bold', shortcut: mod('B'), run: run((e) => e.chain().focus().toggleBold().run()), active: () => editor.isActive('bold') },
            { label: 'Italic', shortcut: mod('I'), run: run((e) => e.chain().focus().toggleItalic().run()), active: () => editor.isActive('italic') },
            { label: 'Underline', shortcut: mod('U'), run: run((e) => e.chain().focus().toggleUnderline().run()), active: () => editor.isActive('underline') },
            { label: 'Strikethrough', shortcut: mod('Shift+S'), run: run((e) => e.chain().focus().toggleStrike().run()), active: () => editor.isActive('strike') },
            { label: 'Superscript', shortcut: mod('.'), run: run((e) => e.chain().focus().toggleSuperscript().run()), active: () => editor.isActive('superscript') },
            { label: 'Subscript', shortcut: mod(','), run: run((e) => e.chain().focus().toggleSubscript().run()), active: () => editor.isActive('subscript') },
            { label: 'Code', shortcut: mod('E'), run: run((e) => e.chain().focus().toggleCode().run()), active: () => editor.isActive('code') },
          ],
        },
        {
          label: 'Paragraph styles',
          submenu: STYLES.map(([id, label]) => ({
            label,
            run: run((e) => e.commands.setParagraphStyle(id)),
            active: () => currentStyle(editor) === id,
          })),
        },
        {
          label: 'Align',
          submenu: (['left', 'center', 'right', 'justify'] as const).map((a) => ({
            label: a[0].toUpperCase() + a.slice(1),
            shortcut: mod(`Shift+${{ left: 'L', center: 'E', right: 'R', justify: 'J' }[a]}`),
            run: run((e) => e.chain().focus().setTextAlign(a).run()),
            active: () => editor.isActive({ textAlign: a }),
          })),
        },
        {
          label: 'Line spacing',
          submenu: LINE_HEIGHTS.map((h) => ({
            label: h === '1' ? 'Single' : h === '2' ? 'Double' : h,
            run: run((e) => e.chain().focus().setLineHeight(h === '1.15' ? null : h).run()),
            active: () => (editor.getAttributes('paragraph').lineHeight ?? editor.getAttributes('heading').lineHeight ?? '1.15') === h,
          })),
        },
        {
          label: 'Lists',
          submenu: [
            { label: 'Bulleted list', shortcut: mod('Shift+8'), run: run((e) => e.chain().focus().toggleBulletList().run()), active: () => editor.isActive('bulletList') },
            { label: 'Numbered list', shortcut: mod('Shift+7'), run: run((e) => e.chain().focus().toggleOrderedList().run()), active: () => editor.isActive('orderedList') },
            { label: 'Checklist', shortcut: mod('Shift+9'), run: run((e) => e.chain().focus().toggleTaskList().run()), active: () => editor.isActive('taskList') },
          ],
        },
        { label: 'Increase indent', shortcut: 'Tab', run: () => indent(editor, 1) },
        { label: 'Decrease indent', shortcut: 'Shift+Tab', run: () => indent(editor, -1) },
        '-',
        { label: 'Quote', run: run((e) => e.chain().focus().toggleBlockquote().run()), active: () => editor.isActive('blockquote') },
        { label: 'Code block', run: run((e) => e.chain().focus().toggleCodeBlock().run()), active: () => editor.isActive('codeBlock') },
        '-',
        { label: 'Clear formatting', shortcut: mod('\\'), run: () => { clearFormatting(editor); editor.chain().focus().clearNodes().run() } },
      ], editable),
    },
    {
      label: 'Table',
      items: guard([
        { label: 'Insert table…', run: () => dialogs().then((d) => d.insertTableDialog(ctx)), enabled: () => !inTable() },
        '-',
        { label: 'Insert row above', run: run((e) => e.chain().focus().addRowBefore().run()), enabled: inTable },
        { label: 'Insert row below', run: run((e) => e.chain().focus().addRowAfter().run()), enabled: inTable },
        { label: 'Insert column left', run: run((e) => e.chain().focus().addColumnBefore().run()), enabled: inTable },
        { label: 'Insert column right', run: run((e) => e.chain().focus().addColumnAfter().run()), enabled: inTable },
        '-',
        { label: 'Delete row', run: run((e) => e.chain().focus().deleteRow().run()), enabled: inTable },
        { label: 'Delete column', run: run((e) => e.chain().focus().deleteColumn().run()), enabled: inTable },
        { label: 'Delete table', run: run((e) => e.chain().focus().deleteTable().run()), enabled: inTable },
        '-',
        { label: 'Merge cells', run: run((e) => e.chain().focus().mergeCells().run()), enabled: can((c) => c.mergeCells()) },
        { label: 'Split cell', run: run((e) => e.chain().focus().splitCell().run()), enabled: can((c) => c.splitCell()) },
        { label: 'Header row', run: run((e) => e.chain().focus().toggleHeaderRow().run()), enabled: inTable },
        { label: 'Cell background…', run: () => dialogs().then((d) => d.cellBackground(ctx)), enabled: inTable },
      ], editable),
    },
    {
      label: t('Review'),
      items: [
        { label: t('Comment'), shortcut: isMac ? '⌥⌘M' : 'Ctrl+Alt+M', run: comment, enabled: canComment },
        { label: t('Suggest changes'), run: () => ctx.setSuggesting(!ctx.isSuggesting()), active: ctx.isSuggesting, enabled: editable },
        '-',
        { label: t('Next comment or suggestion'), run: () => ctx.review.step(1) },
        { label: t('Previous comment or suggestion'), run: () => ctx.review.step(-1) },
        { label: t('Accept all suggestions'), run: run((e) => e.commands.acceptAllSuggestions()), enabled: editable },
        { label: t('Reject all suggestions'), run: run((e) => e.commands.rejectAllSuggestions()), enabled: editable },
        '-',
        { label: t('Show resolved comments'), run: () => toggleResolved(ctx), active: () => ctx.review.showResolved },
        { label: t('Show authorship'), run: () => ctx.authorship.toggle(), active: () => ctx.authorship.enabled },
        { label: t('Contributions…'), run: ctx.showContributions },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'Keyboard shortcuts', shortcut: mod('/'), run: () => dialogs().then((d) => d.shortcuts()) },
        { label: 'About Words Online', run: () => dialogs().then((d) => d.about()) },
      ],
    },
  ] as { label: string; items: MenuEntry[] }[])

  document.addEventListener('keydown', (e) => {
    const modKey = e.ctrlKey || e.metaKey
    if (modKey && e.key === '/') {
      e.preventDefault()
      dialogs().then((d) => d.shortcuts())
    } else if (modKey && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      if (editor.isEditable) dialogs().then((d) => d.editLink(ctx))
    } else if (modKey && e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      if (editor.isEditable) dialogs().then((d) => d.insertFootnote(ctx))
    } else if (modKey && e.key === '\\') {
      e.preventDefault()
      if (editor.isEditable) clearFormatting(editor)
    }
  })
}

function toggleResolved(ctx: WriterContext) {
  ctx.review.showResolved = !ctx.review.showResolved
  ctx.review.refresh()
}

function indent(editor: Editor, dir: 1 | -1) {
  const chain = editor.chain().focus()
  if (editor.isActive('listItem')) (dir > 0 ? chain.sinkListItem('listItem') : chain.liftListItem('listItem')).run()
  else if (editor.isActive('taskItem')) (dir > 0 ? chain.sinkListItem('taskItem') : chain.liftListItem('taskItem')).run()
  else (dir > 0 ? chain.indent() : chain.outdent()).run()
}

function clipboardCommand(editor: Editor, command: 'cut' | 'copy') {
  editor.commands.focus()
  if (!document.execCommand(command)) import('./dialogs').then((d) => d.pasteHint())
}

export function pickImage(editor: Editor): void {
  const input = document.getElementById('image-input') as HTMLInputElement
  input.onchange = () => {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => editor.chain().focus().setImage({ src: String(reader.result) }).run()
    reader.readAsDataURL(file)
  }
  input.click()
}

// ---------- Toolbar ----------

export function buildToolbar(ctx: WriterContext, container: HTMLElement): void {
  const { editor } = ctx
  const updaters: (() => void)[] = []
  const group = (...items: HTMLElement[]) => container.append(el('div', { class: 'tb-group' }, ...items))

  const button = (node: IconNode, title: string, action: () => void, active?: () => boolean, enabled?: () => boolean) => {
    const b = el('button', { type: 'button', class: 'tb-btn', title }, icon(node))
    b.setAttribute('aria-label', title)
    b.addEventListener('mousedown', (e) => e.preventDefault())
    b.addEventListener('click', action)
    if (active || enabled) {
      updaters.push(() => {
        if (active) b.classList.toggle('active', active())
        if (enabled) b.disabled = !enabled()
      })
    }
    return b
  }

  const select = <T extends string>(title: string, options: [T, string][], value: () => T, onChange: (v: T) => void, cls = '') => {
    const s = el('select', { class: `tb-select ${cls}`, title })
    s.setAttribute('aria-label', title)
    for (const [v, label] of options) s.append(el('option', { value: v, textContent: label }))
    s.addEventListener('change', () => {
      onChange(s.value as T)
      editor.commands.focus()
    })
    updaters.push(() => {
      if (document.activeElement !== s) s.value = value()
    })
    return s
  }

  group(
    button(Undo2, `Undo (${mod('Z')})`, () => editor.chain().focus().undo().run(), undefined, () => editor.isEditable && editor.can().undo()),
    button(Redo2, `Redo (${mod('Y')})`, () => editor.chain().focus().redo().run(), undefined, () => editor.isEditable && editor.can().redo()),
    button(Printer, `Print (${mod('P')})`, ctx.print),
    button(Search, `Find and replace (${mod('F')})`, () => ctx.find.open(true)),
  )

  group(
    select(
      'Zoom',
      [...ZOOMS.map((z) => [String(z), `${z * 100}%`] as [string, string]), ['0', 'Fit']],
      () => String(ctx.getZoom()),
      (v) => ctx.setZoom(Number(v)),
      'tb-zoom',
    ),
  )

  group(select('Paragraph style', STYLES, () => currentStyle(editor), (v) => editor.commands.setParagraphStyle(v), 'tb-style'))

  const fontOptions = FONTS.map((f) => [f, f] as [string, string])
  const fontSelect = select(
    'Font',
    fontOptions,
    () => editor.getAttributes('textStyle').fontFamily ?? DEFAULT_FONT,
    (v) => (v === DEFAULT_FONT ? editor.chain().focus().unsetFontFamily().run() : editor.chain().focus().setFontFamily(v).run()),
    'tb-font',
  )
  // Fonts coming from imported documents are added to the list on the fly.
  updaters.unshift(() => {
    const family = editor.getAttributes('textStyle').fontFamily
    if (family && ![...fontSelect.options].some((o) => o.value === family)) fontSelect.append(el('option', { value: family, textContent: family }))
  })
  group(fontSelect)

  const sizeInput = el('input', { class: 'tb-size', title: 'Font size', inputMode: 'decimal' })
  sizeInput.setAttribute('aria-label', 'Font size')
  const sizeList = el('datalist', { id: 'font-sizes' })
  FONT_SIZES.forEach((s) => sizeList.append(el('option', { value: String(s) })))
  sizeInput.setAttribute('list', 'font-sizes')
  sizeInput.addEventListener('change', () => {
    const v = parseFloat(sizeInput.value)
    if (Number.isFinite(v)) setFontSize(editor, v)
  })
  sizeInput.addEventListener('keydown', (e) => e.key === 'Enter' && sizeInput.dispatchEvent(new Event('change')))
  updaters.push(() => {
    if (document.activeElement !== sizeInput) sizeInput.value = String(currentFontSize(editor))
  })
  group(button(Minus, 'Decrease font size', () => stepFontSize(editor, -1)), sizeInput, sizeList, button(Plus, 'Increase font size', () => stepFontSize(editor, 1)))

  const colorButton = (node: IconNode, title: string, current: () => string | undefined, apply: (c: string | null) => void, resetLabel: string) => {
    const b = el('button', { type: 'button', class: 'tb-btn tb-color', title }, icon(node), el('span', { class: 'tb-color-bar' }), icon(ChevronDown, 12))
    b.setAttribute('aria-label', title)
    b.addEventListener('mousedown', (e) => e.preventDefault())
    b.addEventListener('click', () => openPopover(b, colorPalette(apply, resetLabel)))
    const bar = b.querySelector<HTMLElement>('.tb-color-bar')!
    updaters.push(() => (bar.style.background = current() ?? 'transparent'))
    return b
  }

  group(
    button(Bold, `Bold (${mod('B')})`, () => editor.chain().focus().toggleBold().run(), () => editor.isActive('bold')),
    button(Italic, `Italic (${mod('I')})`, () => editor.chain().focus().toggleItalic().run(), () => editor.isActive('italic')),
    button(Underline, `Underline (${mod('U')})`, () => editor.chain().focus().toggleUnderline().run(), () => editor.isActive('underline')),
    button(Strikethrough, 'Strikethrough', () => editor.chain().focus().toggleStrike().run(), () => editor.isActive('strike')),
    colorButton(
      Baseline,
      'Text color',
      () => editor.getAttributes('textStyle').color ?? '#000000',
      (c) => (c ? editor.chain().focus().setColor(c).run() : editor.chain().focus().unsetColor().run()),
      'Automatic',
    ),
    colorButton(
      Highlighter,
      'Highlight color',
      () => editor.getAttributes('highlight').color,
      (c) => (c ? editor.chain().focus().setHighlight({ color: c }).run() : editor.chain().focus().unsetHighlight().run()),
      'None',
    ),
  )

  const tableButton = el('button', { type: 'button', class: 'tb-btn', title: 'Insert table' }, icon(Table))
  tableButton.addEventListener('mousedown', (e) => e.preventDefault())
  tableButton.addEventListener('click', () =>
    openPopover(tableButton, tableGrid((rows, cols) => editor.chain().focus().insertTable({ rows, cols, withHeaderRow: false }).run())),
  )
  group(
    button(Link, `Insert link (${mod('K')})`, () => dialogs().then((d) => d.editLink(ctx)), () => editor.isActive('link')),
    button(ImageIcon, 'Insert image', () => pickImage(editor)),
    tableButton,
  )

  group(
    button(TextAlignStart, 'Align left', () => editor.chain().focus().setTextAlign('left').run(), () => editor.isActive({ textAlign: 'left' })),
    button(TextAlignCenter, 'Center', () => editor.chain().focus().setTextAlign('center').run(), () => editor.isActive({ textAlign: 'center' })),
    button(TextAlignEnd, 'Align right', () => editor.chain().focus().setTextAlign('right').run(), () => editor.isActive({ textAlign: 'right' })),
    button(TextAlignJustify, 'Justify', () => editor.chain().focus().setTextAlign('justify').run(), () => editor.isActive({ textAlign: 'justify' })),
  )

  const spacingButton = el('button', { type: 'button', class: 'tb-btn tb-text', title: 'Line spacing', textContent: '↕' })
  spacingButton.addEventListener('mousedown', (e) => e.preventDefault())
  spacingButton.addEventListener('click', () => {
    const list = el('div', { class: 'menu-list' })
    for (const h of LINE_HEIGHTS) {
      const item = el('button', { type: 'button', class: 'menu-row', textContent: h === '1' ? 'Single' : h === '2' ? 'Double' : h })
      item.addEventListener('mousedown', (e) => e.preventDefault())
      item.addEventListener('click', () => {
        closePopover()
        editor.chain().focus().setLineHeight(h === '1.15' ? null : h).run()
      })
      list.append(item)
    }
    openPopover(spacingButton, list)
  })

  group(
    spacingButton,
    button(List, 'Bulleted list', () => editor.chain().focus().toggleBulletList().run(), () => editor.isActive('bulletList')),
    button(ListOrdered, 'Numbered list', () => editor.chain().focus().toggleOrderedList().run(), () => editor.isActive('orderedList')),
    button(ListChecks, 'Checklist', () => editor.chain().focus().toggleTaskList().run(), () => editor.isActive('taskList')),
    button(ListIndentDecrease, 'Decrease indent', () => indent(editor, -1)),
    button(ListIndentIncrease, 'Increase indent', () => indent(editor, 1)),
  )

  group(button(RemoveFormatting, `Clear formatting (${mod('\\')})`, () => clearFormatting(editor)))

  group(
    button(Sigma, t('Insert equation'), () => ctx.insertEquation(false)),
  )

  // Review tools stay available to commenters.
  const review = el('div', { class: 'tb-group tb-review' })
  const commentButton = button(MessageSquarePlus, `${t('Comment')} (${isMac ? '⌥⌘M' : 'Ctrl+Alt+M'})`, () => ctx.review.startComment())
  commentButton.disabled = ctx.access === 'view'
  review.append(commentButton)
  if (ctx.access === 'edit') {
    const mode = select(
      t('Mode'),
      [
        ['editing', t('Editing')],
        ['suggesting', t('Suggesting')],
      ],
      () => (ctx.isSuggesting() ? 'suggesting' : 'editing'),
      (v) => ctx.setSuggesting(v === 'suggesting'),
      'tb-mode',
    )
    review.append(mode)
  }
  container.append(review)
  if (ctx.access !== 'edit') container.classList.add('readonly')

  const refresh = () => updaters.forEach((u) => u())
  editor.on('transaction', refresh)
  refresh()
}

// ---------- Context menu ----------

export function setupContextMenu(ctx: WriterContext): void {
  const { editor } = ctx
  editor.view.dom.addEventListener('contextmenu', (e) => {
    // Keep the native menu (spelling suggestions) when Shift is held.
    if (e.shiftKey) return
    e.preventDefault()
    const pos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })
    const { from, to } = editor.state.selection
    if (editor.isEditable && pos && (pos.pos < from || pos.pos > to)) editor.commands.setTextSelection(pos.pos)
    if (!editor.isEditable) {
      const sel = window.getSelection()
      const hasText = !editor.state.selection.empty || (!!sel && !sel.isCollapsed)
      showContextMenu(e.clientX, e.clientY, [
        { label: 'Copy', shortcut: mod('C'), run: () => clipboardCommand(editor, 'copy'), enabled: () => hasText },
        { label: t('Comment'), shortcut: isMac ? '⌥⌘M' : 'Ctrl+Alt+M', run: () => ctx.review.startComment(), enabled: () => hasText && ctx.access !== 'view' },
      ])
      return
    }
    const items: MenuEntry[] = [
      { label: t('Comment'), shortcut: isMac ? '⌥⌘M' : 'Ctrl+Alt+M', run: () => ctx.review.startComment(), enabled: () => !editor.state.selection.empty },
      '-',
      { label: 'Cut', shortcut: mod('X'), run: () => clipboardCommand(editor, 'cut'), enabled: () => !editor.state.selection.empty },
      { label: 'Copy', shortcut: mod('C'), run: () => clipboardCommand(editor, 'copy'), enabled: () => !editor.state.selection.empty },
      { label: 'Paste', shortcut: mod('V'), run: () => dialogs().then((d) => d.pasteHint()) },
      '-',
      editor.isActive('link')
        ? { label: 'Edit link…', run: () => dialogs().then((d) => d.editLink(ctx)) }
        : { label: 'Insert link…', shortcut: mod('K'), run: () => dialogs().then((d) => d.editLink(ctx)) },
      ...(editor.isActive('link') ? [{ label: 'Remove link', run: () => editor.chain().focus().extendMarkRange('link').unsetLink().run() }] : []),
      { label: 'Insert footnote…', run: () => dialogs().then((d) => d.insertFootnote(ctx)) },
    ]
    if (editor.isActive('table')) {
      items.push(
        '-',
        { label: 'Insert row above', run: () => editor.chain().focus().addRowBefore().run() },
        { label: 'Insert row below', run: () => editor.chain().focus().addRowAfter().run() },
        { label: 'Insert column left', run: () => editor.chain().focus().addColumnBefore().run() },
        { label: 'Insert column right', run: () => editor.chain().focus().addColumnAfter().run() },
        { label: 'Delete row', run: () => editor.chain().focus().deleteRow().run() },
        { label: 'Delete column', run: () => editor.chain().focus().deleteColumn().run() },
        { label: 'Merge cells', run: () => editor.chain().focus().mergeCells().run(), enabled: () => editor.can().mergeCells() },
        { label: 'Split cell', run: () => editor.chain().focus().splitCell().run(), enabled: () => editor.can().splitCell() },
        { label: 'Cell background…', run: () => dialogs().then((d) => d.cellBackground(ctx)) },
        { label: 'Delete table', run: () => editor.chain().focus().deleteTable().run() },
      )
    }
    items.push('-', { label: 'Clear formatting', shortcut: mod('\\'), run: () => clearFormatting(editor) })
    showContextMenu(e.clientX, e.clientY, items)
  })
}
