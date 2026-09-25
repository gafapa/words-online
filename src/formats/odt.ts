// OpenDocument Text (.odt) export from a Quill Delta.

import JSZip from 'jszip'
import type { Op } from 'quill'
import { deltaToLines, FONT_SIZE_PT, groupBlocks, HEADING_SIZE_PT, loadImage, type InlineAttrs, type Line } from './model'

const NS = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"',
].join(' ')

const INDENT_CM = 1.27
const PX_PER_CM = 96 / 2.54

export async function exportOdt(ops: Op[], title: string): Promise<Blob> {
  const writer = new ContentWriter()
  await writer.write(deltaToLines(ops))

  const zip = new JSZip()
  // The mimetype entry must be first and uncompressed.
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' })
  zip.file('content.xml', writer.contentXml())
  zip.file('styles.xml', STYLES_XML)
  zip.file('meta.xml', metaXml(title))
  writer.pictures.forEach((data, name) => zip.file(`Pictures/${name}`, data))
  zip.file('META-INF/manifest.xml', manifestXml(writer.pictureTypes))
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.text' })
}

class ContentWriter {
  readonly pictures = new Map<string, Uint8Array>()
  readonly pictureTypes = new Map<string, string>()
  private body: string[] = []
  private textStyles = new Map<string, string>() // properties xml -> name
  private paraStyles = new Map<string, string>()
  // Open list nesting: kind per level ("L1" bullet / "L2" numbered).
  private openLists: string[] = []
  private tableCount = 0

  async write(lines: Line[]): Promise<void> {
    for (const block of groupBlocks(lines)) {
      if (block.kind === 'table') {
        this.adjustLists(0, '')
        await this.table(block.rows)
        continue
      }
      const { line } = block
      const { list, indent = 0 } = line.attrs
      if (list) {
        const listStyle = list === 'ordered' ? 'L2' : 'L1'
        this.adjustLists(indent + 1, listStyle)
        this.body.push('<text:list-item>')
        this.body.push(await this.paragraph(line, list === 'checked' ? '☒ ' : list === 'unchecked' ? '☐ ' : ''))
        this.body.push('</text:list-item>')
      } else {
        this.adjustLists(0, '')
        this.body.push(await this.paragraph(line, ''))
      }
    }
    this.adjustLists(0, '')
  }

  contentXml(): string {
    const text = [...this.textStyles].map(
      ([props, name]) => `<style:style style:name="${name}" style:family="text"><style:text-properties ${props}/></style:style>`,
    )
    const para = [...this.paraStyles].map(([key, name]) => {
      const { parent, props } = JSON.parse(key) as { parent: string; props: string }
      return `<style:style style:name="${name}" style:family="paragraph" style:parent-style-name="${parent}"><style:paragraph-properties ${props}/></style:style>`
    })
    return (
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<office:document-content ${NS} office:version="1.3">` +
      `<office:automatic-styles>${para.join('')}${text.join('')}${LIST_STYLES}` +
      `<style:style style:name="Tbl" style:family="table"><style:table-properties style:width="17cm" table:align="margins"/></style:style>` +
      `<style:style style:name="Cell" style:family="table-cell"><style:table-cell-properties fo:padding="0.1cm" fo:border="0.5pt solid #000000"/></style:style>` +
      `<style:style style:name="fr1" style:family="graphic"><style:graphic-properties style:wrap="none" style:vertical-pos="top" style:vertical-rel="baseline"/></style:style>` +
      `</office:automatic-styles>` +
      `<office:body><office:text>${this.body.join('')}</office:text></office:body></office:document-content>`
    )
  }

  private async table(rows: Line[][]): Promise<void> {
    const columns = Math.max(...rows.map((r) => r.length))
    const name = `Table${++this.tableCount}`
    this.body.push(`<table:table table:name="${name}" table:style-name="Tbl">`)
    this.body.push(`<table:table-column table:number-columns-repeated="${columns}"/>`)
    for (const cells of rows) {
      this.body.push('<table:table-row>')
      for (let i = 0; i < columns; i++) {
        const line = cells[i] ?? { runs: [], attrs: {} }
        this.body.push(`<table:table-cell table:style-name="Cell" office:value-type="string">`)
        this.body.push(await this.paragraph({ runs: line.runs, attrs: {} }, ''))
        this.body.push('</table:table-cell>')
      }
      this.body.push('</table:table-row>')
    }
    this.body.push('</table:table>')
  }

  // Opens/closes nested <text:list> elements to reach the requested depth.
  private adjustLists(depth: number, style: string): void {
    while (this.openLists.length > depth || (depth > 0 && this.openLists.length === depth && this.openLists[depth - 1] !== style)) {
      this.openLists.pop()
      this.body.push(this.openLists.length ? '</text:list></text:list-item>' : '</text:list>')
    }
    while (this.openLists.length < depth) {
      if (this.openLists.length > 0) this.body.push('<text:list-item>')
      this.openLists.push(style)
      this.body.push(`<text:list text:style-name="${style}">`)
    }
  }

  private async paragraph(line: Line, prefix: string): Promise<string> {
    const { header, align, indent, blockquote, codeBlock, list } = line.attrs
    const parent = header ? `Heading_20_${Math.min(header, 6)}` : codeBlock ? 'Preformatted_20_Text' : blockquote ? 'Quotations' : 'Standard'
    const props: string[] = []
    if (align) props.push(`fo:text-align="${align === 'right' ? 'end' : align}"`)
    if (indent && !list) props.push(`fo:margin-left="${(indent * INDENT_CM).toFixed(2)}cm"`)
    const styleName = props.length ? this.paraStyle(parent, props.join(' ')) : parent

    let content = prefix ? escapeText(prefix) : ''
    for (const run of line.runs) {
      if ('image' in run) {
        content += await this.image(run.image)
        continue
      }
      let span = escapeText(run.text)
      const textStyle = this.textStyle(run.attrs, codeBlock)
      if (textStyle) span = `<text:span text:style-name="${textStyle}">${span}</text:span>`
      if (run.attrs.link) span = `<text:a xlink:type="simple" xlink:href="${escapeAttr(run.attrs.link)}">${span}</text:a>`
      content += span
    }
    const tag = header ? 'text:h' : 'text:p'
    const level = header ? ` text:outline-level="${header}"` : ''
    return `<${tag} text:style-name="${styleName}"${level}>${content}</${tag}>`
  }

  private paraStyle(parent: string, props: string): string {
    const key = JSON.stringify({ parent, props })
    let name = this.paraStyles.get(key)
    if (!name) {
      name = `P${this.paraStyles.size + 1}`
      this.paraStyles.set(key, name)
    }
    return name
  }

  private textStyle(a: InlineAttrs, codeBlock?: boolean): string | null {
    const p: string[] = []
    if (a.bold) p.push('fo:font-weight="bold"')
    if (a.italic) p.push('fo:font-style="italic"')
    // Links get their look from the reader's default hyperlink style.
    if (a.underline) p.push('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"')
    if (a.strike) p.push('style:text-line-through-style="solid"')
    if (a.color) p.push(`fo:color="${a.color}"`)
    if (a.background) p.push(`fo:background-color="${a.background}"`)
    else if (a.code && !codeBlock) p.push('fo:background-color="#f0f0f0"')
    if (a.size) p.push(`fo:font-size="${FONT_SIZE_PT[a.size]}pt"`)
    if (a.code || a.font === 'monospace') p.push('style:font-name="Liberation Mono" fo:font-family="\'Courier New\', monospace"')
    else if (a.font === 'serif') p.push('style:font-name="Liberation Serif" fo:font-family="\'Times New Roman\', serif"')
    if (a.script) p.push(`style:text-position="${a.script === 'super' ? 'super' : 'sub'} 58%"`)
    if (!p.length) return null
    const props = p.join(' ')
    let name = this.textStyles.get(props)
    if (!name) {
      name = `T${this.textStyles.size + 1}`
      this.textStyles.set(props, name)
    }
    return name
  }

  private async image(src: string): Promise<string> {
    const img = await loadImage(src)
    if (!img) return ''
    const name = `image${this.pictures.size + 1}.${img.type}`
    this.pictures.set(name, img.data)
    this.pictureTypes.set(name, img.mime)
    const w = (img.width / PX_PER_CM).toFixed(2)
    const h = (img.height / PX_PER_CM).toFixed(2)
    return (
      `<draw:frame draw:style-name="fr1" draw:name="${name}" text:anchor-type="as-char" svg:width="${w}cm" svg:height="${h}cm">` +
      `<draw:image xlink:href="Pictures/${name}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`
    )
  }
}

// Escapes text and encodes whitespace the way ODF requires.
function escapeText(text: string): string {
  let out = ''
  let spaces = 0
  const flush = () => {
    if (spaces === 0) return
    // A single space is literal unless it starts the run; the rest use <text:s/>.
    if (out === '' || out.endsWith('>')) out += spaces === 1 ? '<text:s/>' : `<text:s text:c="${spaces}"/>`
    else out += spaces === 1 ? ' ' : ` <text:s text:c="${spaces - 1}"/>`
    spaces = 0
  }
  for (const ch of text) {
    if (ch === ' ') {
      spaces++
      continue
    }
    flush()
    if (ch === '\t') out += '<text:tab/>'
    else out += ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch
  }
  flush()
  return out
}

function escapeAttr(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

function listLevels(kind: 'bullet' | 'number'): string {
  const bullets = ['•', '◦', '▪']
  return Array.from({ length: 10 }, (_, i) => {
    const level = i + 1
    const props =
      `<style:list-level-properties text:list-level-position-and-space-mode="label-alignment">` +
      `<style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${(level * INDENT_CM).toFixed(2)}cm" ` +
      `fo:text-indent="-0.635cm" fo:margin-left="${(level * INDENT_CM).toFixed(2)}cm"/></style:list-level-properties>`
    if (kind === 'bullet') {
      return `<text:list-level-style-bullet text:level="${level}" text:bullet-char="${bullets[i % 3]}">${props}</text:list-level-style-bullet>`
    }
    const format = ['1', 'a', 'i'][i % 3]
    return `<text:list-level-style-number text:level="${level}" style:num-suffix="." style:num-format="${format}">${props}</text:list-level-style-number>`
  }).join('')
}

const LIST_STYLES =
  `<text:list-style style:name="L1">${listLevels('bullet')}</text:list-style>` +
  `<text:list-style style:name="L2">${listLevels('number')}</text:list-style>`

const headingStyles = [1, 2, 3, 4, 5, 6]
  .map(
    (n) =>
      `<style:style style:name="Heading_20_${n}" style:display-name="Heading ${n}" style:family="paragraph" style:parent-style-name="Heading" style:next-style-name="Standard" style:default-outline-level="${n}">` +
      `<style:text-properties fo:font-size="${HEADING_SIZE_PT[n] ?? 12}pt" fo:font-weight="bold"/></style:style>`,
  )
  .join('')

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<office:document-styles ${NS} office:version="1.3"><office:styles>` +
  `<style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.21cm"/>` +
  `<style:text-properties fo:font-size="${FONT_SIZE_PT.normal}pt" style:font-name="Liberation Sans" fo:font-family="Calibri, 'Liberation Sans', sans-serif"/></style:default-style>` +
  `<style:style style:name="Standard" style:family="paragraph" style:class="text"/>` +
  `<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:class="text">` +
  `<style:paragraph-properties fo:margin-top="0.42cm" fo:margin-bottom="0.21cm" fo:keep-with-next="always"/></style:style>` +
  headingStyles +
  `<style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard" style:class="html">` +
  `<style:paragraph-properties fo:margin-left="0.5cm" fo:padding-left="0.3cm" fo:border-left="0.06cm solid #cccccc"/></style:style>` +
  `<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard" style:class="html">` +
  `<style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:background-color="#f0f0f0"/>` +
  `<style:text-properties style:font-name="Liberation Mono" fo:font-family="'Courier New', monospace" fo:font-size="10pt"/></style:style>` +
  `</office:styles></office:document-styles>`

function metaXml(title: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<office:document-meta ${NS} office:version="1.3"><office:meta>` +
    `<meta:generator>Words Online</meta:generator><dc:title>${escapeAttr(title)}</dc:title>` +
    `<meta:creation-date>${new Date().toISOString().slice(0, 19)}</meta:creation-date>` +
    `</office:meta></office:document-meta>`
  )
}

function manifestXml(pictures: Map<string, string>): string {
  const entries = [...pictures].map(
    ([name, mime]) => `<manifest:file-entry manifest:full-path="Pictures/${name}" manifest:media-type="${mime}"/>`,
  )
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">` +
    `<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/>` +
    `<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>` +
    `<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>` +
    `<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>` +
    entries.join('') +
    `</manifest:manifest>`
  )
}
