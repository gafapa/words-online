// Dialogs of the word processor. Loaded on demand.

import { Editor } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import { NodeSelection } from '@tiptap/pm/state'
import { Bold, Italic, Underline, TextAlignStart, TextAlignCenter, TextAlignEnd, Hash } from 'lucide'
import { headerFooterExtensions } from './editor/extensions'
import { PAGE_SIZES_MM, type PageSettings, type PageSize } from './formats/types'
import * as store from '../../core/store'
import { colorPalette, el, icon, promptText, shortcutLabel, showDialog, toast } from '../../ui/widgets'
import type { WriterContext } from './app'
import { locale, t } from '../../core/i18n'

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'

export async function pasteHint(): Promise<void> {
  await showDialog(
    t('Use keyboard shortcuts'),
    el('p', { textContent: t('For security, browsers only allow clipboard access through the keyboard: {cut} to cut, {copy} to copy and {paste} to paste.', { cut: `${mod}X`, copy: `${mod}C`, paste: `${mod}V` }) }),
    [{ label: t('OK'), value: 'ok', primary: true }],
  )
}

export async function about(): Promise<void> {
  await showDialog(
    'Words Online',
    el(
      'div',
      {},
      el('p', { textContent: t('A collaborative word processor that runs entirely in your browser.') }),
      el('p', {
        class: 'hint',
        textContent:
          t('Documents are stored in this browser. Collaborators connect directly (WebRTC); public Nostr relays are only used to find each other.'),
      }),
    ),
    [{ label: t('Close'), value: 'ok', primary: true }],
  )
}

export async function shortcuts(): Promise<void> {
  const rows: [string, string][] = [
    [t('Bold / Italic / Underline'), `${mod}B / ${mod}I / ${mod}U`],
    [t('Strikethrough'), `${mod}Shift+S`],
    [t('Superscript / Subscript'), `${mod}. / ${mod},`],
    [t('Headings 1–6'), `${mod}Alt+1 … 6`],
    [t('Normal text'), `${mod}Alt+0`],
    [t('Align left / center / right / justify'), `${mod}Shift+L / E / R / J`],
    [t('Bulleted / numbered / checklist'), `${mod}Shift+8 / 7 / 9`],
    [t('Indent / outdent'), 'Tab / Shift+Tab'],
    [t('Line break in paragraph'), 'Shift+Enter'],
    [t('Page break'), `${mod}Enter`],
    [t('Insert link'), `${mod}K`],
    [t('Insert footnote'), `${mod}Alt+F`],
    [t('Find / replace'), `${mod}F / ${mod}H`],
    [t('Spelling and grammar'), 'F7'],
    [t('Undo / redo'), `${mod}Z / ${mod}Y`],
    [t('Clear formatting'), `${mod}\\`],
    [t('Open file'), `${mod}O`],
    [t('Print'), `${mod}P`],
  ]
  const table = el('table', { class: 'shortcuts' })
  for (const [label, keys] of rows) table.append(el('tr', {}, el('td', { textContent: label }), el('td', {}, el('kbd', { textContent: shortcutLabel(keys) }))))
  await showDialog(t('Keyboard shortcuts'), table, [{ label: t('Close'), value: 'ok', primary: true }], true)
}

export async function wordCount(ctx: WriterContext): Promise<void> {
  const { editor } = ctx
  const { from, to, empty } = editor.state.selection
  const selected = empty ? '' : editor.state.doc.textBetween(from, to, ' ')
  const count = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0)
  const rows: [string, string][] = [
    [t('Pages'), String(ctx.pages())],
    [t('Words'), String(editor.storage.characterCount.words())],
    [t('Characters'), String(editor.storage.characterCount.characters())],
    [t('Characters excluding spaces'), String(editor.getText().replace(/\s/g, '').length)],
  ]
  if (selected) rows.push([t('Words in selection'), String(count(selected))])
  const table = el('table', { class: 'shortcuts' })
  for (const [k, v] of rows) table.append(el('tr', {}, el('td', { textContent: k }), el('td', { textContent: v, class: 'num' })))
  await showDialog(t('Word count'), table, [{ label: t('Close'), value: 'ok', primary: true }])
}

export async function editLink(ctx: WriterContext): Promise<void> {
  const { editor } = ctx
  const current = editor.getAttributes('link').href ?? ''
  const { from, to, empty } = editor.state.selection
  const text = el('input', { class: 'field', value: empty ? '' : editor.state.doc.textBetween(from, to, ' ') })
  const url = el('input', { class: 'field', value: current, placeholder: 'https://…' })
  const body = el('div', { class: 'form' }, el('label', { class: 'field-label' }, t('Text'), text), el('label', { class: 'field-label' }, t('Link'), url))
  const buttons = [
    { label: t('Cancel'), value: 'cancel' },
    ...(current ? [{ label: t('Remove link'), value: 'remove' }] : []),
    { label: t('Apply'), value: 'ok', primary: true },
  ]
  const result = await showDialog(current ? t('Edit link') : t('Insert link'), body, buttons)
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
  const url = await promptText(t('Insert image'), t('Image URL'))
  if (url) ctx.editor.chain().focus().setImage({ src: url.trim() }).run()
}

export async function insertTableDialog(ctx: WriterContext): Promise<void> {
  const rows = el('input', { type: 'number', min: '1', max: '100', value: '3', class: 'field' })
  const cols = el('input', { type: 'number', min: '1', max: '20', value: '3', class: 'field' })
  const header = el('input', { type: 'checkbox' })
  const body = el(
    'div',
    { class: 'form grid2' },
    el('label', { class: 'field-label' }, t('Rows'), rows),
    el('label', { class: 'field-label' }, t('Columns'), cols),
    el('label', { class: 'check' }, header, ' ', t('Header row')),
  )
  if ((await showDialog(t('Insert table'), body, [{ label: t('Cancel'), value: 'cancel' }, { label: t('Insert'), value: 'ok', primary: true }])) !== 'ok') return
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
  }, t('No fill'))
  await showDialog(t('Cell background'), body, [{ label: t('Cancel'), value: 'cancel' }])
  if (picked !== undefined) ctx.editor.chain().focus().setCellAttribute('backgroundColor', picked).run()
}

export async function insertFootnote(ctx: WriterContext): Promise<void> {
  const text = await promptText(t('Insert footnote'), t('Footnote text'), '', true)
  if (text?.trim()) ctx.editor.chain().focus().insertFootnote(text.trim()).run()
}

export async function editFootnoteAt(ctx: WriterContext, pos: number): Promise<void> {
  const { editor } = ctx
  const node = editor.state.doc.nodeAt(pos)
  if (node?.type.name !== 'footnote') return
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)))
  const input = el('textarea', { class: 'field', rows: 4, value: String(node.attrs.content ?? '') })
  const result = await showDialog(t('Footnote'), el('label', { class: 'field-label' }, t('Footnote text'), input), [
    { label: t('Delete'), value: 'delete' },
    { label: t('Cancel'), value: 'cancel' },
    { label: t('Save'), value: 'ok', primary: true },
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
  await showDialog(t('Special characters'), grid, [{ label: t('Close'), value: 'ok', primary: true }])
}

export async function openDocuments(ctx: WriterContext): Promise<void> {
  const list = el('ul', { class: 'doc-list' })
  const render = () => {
    list.replaceChildren(
      ...store.listDocs().filter((d) => d.type === 'writer').map((d) => {
        const link = el('a', { href: ctx.openUrl(d.id, d.key), textContent: d.title || t('Untitled document') })
        if (d.id === ctx.session.docId) link.classList.add('current')
        const del = el('button', { type: 'button', textContent: t('Delete'), disabled: d.id === ctx.session.docId })
        del.addEventListener('click', async () => {
          if (!confirm(t('Delete “{title}” from this browser?', { title: link.textContent ?? '' }))) return
          await store.deleteDoc(d.id)
          render()
        })
        return el('li', {}, link, el('small', { textContent: new Date(d.updated).toLocaleString(locale) }), del)
      }),
    )
  }
  render()
  await showDialog(t('Documents in this browser'), list, [{ label: t('Close'), value: 'ok', primary: true }], true)
}

export async function pageSetup(ctx: WriterContext): Promise<void> {
  const page = ctx.getPage()
  const size = el('select', { class: 'field' })
  for (const s of Object.keys(PAGE_SIZES_MM) as PageSize[]) {
    const [w, h] = PAGE_SIZES_MM[s]
    size.append(el('option', { value: s, textContent: `${s} (${w} × ${h} mm)` }))
  }
  size.value = page.size
  const orientation = el('select', { class: 'field' }, el('option', { value: 'portrait', textContent: t('Portrait') }), el('option', { value: 'landscape', textContent: t('Landscape') }))
  orientation.value = page.orientation
  const margin = (label: string, value: number) => {
    const input = el('input', { type: 'number', min: '0', max: '100', step: '0.5', value: String(value / 10), class: 'field' })
    return { input, label: el('label', { class: 'field-label' }, `${label} (cm)`, input) }
  }
  const top = margin(t('Top'), page.margins.top)
  const bottom = margin(t('Bottom'), page.margins.bottom)
  const left = margin(t('Left'), page.margins.left)
  const right = margin(t('Right'), page.margins.right)
  const body = el(
    'div',
    { class: 'form grid2' },
    el('label', { class: 'field-label' }, t('Paper size'), size),
    el('label', { class: 'field-label' }, t('Orientation'), orientation),
    top.label,
    bottom.label,
    left.label,
    right.label,
    el('p', { class: 'hint span2', textContent: t('Page setup applies to everyone editing this document.') }),
  )
  if ((await showDialog(t('Page setup'), body, [{ label: t('Cancel'), value: 'cancel' }, { label: t('Apply'), value: 'ok', primary: true }])) !== 'ok') return
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
      extensions: [...headerFooterExtensions({ history: false, placeholder: field === 'header' ? t('Type the header here') : t('Type the footer here') }), Collaboration.configure({ document: doc, field })],
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
    tool(Bold, t('Bold'), (e) => e.chain().focus().toggleBold().run()),
    tool(Italic, t('Italic'), (e) => e.chain().focus().toggleItalic().run()),
    tool(Underline, t('Underline'), (e) => e.chain().focus().toggleUnderline().run()),
    tool(TextAlignStart, t('Align left'), (e) => e.chain().focus().setTextAlign('left').run()),
    tool(TextAlignCenter, t('Center'), (e) => e.chain().focus().setTextAlign('center').run()),
    tool(TextAlignEnd, t('Align right'), (e) => e.chain().focus().setTextAlign('right').run()),
    tool(Hash, t('Insert page number'), (e) => e.chain().focus().insertPageNumber('page').run()),
    text('#/N', t('Insert page count'), (e) => e.chain().focus().insertPageNumber('total').run()),
  )
  const clear = (editor: Editor) => {
    const b = el('button', { type: 'button', class: 'link-btn', textContent: t('Remove') })
    b.addEventListener('click', () => editor.commands.clearContent(true))
    return b
  }
  const body = el(
    'div',
    { class: 'hf-dialog' },
    toolbar,
    el('div', { class: 'hf-label' }, t('Header'), clear(header)),
    headerHost,
    el('div', { class: 'hf-label' }, t('Footer'), clear(footer)),
    footerHost,
    el('p', { class: 'hint', textContent: t('Shown on every page. Use # to insert the page number. Changes are shared with collaborators.') }),
  )
  const shown = showDialog(t('Header and footer'), body, [{ label: t('Done'), value: 'ok', primary: true }], true)
  header.commands.focus('end')
  await shown
  header.destroy()
  footer.destroy()
  toast(t('Header and footer updated'))
}

function clamp(v: number, min: number, max: number): number {
  return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : min
}
