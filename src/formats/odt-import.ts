// OpenDocument Text (.odt) import into the normalized model.

import JSZip from 'jszip'
import {
  attr,
  bytesToDataUrl,
  child,
  children,
  fontFromFamily,
  mimeFromPath,
  parseXml,
  sizeFromPt,
  toHex,
  type BlockAttrs,
  type InlineAttrs,
  type Line,
} from './model'

const INDENT_CM = 1.27

interface StyleDef {
  name: string
  displayName: string
  parent?: string
  paragraph: Element | null
  text: Element | null
}

interface Context {
  zip: JSZip
  styles: Map<string, StyleDef>
  // list style -> level (1-based) -> "number" | "bullet"
  listStyles: Map<string, Map<number, string>>
  images: Map<string, string>
  lines: Line[]
}

export async function importOdt(file: ArrayBuffer): Promise<Line[]> {
  const zip = await JSZip.loadAsync(file)
  const contentXml = await zip.file('content.xml')?.async('text')
  if (!contentXml) throw new Error('Not an OpenDocument text file')
  const stylesXml = await zip.file('styles.xml')?.async('text')

  const content = parseXml(contentXml).documentElement
  const ctx: Context = { zip, styles: new Map(), listStyles: new Map(), images: new Map(), lines: [] }
  if (stylesXml) {
    const root = parseXml(stylesXml).documentElement
    readStyles(child(root, 'styles'), ctx)
    readStyles(child(root, 'automatic-styles'), ctx)
  }
  readStyles(child(content, 'automatic-styles'), ctx)

  const text = child(child(content, 'body'), 'text')
  if (text) await walkBlocks(text, ctx, 0, null)
  return ctx.lines
}

async function walkBlocks(parent: Element, ctx: Context, depth: number, listStyle: string | null): Promise<void> {
  for (const el of children(parent)) {
    switch (el.localName) {
      case 'p':
      case 'h':
        await paragraph(el, ctx, {})
        break
      case 'list':
        await list(el, ctx, depth + 1, attr(el, 'style-name') ?? listStyle)
        break
      case 'table':
      case 'table-header-rows':
      case 'table-rows':
      case 'table-row-group':
      case 'table-row':
      case 'table-cell':
      case 'section':
      case 'index-body':
      case 'table-of-content':
      case 'alphabetical-index':
      case 'illustration-index':
        await walkBlocks(el, ctx, depth, listStyle)
        break
    }
  }
}

async function list(el: Element, ctx: Context, depth: number, listStyle: string | null): Promise<void> {
  const kind = (listStyle && ctx.listStyles.get(listStyle)?.get(depth)) ?? 'bullet'
  for (const item of children(el)) {
    if (item.localName !== 'list-item' && item.localName !== 'list-header') continue
    let first = item.localName === 'list-item'
    for (const node of children(item)) {
      if (node.localName === 'list') {
        await list(node, ctx, depth + 1, attr(node, 'style-name') ?? listStyle)
      } else if (node.localName === 'p' || node.localName === 'h') {
        const block: BlockAttrs = { indent: depth > 1 ? depth - 1 : undefined }
        if (first) block.list = kind === 'number' ? 'ordered' : 'bullet'
        else block.indent = depth
        first = false
        await paragraph(node, ctx, block)
      }
    }
  }
}

async function paragraph(p: Element, ctx: Context, base: BlockAttrs): Promise<void> {
  const chain = styleChain(attr(p, 'style-name'), ctx)
  const attrs: BlockAttrs = { ...base }

  const outline = attr(p, 'outline-level')
  const names = chain.map((s) => s.displayName.toLowerCase())
  const heading = names.map((n) => /^heading (\d)$/.exec(n)).find(Boolean)
  if (p.localName === 'h' && outline) attrs.header = Math.min(Number(outline) || 1, 6)
  else if (heading) attrs.header = Number(heading[1])
  else if (names.includes('title')) attrs.header = 1
  else if (names.includes('subtitle')) attrs.header = 2
  if (names.some((n) => n === 'quotations' || n === 'quote')) attrs.blockquote = true
  if (names.some((n) => n === 'preformatted text')) attrs.codeBlock = true

  const pProps = chain.map((s) => s.paragraph)
  const align = first(pProps, 'text-align')
  if (align === 'center') attrs.align = 'center'
  else if (align === 'end' || align === 'right') attrs.align = 'right'
  else if (align === 'justify') attrs.align = 'justify'
  if (!attrs.list && !attrs.indent && !attrs.blockquote) {
    const indent = Math.round(toCm(first(pProps, 'margin-left')) / INDENT_CM)
    if (indent > 0) attrs.indent = Math.min(indent, 8)
  }

  const inherited = attrs.header ? {} : textProps(chain.map((s) => s.text))
  ctx.lines.push({ runs: [], attrs })
  await inline(p, ctx, inherited, attrs)
}

async function inline(parent: Element, ctx: Context, base: InlineAttrs, block: BlockAttrs): Promise<void> {
  const push = (text: string, attrs: InlineAttrs) => ctx.lines[ctx.lines.length - 1].runs.push({ text, attrs })
  for (const node of parent.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      // ODF collapses XML whitespace; explicit spaces use <text:s/>.
      const text = (node.textContent ?? '').replace(/[\t\n\r ]+/g, ' ')
      if (text) push(text, base)
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue
    const el = node as Element
    switch (el.localName) {
      case 's':
        push(' '.repeat(Number(attr(el, 'c') ?? 1)), base)
        break
      case 'tab':
        push('\t', base)
        break
      case 'line-break':
        ctx.lines.push({ runs: [], attrs: { ...block } })
        break
      case 'span': {
        const own = textProps(styleChain(attr(el, 'style-name'), ctx).map((s) => s.text))
        await inline(el, ctx, { ...base, ...own }, block)
        break
      }
      case 'a': {
        const { color: _c, underline: _u, ...rest } = base
        await inline(el, ctx, { ...rest, link: attr(el, 'href') ?? undefined }, block)
        break
      }
      case 'frame': {
        const image = child(el, 'image')
        const src = image ? await loadPicture(attr(image, 'href'), ctx) : null
        if (src) ctx.lines[ctx.lines.length - 1].runs.push({ image: src, attrs: {} })
        break
      }
      case 'note':
      case 'annotation':
      case 'bookmark':
      case 'bookmark-start':
      case 'bookmark-end':
      case 'soft-page-break':
      case 'sequence-decls':
        break
      default:
        // Fields (page number, date, …) and unknown wrappers: keep their text.
        await inline(el, ctx, base, block)
    }
  }
}

function textProps(propsList: (Element | null)[]): InlineAttrs {
  const out: InlineAttrs = {}
  // The list goes from most specific to least specific.
  for (const el of [...propsList].reverse()) {
    if (!el) continue
    const weight = attr(el, 'font-weight')
    if (weight) out.bold = weight === 'bold' || Number(weight) >= 600
    const style = attr(el, 'font-style')
    if (style) out.italic = style === 'italic' || style === 'oblique'
    const underline = attr(el, 'text-underline-style')
    if (underline) out.underline = underline !== 'none'
    const strike = attr(el, 'text-line-through-style')
    if (strike) out.strike = strike !== 'none'
    const color = attr(el, 'color')
    if (color) out.color = toHex(color)
    const bg = attr(el, 'background-color')
    if (bg) out.background = bg === 'transparent' ? undefined : toHex(bg)
    const size = attr(el, 'font-size')
    if (size?.endsWith('pt')) out.size = sizeFromPt(parseFloat(size))
    const font = attr(el, 'font-name') ?? attr(el, 'font-family')
    if (font) out.font = fontFromFamily(font)
    const position = attr(el, 'text-position')
    if (position) {
      const offset = position.split(' ')[0]
      out.script = offset === 'super' || parseFloat(offset) > 0 ? 'super' : offset === 'sub' || parseFloat(offset) < 0 ? 'sub' : undefined
    }
  }
  for (const key of Object.keys(out) as (keyof InlineAttrs)[]) if (!out[key]) delete out[key]
  return out
}

async function loadPicture(href: string | null, ctx: Context): Promise<string | null> {
  if (!href) return null
  if (/^https?:/.test(href)) return href
  const path = href.replace(/^\.\//, '')
  const cached = ctx.images.get(path)
  if (cached) return cached
  const bytes = await ctx.zip.file(path)?.async('uint8array')
  if (!bytes) return null
  const url = bytesToDataUrl(bytes, mimeFromPath(path))
  ctx.images.set(path, url)
  return url
}

function readStyles(container: Element | null, ctx: Context): void {
  if (!container) return
  for (const el of children(container)) {
    const name = attr(el, 'name')
    if (!name) continue
    if (el.localName === 'style') {
      ctx.styles.set(name, {
        name,
        displayName: (attr(el, 'display-name') ?? name.replace(/_20_/g, ' ')).trim(),
        parent: attr(el, 'parent-style-name') ?? undefined,
        paragraph: child(el, 'paragraph-properties'),
        text: child(el, 'text-properties'),
      })
    } else if (el.localName === 'list-style') {
      const levels = new Map<number, string>()
      for (const level of children(el)) {
        const kind = level.localName === 'list-level-style-number' ? 'number' : 'bullet'
        levels.set(Number(attr(level, 'level') ?? 1), kind)
      }
      ctx.listStyles.set(name, levels)
    }
  }
}

function styleChain(name: string | null, ctx: Context): StyleDef[] {
  const chain: StyleDef[] = []
  let current = name ?? undefined
  while (current && chain.length < 10) {
    const style = ctx.styles.get(current)
    if (!style) break
    chain.push(style)
    current = style.parent
  }
  return chain
}

function first(elements: (Element | null)[], name: string): string | null {
  for (const el of elements) {
    const value = attr(el, name)
    if (value !== null) return value
  }
  return null
}

function toCm(length: string | null): number {
  if (!length) return 0
  const value = parseFloat(length)
  if (length.endsWith('mm')) return value / 10
  if (length.endsWith('in')) return value * 2.54
  if (length.endsWith('pt')) return (value / 72) * 2.54
  return length.endsWith('cm') ? value : 0
}
