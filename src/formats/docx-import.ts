// Word (.docx) import: parses WordprocessingML into the ProseMirror document model.

import type { JSONContent } from '@tiptap/core'
import JSZip from 'jszip'
import { DEFAULT_PAGE, PAGE_SIZES_MM, type ImportedDocument, type PageSettings, type PageSize } from './types'
import { attr, bytesToDataUrl, child, children, mimeFromPath, parseXml, toHex } from './util'

const TWIPS_PER_INDENT = 720
const TWIPS_PER_MM = 1440 / 25.4
const EMU_PER_PX = 9525

// Word highlight names (w:highlight) to hex.
const HIGHLIGHT: Record<string, string> = {
  yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000',
  darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000',
  darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000', white: '#ffffff',
}
const MONOSPACE = /^(courier( new)?|consolas|liberation mono|dejavu sans mono|source code pro|menlo|monaco|lucida console|noto (sans )?mono|monospace|cascadia (code|mono)|fira (code|mono)|roboto mono)$/i
const LINK_COLORS = ['#0563c1', '#0000ff', '#000080', '#0000ee', '#467886']
const TASK_UNCHECKED = /[☐]/
const TASK_CHECKED = /[☑☒]/

interface StyleDef {
  name: string
  basedOn?: string
  pPr: Element | null
  rPr: Element | null
}

interface LevelDef {
  format: string
  text: string
  start: number
}

interface NumDef {
  abstractId: string
  starts: Map<number, number>
}

// A package part (document, header, footer, notes) with its relationships.
interface Part {
  path: string
  rels: Map<string, string>
}

interface Context {
  zip: JSZip
  styles: Map<string, StyleDef>
  docDefaults: Element | null
  themeFonts: { major?: string; minor?: string }
  abstracts: Map<string, Map<number, LevelDef>>
  nums: Map<string, NumDef>
  // Running list counters per abstract numbering, and numId:level pairs already used.
  counters: Map<string, number[]>
  usedNums: Set<string>
  notes: Map<string, string>
  images: Map<string, { src: string; width: number; height: number } | null>
  defaultFont?: string
  defaultSize?: number
}

type Kind = 'heading' | 'title' | 'subtitle' | 'quote' | 'code' | 'hr' | 'listContinue' | 'tableHeading' | 'separator' | null

// A converted paragraph (or table) before lists, quotes and code blocks are assembled.
interface Item {
  node: JSONContent
  // group: abstract numbering; restart: numbering restarted by a num override.
  list?: { kind: 'bullet' | 'ordered' | 'task'; level: number; group: string; restart: boolean; value: number; checked: boolean }
  // List continuation paragraph at this list level.
  cont?: number
  quote?: boolean
  code?: boolean
}

interface RunProps {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  sub?: boolean
  sup?: boolean
  color?: string
  highlight?: string
  font?: string
  size?: number
  code?: boolean
}

export async function importDocx(file: ArrayBuffer): Promise<ImportedDocument> {
  const zip = await JSZip.loadAsync(file)
  const read = async (path: string) => (await zip.file(path)?.async('text')) ?? null
  const documentXml = await read('word/document.xml')
  if (!documentXml) throw new Error('Not a Word document')

  const stylesRoot = xmlRoot(await read('word/styles.xml'))
  const ctx: Context = {
    zip,
    styles: parseStyles(stylesRoot),
    docDefaults: stylesRoot?.getElementsByTagNameNS('*', 'docDefaults')[0] ?? null,
    themeFonts: parseTheme(xmlRoot(await read('word/theme/theme1.xml'))),
    abstracts: new Map(),
    nums: new Map(),
    counters: new Map(),
    usedNums: new Set(),
    notes: new Map(),
    images: new Map(),
  }
  parseNumbering(xmlRoot(await read('word/numbering.xml')), ctx)
  parseNotes(xmlRoot(await read('word/footnotes.xml')), 'footnote', ctx)
  parseNotes(xmlRoot(await read('word/endnotes.xml')), 'endnote', ctx)
  const defaults = resolveRun([rPrOf(ctx.docDefaults), ...chain('Normal', ctx).map((s) => s.rPr).reverse()], ctx)
  ctx.defaultFont = defaults.font
  ctx.defaultSize = defaults.size

  const docPart: Part = { path: 'word/document.xml', rels: await readRels(zip, 'word/document.xml') }
  const body = child(parseXml(documentXml).documentElement, 'body')
  const content = body ? await blockContent(body, ctx, docPart) : []

  // The last section's properties define the page and the default header/footer.
  const sectPr = child(body, 'sectPr') ?? [...(body?.getElementsByTagNameNS('*', 'sectPr') ?? [])].pop() ?? null
  return {
    body: { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] },
    header: await headerFooter(sectPr, 'headerReference', docPart, ctx),
    footer: await headerFooter(sectPr, 'footerReference', docPart, ctx),
    page: pageSettings(sectPr),
  }
}

function xmlRoot(xml: string | null): Element | null {
  return xml ? parseXml(xml).documentElement : null
}

async function readRels(zip: JSZip, partPath: string): Promise<Map<string, string>> {
  const dir = partPath.slice(0, partPath.lastIndexOf('/') + 1)
  const name = partPath.slice(dir.length)
  const rels = new Map<string, string>()
  const root = xmlRoot((await zip.file(`${dir}_rels/${name}.rels`)?.async('text')) ?? null)
  if (!root) return rels
  for (const r of children(root, 'Relationship')) {
    const target = attr(r, 'Target') ?? ''
    const external = attr(r, 'TargetMode') === 'External'
    rels.set(attr(r, 'Id') ?? '', external || /^[a-z]+:/i.test(target) ? target : resolvePath(dir, target))
  }
  return rels
}

function resolvePath(dir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = (dir + target).split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '..') out.pop()
    else if (p !== '.') out.push(p)
  }
  return out.join('/')
}

async function headerFooter(sectPr: Element | null, refName: string, docPart: Part, ctx: Context): Promise<JSONContent | null> {
  if (!sectPr) return null
  const ref = children(sectPr, refName).find((r) => (attr(r, 'type') ?? 'default') === 'default')
  const path = ref ? docPart.rels.get(attr(ref, 'id') ?? '') : undefined
  const xml = path ? await ctx.zip.file(path)?.async('text') : undefined
  if (!path || !xml) return null
  const part: Part = { path, rels: await readRels(ctx.zip, path) }
  const content = await blockContent(parseXml(xml).documentElement, ctx, part)
  const empty = content.every((n) => n.type === 'paragraph' && !n.content?.length)
  return empty ? null : { type: 'doc', content }
}

function pageSettings(sectPr: Element | null): PageSettings {
  const pgSz = child(sectPr, 'pgSz')
  const pgMar = child(sectPr, 'pgMar')
  if (!pgSz && !pgMar) return structuredClone(DEFAULT_PAGE)
  const w = Number(attr(pgSz, 'w')) / TWIPS_PER_MM
  const h = Number(attr(pgSz, 'h')) / TWIPS_PER_MM
  let size: PageSize = DEFAULT_PAGE.size
  let orientation: PageSettings['orientation'] = 'portrait'
  if (w > 0 && h > 0) {
    const [short, long] = [Math.min(w, h), Math.max(w, h)]
    let best = Infinity
    for (const [name, [pw, ph]] of Object.entries(PAGE_SIZES_MM) as [PageSize, [number, number]][]) {
      const diff = Math.max(Math.abs(pw - short), Math.abs(ph - long))
      if (diff <= 3 && diff < best) {
        best = diff
        size = name
      }
    }
    orientation = attr(pgSz, 'orient') === 'landscape' || w > h ? 'landscape' : 'portrait'
  }
  const mm = (name: string, fallback: number) => {
    const v = Number(attr(pgMar, name))
    return pgMar && Number.isFinite(v) && attr(pgMar, name) !== null ? Math.round((Math.abs(v) / TWIPS_PER_MM) * 10) / 10 : fallback
  }
  const d = DEFAULT_PAGE.margins
  return {
    size,
    orientation,
    margins: { top: mm('top', d.top), right: mm('right', d.right), bottom: mm('bottom', d.bottom), left: mm('left', d.left) },
  }
}

// ---- Styles, numbering, notes ----

function parseStyles(root: Element | null): Map<string, StyleDef> {
  const styles = new Map<string, StyleDef>()
  if (!root) return styles
  for (const s of children(root, 'style')) {
    const id = attr(s, 'styleId')
    if (!id) continue
    styles.set(id, {
      name: (attr(child(s, 'name'), 'val') ?? id).toLowerCase(),
      basedOn: attr(child(s, 'basedOn'), 'val') ?? undefined,
      pPr: child(s, 'pPr'),
      rPr: child(s, 'rPr'),
    })
  }
  return styles
}

function parseTheme(root: Element | null): Context['themeFonts'] {
  if (!root) return {}
  const latin = (name: string) => {
    const font = root.getElementsByTagNameNS('*', name)[0]
    return attr(child(font, 'latin'), 'typeface') || undefined
  }
  return { major: latin('majorFont'), minor: latin('minorFont') }
}

function parseNumbering(root: Element | null, ctx: Context) {
  if (!root) return
  for (const a of children(root, 'abstractNum')) {
    const levels = new Map<number, LevelDef>()
    for (const lvl of children(a, 'lvl')) {
      levels.set(Number(attr(lvl, 'ilvl')), {
        format: attr(child(lvl, 'numFmt'), 'val') ?? 'decimal',
        text: attr(child(lvl, 'lvlText'), 'val') ?? '',
        start: Number(attr(child(lvl, 'start'), 'val') ?? 1),
      })
    }
    ctx.abstracts.set(attr(a, 'abstractNumId') ?? '', levels)
  }
  for (const num of children(root, 'num')) {
    const starts = new Map<number, number>()
    for (const o of children(num, 'lvlOverride')) {
      const start = attr(child(o, 'startOverride'), 'val')
      if (start !== null) starts.set(Number(attr(o, 'ilvl') ?? 0), Number(start))
      // A full level redefinition inside the override also sets the start.
      const lvlStart = attr(child(child(o, 'lvl'), 'start'), 'val')
      if (start === null && lvlStart !== null) starts.set(Number(attr(o, 'ilvl') ?? 0), Number(lvlStart))
    }
    ctx.nums.set(attr(num, 'numId') ?? '', { abstractId: attr(child(num, 'abstractNumId'), 'val') ?? '', starts })
  }
}

function parseNotes(root: Element | null, kind: string, ctx: Context) {
  if (!root) return
  for (const note of children(root, kind)) {
    const type = attr(note, 'type')
    if (type && type !== 'normal') continue
    const text = children(note, 'p').map((p) => plainText(p).trim())
    ctx.notes.set(`${kind}:${attr(note, 'id')}`, text.join('\n').trim())
  }
}

function plainText(el: Element): string {
  let out = ''
  for (const c of children(el)) {
    switch (c.localName) {
      case 't':
        out += c.textContent ?? ''
        break
      case 'tab':
        out += '\t'
        break
      case 'br':
      case 'cr':
        out += '\n'
        break
      case 'del':
      case 'instrText':
      case 'footnoteRef':
      case 'endnoteRef':
        break
      default:
        out += plainText(c)
    }
  }
  return out
}

function chain(styleId: string | null, ctx: Context): StyleDef[] {
  const out: StyleDef[] = []
  let id: string | undefined = styleId ?? undefined
  while (id && out.length < 12) {
    const style = ctx.styles.get(id)
    if (!style || out.includes(style)) break
    out.push(style)
    id = style.basedOn
  }
  return out
}

function rPrOf(docDefaults: Element | null): Element | null {
  return child(child(docDefaults, 'rPrDefault'), 'rPr')
}

// ---- Blocks ----

async function blockContent(parent: Element, ctx: Context, part: Part): Promise<JSONContent[]> {
  const items: Item[] = []
  await collectBlocks(parent, ctx, part, items)
  const content = assemble(items)
  // Word requires a paragraph after a trailing table; it is not content.
  const last = content[content.length - 1]
  if (content[content.length - 2]?.type === 'table' && last.type === 'paragraph' && !last.content && !last.attrs) content.pop()
  return content
}

async function collectBlocks(parent: Element, ctx: Context, part: Part, items: Item[]) {
  for (const el of children(parent)) {
    switch (el.localName) {
      case 'p':
        items.push(...(await paragraph(el, ctx, part)))
        break
      case 'tbl': {
        const node = await table(el, ctx, part)
        // A page break before a table may be stored in its first cell (LibreOffice).
        const first = node.content?.[0]?.content?.[0]
        if (first?.content?.[0]?.type === 'pageBreak' && first.content.length > 1) {
          first.content.shift()
          items.push({ node: { type: 'pageBreak' } })
        }
        items.push({ node })
        break
      }
      case 'sdt':
        await collectBlocks(child(el, 'sdtContent') ?? el, ctx, part, items)
        break
      case 'customXml':
      case 'ins':
        await collectBlocks(el, ctx, part, items)
        break
    }
  }
}

// Builds nested lists, blockquotes and code blocks from the flat paragraph sequence.
function assemble(items: Item[]): JSONContent[] {
  const out: JSONContent[] = []
  const stack: { node: JSONContent; kind: string; group: string }[] = []
  let prev: Item | null = null
  for (const item of items) {
    if (item.list) {
      const { kind, group, restart } = item.list
      const level = Math.min(item.list.level, stack.length)
      stack.length = Math.min(stack.length, level + 1)
      const top = stack[level]
      if (top && (top.kind !== kind || (kind === 'ordered' && (top.group !== group || restart)))) stack.length = level
      if (stack.length === level) {
        const type = kind === 'bullet' ? 'bulletList' : kind === 'ordered' ? 'orderedList' : 'taskList'
        const node: JSONContent = { type, content: [] }
        if (kind === 'ordered') node.attrs = { start: item.list.value }
        if (level === 0) out.push(node)
        else lastItem(stack[level - 1].node).content!.push(node)
        stack.push({ node, kind, group })
      }
      const para = item.node.type === 'heading' ? { ...item.node, type: 'paragraph', attrs: withoutLevel(item.node.attrs) } : item.node
      stack[level].node.content!.push(
        kind === 'task' ? { type: 'taskItem', attrs: { checked: item.list.checked }, content: [para] } : { type: 'listItem', content: [para] },
      )
    } else if (item.cont !== undefined && stack.length) {
      const level = Math.min(item.cont, stack.length - 1)
      stack.length = level + 1
      lastItem(stack[level].node).content!.push(item.node)
    } else {
      stack.length = 0
      const last = out[out.length - 1]
      if (item.quote) {
        if (prev?.quote && last?.type === 'blockquote') last.content!.push(item.node)
        else out.push({ type: 'blockquote', content: [item.node] })
      } else if (item.code && prev?.code && last?.type === 'codeBlock') {
        const text = item.node.content?.[0]?.text ?? ''
        const lastText = last.content?.[0]
        if (lastText) lastText.text += '\n' + text
        else last.content = [{ type: 'text', text: '\n' + text }]
      } else out.push(item.node)
    }
    prev = item
  }
  // Code blocks may have been merged from empty lines: drop empty text nodes.
  for (const node of out) if (node.type === 'codeBlock' && node.content?.[0]?.text === '') delete node.content
  return out
}

function lastItem(list: JSONContent): JSONContent {
  return list.content![list.content!.length - 1]
}

function withoutLevel(attrs: JSONContent['attrs']): JSONContent['attrs'] {
  if (!attrs) return undefined
  const { level: _level, ...rest } = attrs
  return Object.keys(rest).length ? rest : undefined
}

function styleKind(styles: StyleDef[], pPr: Element | null): { kind: Kind; level?: number } {
  for (const s of styles) {
    const heading = /^heading\s*(\d)$/.exec(s.name)
    if (heading) return { kind: 'heading', level: Math.min(6, Math.max(1, Number(heading[1]))) }
    if (s.name === 'title') return { kind: 'title' }
    if (s.name === 'subtitle') return { kind: 'subtitle' }
    if (/quot/.test(s.name)) return { kind: 'quote' }
    if (/^(code( block)?|source code|preformatted text|html preformatted)$/.test(s.name)) return { kind: 'code' }
    if (/^horizontal line$/.test(s.name)) return { kind: 'hr' }
    if (/^list continue/.test(s.name)) return { kind: 'listContinue' }
    if (/^table heading$/.test(s.name)) return { kind: 'tableHeading' }
    if (s.name === 'table separator') return { kind: 'separator' }
  }
  const outline = attr(child(pPr, 'outlineLvl'), 'val')
  if (outline !== null && Number(outline) < 6) return { kind: 'heading', level: Number(outline) + 1 }
  return { kind: null }
}

async function paragraph(p: Element, ctx: Context, part: Part): Promise<Item[]> {
  const pPr = child(p, 'pPr')
  const styleId = attr(child(pPr, 'pStyle'), 'val') ?? (ctx.styles.has('Normal') ? 'Normal' : null)
  const styles = chain(styleId, ctx)
  const pPrs = [pPr, ...styles.map((s) => s.pPr)]
  const { kind, level } = styleKind(styles, pPr)
  // Our exporter's spacer between adjacent tables.
  if (kind === 'separator') return []

  // Run formatting inherited from the paragraph style; headings and named styles bring their own look.
  const plainStyle = kind === null || kind === 'listContinue'
  const baseRPrs = plainStyle ? [rPrOf(ctx.docDefaults), ...styles.map((s) => s.rPr).reverse()] : []
  const segments = await runs(p, ctx, part, baseRPrs, kind === 'code')
  const items: Item[] = []
  if (attr(child(pPr, 'pageBreakBefore'), 'val') !== 'false' && child(pPr, 'pageBreakBefore')) items.push({ node: { type: 'pageBreak' } })

  // Paragraph attributes.
  const attrs: Record<string, unknown> = {}
  const jc = firstAttr(pPrs, 'jc', 'val')
  if (jc === 'center') attrs.textAlign = 'center'
  else if (jc === 'right' || jc === 'end') attrs.textAlign = 'right'
  else if (jc === 'both' || jc === 'distribute') attrs.textAlign = 'justify'
  const spacing = child(pPr, 'spacing')
  const line = Number(attr(spacing, 'line'))
  const rule = attr(spacing, 'lineRule') ?? 'auto'
  if (line > 0 && rule === 'auto') attrs.lineHeight = String(Math.round((line / 240) * 100) / 100)

  // Lists: numbering from direct formatting or the paragraph style.
  const numId = firstAttr(pPrs, 'numPr', 'numId', 'numId')
  const numLevel = Math.min(8, Number(firstAttr(pPrs, 'numPr', 'ilvl', 'ilvl') ?? 0))
  const list = kind !== 'quote' && kind !== 'code' && numId && numId !== '0' ? listInfo(numId, numLevel, ctx) : undefined

  const left = Number(attr(child(pPr, 'ind'), 'left') ?? attr(child(pPr, 'ind'), 'start') ?? (plainStyle ? firstAttr(pPrs, 'ind', 'left') : null) ?? 0)
  let cont: number | undefined
  if (!list) {
    if (kind === 'listContinue') {
      cont = Math.max(0, Math.round(left / TWIPS_PER_INDENT) - 1)
    } else {
      const base = kind === 'quote' ? Number(firstAttr(styles.map((s) => s.pPr), 'ind', 'left') ?? 0) : 0
      const indent = Math.round((left - base) / TWIPS_PER_INDENT)
      if (indent > 0) attrs.indent = Math.min(indent, 8)
    }
  }

  const hasBreaks = segments.length > 1
  segments.forEach((content, i) => {
    if (i > 0) items.push({ node: { type: 'pageBreak' } })
    if (hasBreaks && !content.length) return
    const hr = segments.hr || (kind === 'hr' || (!kind && child(pPr, 'pBdr') && child(child(pPr, 'pBdr'), 'bottom') && !list)) && !content.length
    if (hr) {
      items.push({ node: { type: 'horizontalRule' } })
      return
    }
    if (kind === 'code') {
      const text = content.map((n) => (n.type === 'hardBreak' ? '\n' : (n.text ?? ''))).join('')
      items.push({ node: { type: 'codeBlock', attrs: { language: null }, content: text ? [{ type: 'text', text }] : undefined }, code: true })
      return
    }
    const node: JSONContent = { type: 'paragraph' }
    if (kind === 'heading') {
      node.type = 'heading'
      node.attrs = { level, ...attrs }
    } else {
      if (kind === 'title' || kind === 'subtitle') attrs.styleId = kind
      if (Object.keys(attrs).length) node.attrs = attrs
    }
    if (content.length) node.content = content
    const item: Item = { node }
    if (list && i === 0) {
      item.list = list
    } else if (cont !== undefined) item.cont = cont
    if (kind === 'quote') item.quote = true
    items.push(item)
  })
  if (list && !items.some((i) => i.list)) {
    // The numbered paragraph only held a page break: keep the list item.
    items.push({ node: { type: 'paragraph' }, list })
  }
  return items
}

function listInfo(numId: string, level: number, ctx: Context): Item['list'] {
  const num = ctx.nums.get(numId)
  const def = num ? ctx.abstracts.get(num.abstractId)?.get(level) : undefined
  if (!num || def?.format === 'none') return undefined
  const format = def?.format ?? 'bullet'
  let kind: 'bullet' | 'ordered' | 'task' = format === 'bullet' ? 'bullet' : 'ordered'
  const text = def?.text ?? ''
  if (kind === 'bullet' && (TASK_CHECKED.test(text) || TASK_UNCHECKED.test(text))) kind = 'task'

  // Word numbering: counters are per abstract definition; a num override restarts them.
  const counters = ctx.counters.get(num.abstractId) ?? []
  ctx.counters.set(num.abstractId, counters)
  const key = `${numId}:${level}`
  const restart = !ctx.usedNums.has(key) && num.starts.has(level)
  const value = restart ? num.starts.get(level)! : counters[level] !== undefined ? counters[level] + 1 : (def?.start ?? 1)
  ctx.usedNums.add(key)
  counters[level] = value
  counters.length = level + 1
  return { kind, level, group: num.abstractId, restart, value, checked: TASK_CHECKED.test(text) }
}

function firstAttr(elements: (Element | null)[], childName: string, attrName: string, nested?: string): string | null {
  for (const el of elements) {
    const c = child(el, childName)
    const value = nested ? attr(child(c, nested), 'val') : attr(c, attrName)
    if (value !== null) return value
  }
  return null
}

// ---- Runs ----

interface Field {
  instr: string
  result: boolean
  // PAGE / NUMPAGES fields become page number nodes and hide their cached result.
  page?: 'page' | 'total' | null
  link?: string
}

type Segments = JSONContent[][] & { hr?: boolean }

// Collects inline content; page breaks split it into segments.
async function runs(p: Element, ctx: Context, part: Part, baseRPrs: (Element | null)[], plain: boolean): Promise<Segments> {
  const segments: Segments = [[]]
  const fields: Field[] = []
  const push = (node: JSONContent) => {
    const seg = segments[segments.length - 1]
    const last = seg[seg.length - 1]
    if (node.type === 'text' && last?.type === 'text' && JSON.stringify(last.marks ?? []) === JSON.stringify(node.marks ?? [])) {
      last.text += node.text!
    } else seg.push(node)
  }
  const hidden = () => fields.some((f) => !f.result || f.page)
  const fieldLink = () => [...fields].reverse().find((f) => f.link)?.link

  const walk = async (parent: Element, link: string | undefined) => {
    for (const el of children(parent)) {
      switch (el.localName) {
        case 'r':
          await run(el, link ?? fieldLink())
          break
        case 'hyperlink': {
          const id = attr(el, 'id')
          const anchor = attr(el, 'anchor')
          await walk(el, (id && part.rels.get(id)) || (anchor ? `#${anchor}` : link))
          break
        }
        case 'fldSimple': {
          const f = parseField(attr(el, 'instr') ?? '')
          if (f.page) {
            if (!hidden()) push(withMarks({ type: 'pageNumber', attrs: { kind: f.page } }, runMarks(child(child(el, 'r'), 'rPr'))))
          } else await walk(el, f.link ?? link)
          break
        }
        case 'ins':
        case 'smartTag':
        case 'customXml':
        case 'moveTo':
          await walk(el, link)
          break
        case 'sdt':
          await walk(child(el, 'sdtContent') ?? el, link)
          break
      }
    }
  }

  const runMarks = (rPr: Element | null, link?: string) => marks(runProps(rPr, baseRPrs, ctx, !!link), link)

  const run = async (r: Element, link: string | undefined) => {
    const rPr = child(r, 'rPr')
    const m = plain ? undefined : runMarks(rPr, link)
    for (const el of children(r)) {
      switch (el.localName) {
        case 'fldChar': {
          const type = attr(el, 'fldCharType')
          if (type === 'begin') fields.push({ instr: '', result: false })
          else if (type === 'separate' || type === 'end') {
            const f = fields[fields.length - 1]
            if (f && !f.result) {
              Object.assign(f, parseField(f.instr), { result: true })
              if (f.page && !fields.slice(0, -1).some((o) => !o.result || o.page)) push(withMarks({ type: 'pageNumber', attrs: { kind: f.page } }, m))
            }
            if (type === 'end') fields.pop()
          }
          break
        }
        case 'instrText':
          if (fields.length) fields[fields.length - 1].instr += el.textContent ?? ''
          break
        default:
          if (!hidden()) await runChild(el, m)
      }
    }
  }

  const runChild = async (el: Element, m: JSONContent['marks']) => {
    switch (el.localName) {
      case 't':
        if (el.textContent) push(withMarks({ type: 'text', text: el.textContent }, m))
        break
      case 'tab':
      case 'ptab':
        push(withMarks({ type: 'text', text: '\t' }, m))
        break
      case 'noBreakHyphen':
        push(withMarks({ type: 'text', text: '‑' }, m))
        break
      case 'sym': {
        const code = parseInt(attr(el, 'char') ?? '', 16)
        // Private-use symbol font codes cannot be mapped reliably.
        if (code && (code < 0xf000 || code > 0xf0ff)) push(withMarks({ type: 'text', text: String.fromCharCode(code) }, m))
        break
      }
      case 'br':
      case 'cr':
        if (attr(el, 'type') === 'page') segments.push([])
        else push({ type: 'hardBreak' })
        break
      case 'footnoteReference':
      case 'endnoteReference': {
        const kind = el.localName === 'footnoteReference' ? 'footnote' : 'endnote'
        const content = ctx.notes.get(`${kind}:${attr(el, 'id')}`)
        if (content !== undefined) push({ type: 'footnote', attrs: { content } })
        break
      }
      case 'drawing':
      case 'pict':
      case 'object': {
        if ([...el.getElementsByTagNameNS('*', 'rect'), ...el.getElementsByTagNameNS('*', 'line')].some((x) => attr(x, 'hr') === 't')) {
          segments.hr = true
          break
        }
        const img = await image(el, ctx, part)
        if (img) push(img)
        break
      }
      case 'AlternateContent': {
        const choice = child(el, 'Choice') ?? child(el, 'Fallback')
        if (choice) for (const c of children(choice)) await runChild(c, m)
        break
      }
    }
  }

  await walk(p, undefined)
  return segments
}

function parseField(instr: string): { page: 'page' | 'total' | null; link?: string } {
  const words = instr.trim().split(/\s+/)
  const name = words[0]?.toUpperCase()
  if (name === 'PAGE') return { page: 'page' }
  if (name === 'NUMPAGES' || name === 'SECTIONPAGES') return { page: 'total' }
  if (name === 'HYPERLINK') {
    const m = /HYPERLINK\s+(?:\\l\s+)?"([^"]*)"/i.exec(instr)
    const isAnchor = /\\l/.test(instr)
    if (m) return { page: null, link: isAnchor ? `#${m[1]}` : m[1] }
  }
  return { page: null }
}

function withMarks(node: JSONContent, marks: JSONContent['marks']): JSONContent {
  if (marks?.length) node.marks = marks
  return node
}

// Resolves run formatting: document defaults, paragraph style, character style, then direct formatting.
function runProps(rPr: Element | null, baseRPrs: (Element | null)[], ctx: Context, inLink: boolean): RunProps {
  const charStyles = chain(attr(child(rPr, 'rStyle'), 'val'), ctx)
  const charProps = resolveRun(charStyles.map((s) => s.rPr).reverse(), ctx)
  if (inLink) {
    // Hyperlink character styles bring the usual blue underline: implied by the link.
    delete charProps.color
    delete charProps.underline
  }
  const props: RunProps = { ...resolveRun(baseRPrs, ctx), ...defined(charProps), ...defined(resolveRun([rPr], ctx)) }
  if (charStyles.some((s) => /source text|code|verbatim/.test(s.name)) || (props.font && MONOSPACE.test(props.font))) {
    props.code = true
    delete props.font
  }
  if (inLink) {
    delete props.underline
    if (props.color && LINK_COLORS.includes(props.color)) delete props.color
  }
  if (props.font && ctx.defaultFont && props.font.toLowerCase() === ctx.defaultFont.toLowerCase()) delete props.font
  if (props.size && props.size === ctx.defaultSize) delete props.size
  return props
}

function defined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}

// Later elements override earlier ones.
function resolveRun(rPrs: (Element | null)[], ctx: Context): RunProps {
  const out: RunProps = {}
  for (const rPr of rPrs) {
    if (!rPr) continue
    for (const el of children(rPr)) {
      const val = attr(el, 'val')
      const on = val === null || !['0', 'false', 'off', 'none'].includes(val)
      switch (el.localName) {
        case 'b':
          out.bold = on
          break
        case 'i':
          out.italic = on
          break
        case 'u':
          out.underline = on
          break
        case 'strike':
        case 'dstrike':
          out.strike = on
          break
        case 'color':
          out.color = val && val !== 'auto' ? toHex(`#${val}`) : undefined
          break
        case 'highlight':
          out.highlight = val ? HIGHLIGHT[val] : undefined
          break
        case 'shd': {
          const fill = attr(el, 'fill')
          if (fill && fill !== 'auto') out.highlight = toHex(`#${fill}`)
          break
        }
        case 'sz':
          if (Number(val) > 0) out.size = Number(val) / 2
          break
        case 'rFonts': {
          const theme = attr(el, 'asciiTheme') ?? attr(el, 'hAnsiTheme')
          const font = attr(el, 'ascii') ?? attr(el, 'hAnsi') ?? (theme ? ctx.themeFonts[theme.startsWith('major') ? 'major' : 'minor'] : null)
          if (font) out.font = font
          break
        }
        case 'vertAlign':
          out.sup = val === 'superscript'
          out.sub = val === 'subscript'
          break
      }
    }
  }
  return out
}

function marks(p: RunProps, link: string | undefined): JSONContent['marks'] {
  const out: NonNullable<JSONContent['marks']> = []
  if (p.bold) out.push({ type: 'bold' })
  if (p.code) out.push({ type: 'code' })
  if (p.italic) out.push({ type: 'italic' })
  if (link) out.push({ type: 'link', attrs: { href: link } })
  if (p.strike) out.push({ type: 'strike' })
  if (p.underline) out.push({ type: 'underline' })
  const style: Record<string, string> = {}
  if (p.color && p.color !== '#000000') style.color = p.color
  if (p.font) style.fontFamily = p.font
  if (p.size) style.fontSize = `${p.size}pt`
  if (Object.keys(style).length) out.push({ type: 'textStyle', attrs: style })
  if (p.highlight) out.push({ type: 'highlight', attrs: { color: p.highlight } })
  if (p.sub) out.push({ type: 'subscript' })
  if (p.sup) out.push({ type: 'superscript' })
  return out
}

async function image(el: Element, ctx: Context, part: Part): Promise<JSONContent | null> {
  const blip = el.getElementsByTagNameNS('*', 'blip')[0] ?? el.getElementsByTagNameNS('*', 'imagedata')[0]
  const id = attr(blip, 'embed') ?? attr(blip, 'link') ?? attr(blip, 'id')
  if (!id) return null
  const key = `${part.path}#${id}`
  if (!ctx.images.has(key)) ctx.images.set(key, await loadImagePart(part.rels.get(id), ctx))
  const img = ctx.images.get(key)
  if (!img) return null

  const docPr = el.getElementsByTagNameNS('*', 'docPr')[0]
  const extent = el.getElementsByTagNameNS('*', 'extent')[0]
  let width: number | null = null
  let height: number | null = null
  if (extent) {
    width = Math.round(Number(attr(extent, 'cx')) / EMU_PER_PX) || null
    height = Math.round(Number(attr(extent, 'cy')) / EMU_PER_PX) || null
  } else {
    // VML images: size from the shape style (pt).
    const style = attr(el.getElementsByTagNameNS('*', 'shape')[0], 'style') ?? ''
    const w = /width:\s*([\d.]+)pt/.exec(style)
    const h = /height:\s*([\d.]+)pt/.exec(style)
    if (w && h) {
      width = Math.round((Number(w[1]) * 4) / 3)
      height = Math.round((Number(h[1]) * 4) / 3)
    }
  }
  // The natural size needs no explicit dimensions.
  if (width && height && Math.abs(width - img.width) <= 1 && Math.abs(height - img.height) <= 1) width = height = null
  const attrs: Record<string, unknown> = { src: img.src }
  const alt = attr(docPr, 'descr')
  const title = attr(docPr, 'title')
  if (alt) attrs.alt = alt
  if (title) attrs.title = title
  if (width) attrs.width = width
  if (height) attrs.height = height
  return { type: 'image', attrs }
}

async function loadImagePart(target: string | undefined, ctx: Context): Promise<{ src: string; width: number; height: number } | null> {
  if (!target) return null
  if (/^https?:/.test(target)) return { src: target, width: 0, height: 0 }
  const bytes = await ctx.zip.file(target)?.async('uint8array')
  if (!bytes) return null
  const mime = mimeFromPath(target)
  let width = 0
  let height = 0
  try {
    const bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }))
    width = bitmap.width
    height = bitmap.height
    bitmap.close()
  } catch {
    // Formats the browser cannot decode (EMF/WMF) keep their explicit size.
  }
  return { src: bytesToDataUrl(bytes, mime), width, height }
}

// ---- Tables ----

async function table(tbl: Element, ctx: Context, part: Part): Promise<JSONContent> {
  const grid = children(child(tbl, 'tblGrid') ?? tbl, 'gridCol').map((g) => Number(attr(g, 'w')) || 0)
  const rows: JSONContent[] = []
  // Cell currently open for vertical merging, per grid column.
  const open: (JSONContent | undefined)[] = []
  for (const tr of rowsOf(tbl)) {
    const trPr = child(tr, 'trPr')
    const headerRow = !!child(trPr, 'tblHeader') && attr(child(trPr, 'tblHeader'), 'val') !== 'false' && attr(child(trPr, 'tblHeader'), 'val') !== '0'
    let col = Number(attr(child(trPr, 'gridBefore'), 'val') ?? 0)
    const cells: JSONContent[] = []
    for (const tc of cellsOf(tr)) {
      const tcPr = child(tc, 'tcPr')
      const span = Math.max(1, Number(attr(child(tcPr, 'gridSpan'), 'val') ?? 1))
      const vMerge = child(tcPr, 'vMerge')
      const merge = vMerge ? (attr(vMerge, 'val') ?? 'continue') : null
      if (merge === 'continue' && open[col]) {
        open[col]!.attrs!.rowspan++
        col += span
        continue
      }
      const content = await blockContent(tc, ctx, part)
      const paragraphs = children(tc, 'p')
      const headingCell =
        paragraphs.length > 0 &&
        paragraphs.every((p) => /^table heading$/.test(chain(attr(child(child(p, 'pPr'), 'pStyle'), 'val'), ctx)[0]?.name ?? ''))
      const tcW = child(tcPr, 'tcW')
      const wType = attr(tcW, 'type') ?? 'dxa'
      let colwidth: number[] | null = null
      if (wType === 'dxa' && grid.length >= col + span && grid.slice(col, col + span).every((w) => w > 0)) {
        colwidth = grid.slice(col, col + span).map((w) => Math.round(w / 15))
      } else if (wType === 'dxa' && Number(attr(tcW, 'w')) > 0) {
        colwidth = Array(span).fill(Math.round(Number(attr(tcW, 'w')) / 15 / span))
      }
      const fill = attr(child(tcPr, 'shd'), 'fill')
      const cell: JSONContent = {
        type: headerRow || headingCell ? 'tableHeader' : 'tableCell',
        attrs: {
          colspan: span,
          rowspan: 1,
          colwidth,
          backgroundColor: fill && fill !== 'auto' ? (toHex(`#${fill}`) ?? null) : null,
        },
        content: content.length ? content : [{ type: 'paragraph' }],
      }
      for (let i = 0; i < span; i++) open[col + i] = merge === 'restart' ? cell : undefined
      cells.push(cell)
      col += span
    }
    rows.push({ type: 'tableRow', content: cells })
  }
  return { type: 'table', content: rows }
}

function rowsOf(tbl: Element): Element[] {
  return children(tbl).flatMap((el) =>
    el.localName === 'tr' ? [el] : el.localName === 'sdt' || el.localName === 'customXml' ? rowsOf(child(el, 'sdtContent') ?? el) : [],
  )
}

function cellsOf(tr: Element): Element[] {
  return children(tr).flatMap((el) =>
    el.localName === 'tc' ? [el] : el.localName === 'sdt' || el.localName === 'customXml' ? cellsOf(child(el, 'sdtContent') ?? el) : [],
  )
}
