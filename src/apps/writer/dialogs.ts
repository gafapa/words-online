// Dialogs of the word processor. Loaded on demand.

import { Editor } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import { NodeSelection } from '@tiptap/pm/state'
import { Bold, Italic, Underline, TextAlignStart, TextAlignCenter, TextAlignEnd, Hash } from 'lucide'
import { headerFooterExtensions } from './editor/extensions'
import { PAGE_SIZES_MM, type PageSettings, type PageSize } from './formats/types'
import * as store from '../../core/store'
import { colorPalette, el, icon, promptText, showDialog, toast } from '../../ui/widgets'
import type { WriterContext } from './app'

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'

export async function pasteHint(): Promise<void> {
  await showDialog(
    'Use keyboard shortcuts',
    el('p', { textContent: `For security, browsers only allow clipboard access through the keyboard: ${mod}X to cut, ${mod}C to copy and ${mod}V to paste.` }),
    [{ label: 'OK', value: 'ok', primary: true }],
  )
}

export async function about(): Promise<void> {
  await showDialog(
    'Words Online',
    el(
      'div',
      {},
      el('p', { textContent: 'A collaborative word processor that runs entirely in your browser.' }),
      el('p', {
        class: 'hint',
        textContent:
          'Documents are stored in this browser. Collaborators connect directly (WebRTC); public Nostr relays are only used to find each other.',
      }),
    ),
    [{ label: 'Close', value: 'ok', primary: true }],
  )
}

export async function shortcuts(): Promise<void> {
  const rows: [string, string][] = [
    ['Bold / Italic / Underline', `${mod}B / ${mod}I / ${mod}U`],
    ['Strikethrough', `${mod}Shift+S`],
    ['Superscript / Subscript', `${mod}. / ${mod},`],
    ['Headings 1–6', `${mod}Alt+1 … 6`],
    ['Normal text', `${mod}Alt+0`],
    ['Align left / center / right / justify', `${mod}Shift+L / E / R / J`],
    ['Bulleted / numbered / checklist', `${mod}Shift+8 / 7 / 9`],
    ['Indent / outdent', 'Tab / Shift+Tab'],
    ['Line break in paragraph', 'Shift+Enter'],
    ['Page break', `${mod}Enter`],
    ['Insert link', `${mod}K`],
    ['Insert footnote', `${mod}Alt+F`],
    ['Find / replace', `${mod}F / ${mod}H`],
    ['Undo / redo', `${mod}Z / ${mod}Y`],
    ['Clear formatting', `${mod}\\`],
    ['Open file', `${mod}O`],
    ['Print', `${mod}P`],
  ]
  const table = el('table', { class: 'shortcuts' })
  for (const [label, keys] of rows) table.append(el('tr', {}, el('td', { textContent: label }), el('td', {}, el('kbd', { textContent: keys }))))
  await showDialog('Keyboard shortcuts', table, [{ label: 'Close', value: 'ok', primary: true }], true)
}

export async function wordCount(ctx: WriterContext): Promise<void> {
  const { editor } = ctx
  const { from, to, empty } = editor.state.selection
  const selected = empty ? '' : editor.state.doc.textBetween(from, to, ' ')
  const count = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0)
  const rows: [string, string][] = [
    ['Pages', String(ctx.pages())],
    ['Words', String(editor.storage.characterCount.words())],
    ['Characters', String(editor.storage.characterCount.characters())],
    ['Characters excluding spaces', String(editor.getText().replace(/\s/g, '').length)],
  ]
  if (selected) rows.push(['Words in selection', String(count(selected))])
  const table = el('table', { class: 'shortcuts' })
  for (const [k, v] of rows) table.append(el('tr', {}, el('td', { textContent: k }), el('td', { textContent: v, class: 'num' })))
  await showDialog('Word count', table, [{ label: 'Close', value: 'ok', primary: true }])
}

export async function editLink(ctx: WriterContext): Promise<void> {
  const { editor } = ctx
  const current = editor.getAttributes('link').href ?? ''
  const { from, to, empty } = editor.state.selection
  const text = el('input', { class: 'field', value: empty ? '' : editor.state.doc.textBetween(from, to, ' ') })
  const url = el('input', { class: 'field', value: current, placeholder: 'https://…' })
  const body = el('div', { class: 'form' }, el('label', { class: 'field-label' }, 'Text', text), el('label', { class: 'field-label' }, 'Link', url))
  const buttons = [
    { label: 'Cancel', value: 'cancel' },
    ...(current ? [{ label: 'Remove link', value: 'remove' }] : []),
    { label: 'Apply', value: 'ok', primary: true },
  ]
  const result = await showDialog(current ? 'Edit link' : 'Insert link', body, buttons)
  if (result === 'remove') {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  if (result !== 'ok' || !url.value.trim()) return
  const href = /^[a-z][a-z0-9+.-]*:|^#|^\//i.test(url.value.trim()) ? url.value.trim() : `https://${url.value.trim()}`
  if (empty && !current) {
    const label = text.value || href
    editor.chain().focus().insertContent({ type: 'text', text: label, marks: [{ type: 'link', attrs: { href } }] }).run()
  } else {
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
  }
}

export async function imageFromUrl(ctx: WriterContext): Promise<void> {
  const url = await promptText('Insert image', 'Image URL')
  if (url) ctx.editor.chain().focus().setImage({ src: url.trim() }).run()
}

export async function insertTableDialog(ctx: WriterContext): Promise<void> {
  const rows = el('input', { type: 'number', min: '1', max: '100', value: '3', class: 'field' })
  const cols = el('input', { type: 'number', min: '1', max: '20', value: '3', class: 'field' })
  const header = el('input', { type: 'checkbox' })
  const body = el(
    'div',
    { class: 'form grid2' },
    el('label', { class: 'field-label' }, 'Rows', rows),
    el('label', { class: 'field-label' }, 'Columns', cols),
    el('label', { class: 'check' }, header, ' Header row'),
  )
  if ((await showDialog('Insert table', body, [{ label: 'Cancel', value: 'cancel' }, { label: 'Insert', value: 'ok', primary: true }])) !== 'ok') return
  ctx.editor
    .chain()
    .focus()
    .insertTable({ rows: clamp(+rows.value, 1, 100), cols: clamp(+cols.value, 1, 20), withHeaderRow: header.checked })
    .run()
}

export async function cellBackground(ctx: WriterContext): Promise<void> {
  let picked: string | null | undefined
  const body = colorPalette((c) => {
    picked = c
    ;(body.closest('dialog') as HTMLDialogElement).close('ok')
  }, 'No fill')
  await showDialog('Cell background', body, [{ label: 'Cancel', value: 'cancel' }])
  if (picked !== undefined) ctx.editor.chain().focus().setCellAttribute('backgroundColor', picked).run()
}

export async function insertFootnote(ctx: WriterContext): Promise<void> {
  const text = await promptText('Insert footnote', 'Footnote text', '', true)
  if (text?.trim()) ctx.editor.chain().focus().insertFootnote(text.trim()).run()
}

export async function editFootnoteAt(ctx: WriterContext, pos: number): Promise<void> {
  const { editor } = ctx
  const node = editor.state.doc.nodeAt(pos)
  if (node?.type.name !== 'footnote') return
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)))
  const input = el('textarea', { class: 'field', rows: 4, value: String(node.attrs.content ?? '') })
  const result = await showDialog('Footnote', el('label', { class: 'field-label' }, 'Footnote text', input), [
    { label: 'Delete', value: 'delete' },
    { label: 'Cancel', value: 'cancel' },
    { label: 'Save', value: 'ok', primary: true },
  ])
  const current = editor.state.doc.nodeAt(pos)
  if (current?.type.name !== 'footnote') return
  if (result === 'delete') editor.chain().focus().deleteRange({ from: pos, to: pos + 1 }).run()
  else if (result === 'ok') editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { content: input.value.trim() }))
}

export async function specialCharacters(ctx: WriterContext): Promise<void> {
  const chars = '©®™°±×÷≠≤≥≈∞µ§¶†‡•…–—‘’“”«»‹›¡¿€£¥¢₽₹←↑→↓↔⇒⇔✓✗★☆♠♣♥♦αβγδεθλπσΣΩ√∑∫∂∆∇½⅓¼¾²³¹'
  const grid = el('div', { class: 'char-grid' })
  for (const ch of chars) {
    const b = el('button', { type: 'button', textContent: ch, title: `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}` })
    b.addEventListener('click', () => ctx.editor.chain().focus().insertContent(ch).run())
    grid.append(b)
  }
  await showDialog('Special characters', grid, [{ label: 'Close', value: 'ok', primary: true }])
}

export async function openDocuments(ctx: WriterContext): Promise<void> {
  const list = el('ul', { class: 'doc-list' })
  const render = () => {
    list.replaceChildren(
      ...store.listDocs().filter((d) => d.type === 'writer').map((d) => {
        const link = el('a', { href: ctx.openUrl(d.id, d.key), textContent: d.title || 'Untitled document' })
        if (d.id === ctx.session.docId) link.classList.add('current')
        const del = el('button', { type: 'button', textContent: 'Delete', disabled: d.id === ctx.session.docId })
        del.addEventListener('click', async () => {
          if (!confirm(`Delete "${link.textContent}" from this browser?`)) return
          await store.deleteDoc(d.id)
          render()
        })
        return el('li', {}, link, el('small', { textContent: new Date(d.updated).toLocaleString() }), del)
      }),
    )
  }
  render()
  await showDialog('Documents in this browser', list, [{ label: 'Close', value: 'ok', primary: true }], true)
}

export async function pageSetup(ctx: WriterContext): Promise<void> {
  const page = ctx.getPage()
  const size = el('select', { class: 'field' })
  for (const s of Object.keys(PAGE_SIZES_MM) as PageSize[]) {
    const [w, h] = PAGE_SIZES_MM[s]
    size.append(el('option', { value: s, textContent: `${s} (${w} × ${h} mm)` }))
  }
  size.value = page.size
  const orientation = el('select', { class: 'field' }, el('option', { value: 'portrait', textContent: 'Portrait' }), el('option', { value: 'landscape', textContent: 'Landscape' }))
  orientation.value = page.orientation
  const margin = (label: string, value: number) => {
    const input = el('input', { type: 'number', min: '0', max: '100', step: '0.5', value: String(value / 10), class: 'field' })
    return { input, label: el('label', { class: 'field-label' }, `${label} (cm)`, input) }
  }
  const top = margin('Top', page.margins.top)
  const bottom = margin('Bottom', page.margins.bottom)
  const left = margin('Left', page.margins.left)
  const right = margin('Right', page.margins.right)
  const body = el(
    'div',
    { class: 'form grid2' },
    el('label', { class: 'field-label' }, 'Paper size', size),
    el('label', { class: 'field-label' }, 'Orientation', orientation),
    top.label,
    bottom.label,
    left.label,
    right.label,
    el('p', { class: 'hint span2', textContent: 'Page setup applies to everyone editing this document.' }),
  )
  if ((await showDialog('Page setup', body, [{ label: 'Cancel', value: 'cancel' }, { label: 'Apply', value: 'ok', primary: true }])) !== 'ok') return
  const mm = (i: HTMLInputElement, fallback: number) => {
    const v = parseFloat(i.value)
    return Number.isFinite(v) ? clamp(v * 10, 0, 100) : fallback
  }
  const next: PageSettings = {
    size: size.value as PageSize,
    orientation: orientation.value as PageSettings['orientation'],
    margins: {
      top: mm(top.input, page.margins.top),
      bottom: mm(bottom.input, page.margins.bottom),
      left: mm(left.input, page.margins.left),
      right: mm(right.input, page.margins.right),
    },
  }
  ctx.setPage(next)
}

// Header and footer are edited in small collaborative editors bound to their own fragments.
export async function editHeaderFooter(ctx: WriterContext): Promise<void> {
  const { doc } = ctx.session
  const make = (field: string, host: HTMLElement) =>
    new Editor({
      element: host,
      extensions: [...headerFooterExtensions({ history: false, placeholder: `Type the ${field} here` }), Collaboration.configure({ document: doc, field })],
    })
  const headerHost = el('div', { class: 'hf-editor' })
  const footerHost = el('div', { class: 'hf-editor' })
  const header = make('header', headerHost)
  const footer = make('footer', footerHost)
  let focused: Editor = header
  header.on('focus', () => (focused = header))
  footer.on('focus', () => (focused = footer))

  const tool = (node: Parameters<typeof icon>[0], title: string, run: (e: Editor) => void) => {
    const b = el('button', { type: 'button', class: 'tb-btn', title }, icon(node))
    b.addEventListener('mousedown', (e) => e.preventDefault())
    b.addEventListener('click', () => run(focused))
    return b
  }
  const text = (label: string, title: string, run: (e: Editor) => void) => {
    const b = el('button', { type: 'button', class: 'tb-btn tb-text', title, textContent: label })
    b.addEventListener('mousedown', (e) => e.preventDefault())
    b.addEventListener('click', () => run(focused))
    return b
  }
  const toolbar = el(
    'div',
    { class: 'hf-toolbar' },
    tool(Bold, 'Bold', (e) => e.chain().focus().toggleBold().run()),
    tool(Italic, 'Italic', (e) => e.chain().focus().toggleItalic().run()),
    tool(Underline, 'Underline', (e) => e.chain().focus().toggleUnderline().run()),
    tool(TextAlignStart, 'Align left', (e) => e.chain().focus().setTextAlign('left').run()),
    tool(TextAlignCenter, 'Center', (e) => e.chain().focus().setTextAlign('center').run()),
    tool(TextAlignEnd, 'Align right', (e) => e.chain().focus().setTextAlign('right').run()),
    tool(Hash, 'Insert page number', (e) => e.chain().focus().insertPageNumber('page').run()),
    text('#/N', 'Insert page count', (e) => e.chain().focus().insertPageNumber('total').run()),
  )
  const clear = (editor: Editor) => {
    const b = el('button', { type: 'button', class: 'link-btn', textContent: 'Remove' })
    b.addEventListener('click', () => editor.commands.clearContent(true))
    return b
  }
  const body = el(
    'div',
    { class: 'hf-dialog' },
    toolbar,
    el('div', { class: 'hf-label' }, 'Header', clear(header)),
    headerHost,
    el('div', { class: 'hf-label' }, 'Footer', clear(footer)),
    footerHost,
    el('p', { class: 'hint', textContent: 'Shown on every page. Use # to insert the page number. Changes are shared with collaborators.' }),
  )
  const shown = showDialog('Header and footer', body, [{ label: 'Done', value: 'ok', primary: true }], true)
  header.commands.focus('end')
  await shown
  header.destroy()
  footer.destroy()
  toast('Header and footer updated')
}

function clamp(v: number, min: number, max: number): number {
  return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : min
}
