// Word (.docx) import: parses WordprocessingML into the normalized model.

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
  type Run,
  tableLines,
} from './model'

const TWIPS_PER_INDENT = 720

// Word highlight names (w:highlight) to hex.
const HIGHLIGHT: Record<string, string> = {
  yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000',
  darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000',
  darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000', white: '#ffffff',
}

interface StyleDef {
  basedOn?: string
  name: string
  pPr: Element | null
  rPr: Element | null
}

interface Context {
  zip: JSZip
  styles: Map<string, StyleDef>
  // numId -> ilvl -> numFmt
  numbering: Map<string, Map<number, string>>
  rels: Map<string, string>
  images: Map<string, string>
  // Document default font family, so it is not repeated on every run.
  defaultFont: InlineAttrs['font']
}

export async function importDocx(file: ArrayBuffer): Promise<Line[]> {
  const zip = await JSZip.loadAsync(file)
  const read = async (path: string) => (await zip.file(path)?.async('text')) ?? null
  const documentXml = await read('word/document.xml')
  if (!documentXml) throw new Error('Not a Word document')

  const stylesXml = await read('word/styles.xml')
  const styles = parseStyles(stylesXml)
  const ctx: Context = {
    zip,
    styles,
    defaultFont: defaultFont(stylesXml, styles),
    numbering: parseNumbering(await read('word/numbering.xml')),
    rels: parseRels(await read('word/_rels/document.xml.rels')),
    images: new Map(),
  }
  const body = child(parseXml(documentXml).documentElement, 'body')
  const lines: Line[] = []
  if (body) await walkBlocks(body, ctx, lines)
  return lines
}

async function walkBlocks(parent: Element, ctx: Context, lines: Line[]): Promise<void> {
  for (const el of children(parent)) {
    switch (el.localName) {
      case 'p':
        lines.push(...(await paragraph(el, ctx)))
        break
      case 'tbl':
        lines.push(...(await table(el, ctx)))
        break
      case 'sdt':
        await walkBlocks(child(el, 'sdtContent') ?? el, ctx, lines)
        break
    }
  }
}

// Tables map to Quill tables. Merged cells are expanded into empty cells so
// the grid stays rectangular; cells with several paragraphs are joined.
async function table(tbl: Element, ctx: Context): Promise<Line[]> {
  const rows: Line[][][] = []
  for (const tr of children(tbl, 'tr')) {
    const cells: Line[][] = []
    for (const tc of children(tr, 'tc')) {
      const tcPr = child(tc, 'tcPr')
      const span = Number(attr(child(tcPr, 'gridSpan'), 'val') ?? 1)
      const vMerge = child(tcPr, 'vMerge')
      // A "continue" vertical merge cell repeats the cell above: keep it empty.
      const content: Line[] = []
      if (!vMerge || attr(vMerge, 'val') === 'restart') await walkBlocks(tc, ctx, content)
      // Nested tables are flattened into the cell text.
      cells.push(content.map((l) => ({ ...l, attrs: {} })))
      for (let i = 1; i < span; i++) cells.push([])
    }
    rows.push(cells)
  }
  return tableLines(rows)
}

async function paragraph(p: Element, ctx: Context): Promise<Line[]> {
  const pPr = child(p, 'pPr')
  const styleId = attr(child(pPr, 'pStyle'), 'val') ?? 'Normal'
  const styleChain = resolveStyleChain(styleId, ctx)
  const attrs: BlockAttrs = {}

  const name = styleChain[0]?.name.toLowerCase() ?? ''
  const heading = /^heading\s*(\d)$/.exec(name)
  if (heading) attrs.header = Number(heading[1])
  else if (name === 'title') attrs.header = 1
  else if (name === 'subtitle') attrs.header = 2
  if (/quote/.test(name)) attrs.blockquote = true

  // Paragraph properties: direct formatting wins over the style chain.
  const pPrs = [pPr, ...styleChain.map((s) => s.pPr)]
  const jc = firstAttr(pPrs, 'jc', 'val')
  if (jc === 'center') attrs.align = 'center'
  else if (jc === 'right' || jc === 'end') attrs.align = 'right'
  else if (jc === 'both' || jc === 'distribute') attrs.align = 'justify'

  const numPr = pPrs.map((x) => child(x, 'numPr')).find((x) => x && child(x, 'numId'))
  const numId = attr(child(numPr, 'numId'), 'val')
  if (numId && numId !== '0') {
    const level = Number(attr(child(numPr, 'ilvl'), 'val') ?? 0)
    const fmt = ctx.numbering.get(numId)?.get(level) ?? 'bullet'
    attrs.list = fmt === 'bullet' || fmt === 'none' ? 'bullet' : 'ordered'
    if (level > 0) attrs.indent = Math.min(level, 8)
  } else {
    const left = Number(firstAttr(pPrs, 'ind', 'left') ?? firstAttr(pPrs, 'ind', 'start') ?? 0)
    const indent = Math.round(left / TWIPS_PER_INDENT)
    if (indent > 0 && !attrs.blockquote) attrs.indent = Math.min(indent, 8)
  }

  // Base run formatting inherited from the paragraph style (headings bring their own).
  const baseRun = attrs.header ? {} : runProps(styleChain.map((s) => s.rPr))
  const lines: Line[] = [{ runs: [], attrs }]
  await collectRuns(p, ctx, baseRun, undefined, lines)
  return lines
}

async function collectRuns(parent: Element, ctx: Context, base: InlineAttrs, link: string | undefined, lines: Line[]) {
  for (const el of children(parent)) {
    switch (el.localName) {
      case 'r':
        await run(el, ctx, base, link, lines)
        break
      case 'hyperlink': {
        const id = attr(el, 'id')
        const href = (id && ctx.rels.get(id)) || (attr(el, 'anchor') ? `#${attr(el, 'anchor')}` : undefined)
        await collectRuns(el, ctx, base, href, lines)
        break
      }
      case 'ins':
      case 'smartTag':
      case 'fldSimple':
      case 'customXml':
        await collectRuns(el, ctx, base, link, lines)
        break
      case 'sdt':
        await collectRuns(child(el, 'sdtContent') ?? el, ctx, base, link, lines)
        break
    }
  }
}

async function run(r: Element, ctx: Context, base: InlineAttrs, link: string | undefined, lines: Line[]) {
  const rPr = child(r, 'rPr')
  const charStyle = attr(child(rPr, 'rStyle'), 'val')
  const charChain = charStyle ? resolveStyleChain(charStyle, ctx).map((s) => s.rPr) : []
  const attrs: InlineAttrs = { ...base, ...runProps([rPr, ...charChain]) }
  if (attrs.font === ctx.defaultFont) delete attrs.font
  if (link) {
    attrs.link = link
    // Hyperlink character styling is implied by the link itself.
    delete attrs.color
    delete attrs.underline
  }
  const push = (item: Run) => lines[lines.length - 1].runs.push(item)

  for (const el of children(r)) {
    switch (el.localName) {
      case 't':
        push({ text: el.textContent ?? '', attrs })
        break
      case 'tab':
        push({ text: '\t', attrs })
        break
      case 'noBreakHyphen':
        push({ text: '-', attrs })
        break
      case 'br':
      case 'cr': {
        // Quill has no soft line breaks: start a new line with the same block format.
        const prev = lines[lines.length - 1]
        lines.push({ runs: [], attrs: { ...prev.attrs } })
        break
      }
      case 'drawing':
      case 'pict':
      case 'object': {
        const blip = el.getElementsByTagNameNS('*', 'blip')[0] ?? el.getElementsByTagNameNS('*', 'imagedata')[0]
        const id = attr(blip, 'embed') ?? attr(blip, 'id')
        const src = id ? await image(id, ctx) : null
        if (src) push({ image: src, attrs: {} })
        break
      }
    }
  }
}

// Reads run properties; earlier elements in the list take precedence.
function runProps(rPrs: (Element | null)[]): InlineAttrs {
  const out: InlineAttrs = {}
  for (const rPr of [...rPrs].reverse()) {
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
          out.background = val ? HIGHLIGHT[val] : undefined
          break
        case 'shd': {
          const fill = attr(el, 'fill')
          if (fill && fill !== 'auto') out.background = toHex(`#${fill}`)
          break
        }
        case 'sz':
          out.size = sizeFromPt(Number(val) / 2)
          break
        case 'rFonts':
          out.font = fontFromFamily(attr(el, 'ascii') ?? attr(el, 'hAnsi'))
          break
        case 'vertAlign':
          out.script = val === 'superscript' ? 'super' : val === 'subscript' ? 'sub' : undefined
          break
      }
    }
  }
  // Drop false/undefined keys so they do not produce Quill attributes.
  for (const key of Object.keys(out) as (keyof InlineAttrs)[]) if (!out[key]) delete out[key]
  return out
}

async function image(relId: string, ctx: Context): Promise<string | null> {
  const cached = ctx.images.get(relId)
  if (cached) return cached
  const target = ctx.rels.get(relId)
  if (!target || /^https?:/.test(target)) return target ?? null
  const path = target.startsWith('/') ? target.slice(1) : `word/${target}`
  const bytes = await ctx.zip.file(path)?.async('uint8array')
  if (!bytes) return null
  const url = bytesToDataUrl(bytes, mimeFromPath(path))
  ctx.images.set(relId, url)
  return url
}

function resolveStyleChain(styleId: string, ctx: Context): StyleDef[] {
  const chain: StyleDef[] = []
  let id: string | undefined = styleId
  while (id && chain.length < 10) {
    const style = ctx.styles.get(id)
    if (!style) break
    chain.push(style)
    id = style.basedOn
  }
  return chain
}

function firstAttr(elements: (Element | null)[], childName: string, attrName: string): string | null {
  for (const el of elements) {
    const value = attr(child(el, childName), attrName)
    if (value !== null) return value
  }
  return null
}

function parseStyles(xml: string | null): Map<string, StyleDef> {
  const styles = new Map<string, StyleDef>()
  if (!xml) return styles
  for (const s of children(parseXml(xml).documentElement, 'style')) {
    const id = attr(s, 'styleId')
    if (!id) continue
    styles.set(id, {
      name: attr(child(s, 'name'), 'val') ?? id,
      basedOn: attr(child(s, 'basedOn'), 'val') ?? undefined,
      pPr: child(s, 'pPr'),
      rPr: child(s, 'rPr'),
    })
  }
  return styles
}

function defaultFont(xml: string | null, styles: Map<string, StyleDef>): InlineAttrs['font'] {
  const fonts = (rPr: Element | null | undefined) => child(rPr, 'rFonts')
  const normal = fonts(styles.get('Normal')?.rPr)
  const docDefaults = xml ? parseXml(xml).documentElement.getElementsByTagNameNS('*', 'rPrDefault')[0] : undefined
  const fallback = fonts(child(docDefaults, 'rPr'))
  const el = normal ?? fallback
  return fontFromFamily(attr(el, 'ascii') ?? attr(el, 'hAnsi'))
}

function parseNumbering(xml: string | null): Map<string, Map<number, string>> {
  const result = new Map<string, Map<number, string>>()
  if (!xml) return result
  const root = parseXml(xml).documentElement
  const abstract = new Map<string, Map<number, string>>()
  for (const a of children(root, 'abstractNum')) {
    const levels = new Map<number, string>()
    for (const lvl of children(a, 'lvl')) {
      levels.set(Number(attr(lvl, 'ilvl')), attr(child(lvl, 'numFmt'), 'val') ?? 'decimal')
    }
    abstract.set(attr(a, 'abstractNumId') ?? '', levels)
  }
  for (const num of children(root, 'num')) {
    const abstractId = attr(child(num, 'abstractNumId'), 'val') ?? ''
    result.set(attr(num, 'numId') ?? '', abstract.get(abstractId) ?? new Map())
  }
  return result
}

function parseRels(xml: string | null): Map<string, string> {
  const rels = new Map<string, string>()
  if (!xml) return rels
  for (const r of children(parseXml(xml).documentElement, 'Relationship')) {
    rels.set(attr(r, 'Id') ?? '', attr(r, 'Target') ?? '')
  }
  return rels
}
