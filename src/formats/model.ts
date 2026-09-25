// Normalized document model derived from a Quill Delta, shared by exporters.

import type { Op } from 'quill'

export interface InlineAttrs {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: string // #rrggbb
  background?: string // #rrggbb
  size?: 'small' | 'large' | 'huge'
  font?: 'serif' | 'monospace'
  link?: string
  code?: boolean
  script?: 'sub' | 'super'
}

export interface BlockAttrs {
  header?: number
  list?: 'ordered' | 'bullet' | 'checked' | 'unchecked'
  indent?: number
  align?: 'center' | 'right' | 'justify'
  blockquote?: boolean
  codeBlock?: boolean
}

export type Run = { text: string; attrs: InlineAttrs } | { image: string; attrs: InlineAttrs }

export interface Line {
  runs: Run[]
  attrs: BlockAttrs
}

// Point sizes used for Quill's size classes and headings.
export const FONT_SIZE_PT = { small: 9, normal: 12, large: 18, huge: 28 }
export const HEADING_SIZE_PT: Record<number, number> = { 1: 24, 2: 18, 3: 14 }

export function deltaToLines(ops: Op[]): Line[] {
  const lines: Line[] = []
  let runs: Run[] = []
  for (const op of ops) {
    if (typeof op.insert === 'string') {
      const attrs = inlineAttrs(op.attributes)
      const parts = op.insert.split('\n')
      parts.forEach((part, i) => {
        if (part) runs.push({ text: part, attrs })
        if (i < parts.length - 1) {
          lines.push({ runs, attrs: blockAttrs(op.attributes) })
          runs = []
        }
      })
    } else if (op.insert && typeof op.insert === 'object' && 'image' in op.insert) {
      runs.push({ image: String(op.insert.image), attrs: inlineAttrs(op.attributes) })
    }
  }
  if (runs.length) lines.push({ runs, attrs: {} })
  return lines
}

function inlineAttrs(a: Record<string, unknown> = {}): InlineAttrs {
  const out: InlineAttrs = {}
  if (a.bold) out.bold = true
  if (a.italic) out.italic = true
  if (a.underline) out.underline = true
  if (a.strike) out.strike = true
  if (a.code) out.code = true
  const color = toHex(a.color)
  if (color) out.color = color
  const background = toHex(a.background)
  if (background) out.background = background
  if (a.size === 'small' || a.size === 'large' || a.size === 'huge') out.size = a.size
  if (a.font === 'serif' || a.font === 'monospace') out.font = a.font
  if (typeof a.link === 'string') out.link = a.link
  if (a.script === 'sub' || a.script === 'super') out.script = a.script
  return out
}

function blockAttrs(a: Record<string, unknown> = {}): BlockAttrs {
  const out: BlockAttrs = {}
  if (typeof a.header === 'number' && a.header >= 1 && a.header <= 6) out.header = a.header
  if (a.list === 'ordered' || a.list === 'bullet' || a.list === 'checked' || a.list === 'unchecked') out.list = a.list
  if (typeof a.indent === 'number' && a.indent > 0) out.indent = Math.min(a.indent, 8)
  if (a.align === 'center' || a.align === 'right' || a.align === 'justify') out.align = a.align
  if (a.blockquote) out.blockquote = true
  if (a['code-block']) out.codeBlock = true
  return out
}

// Accepts #rgb, #rrggbb and rgb(r, g, b); returns #rrggbb or undefined.
export function toHex(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const v = value.trim().toLowerCase()
  let m = /^#([0-9a-f]{6})$/.exec(v)
  if (m) return `#${m[1]}`
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v)
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`
  m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v)
  if (m) return '#' + m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')
  return undefined
}

export interface LoadedImage {
  data: Uint8Array
  type: 'png' | 'jpg' | 'gif' | 'bmp'
  mime: string
  width: number // px, scaled to fit the page
  height: number
}

const MAX_IMAGE_WIDTH_PX = 600

// Fetches an image (data: or http URL) and measures it. Returns null if unreachable.
export async function loadImage(src: string): Promise<LoadedImage | null> {
  try {
    const blob = await (await fetch(src)).blob()
    const data = new Uint8Array(await blob.arrayBuffer())
    const type = detectImageType(data)
    if (!type) return null
    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1, MAX_IMAGE_WIDTH_PX / bitmap.width)
    const size = { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) }
    bitmap.close()
    const mime = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp' }[type]
    return { data, type, mime, ...size }
  } catch {
    return null
  }
}

function detectImageType(d: Uint8Array): LoadedImage['type'] | null {
  if (d[0] === 0x89 && d[1] === 0x50) return 'png'
  if (d[0] === 0xff && d[1] === 0xd8) return 'jpg'
  if (d[0] === 0x47 && d[1] === 0x49) return 'gif'
  if (d[0] === 0x42 && d[1] === 0x4d) return 'bmp'
  return null
}

// Builds a Quill Delta (as plain ops) from the normalized model.
export function linesToOps(lines: Line[]): Op[] {
  const ops: Op[] = []
  for (const line of lines) {
    for (const run of line.runs) {
      const attributes = inlineToQuill(run.attrs)
      if ('image' in run) ops.push({ insert: { image: run.image }, ...(attributes && { attributes }) })
      else if (run.text) ops.push({ insert: run.text, ...(attributes && { attributes }) })
    }
    const attributes = blockToQuill(line.attrs)
    ops.push({ insert: '\n', ...(attributes && { attributes }) })
  }
  return ops
}

function inlineToQuill(a: InlineAttrs): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {}
  for (const key of ['bold', 'italic', 'underline', 'strike', 'code', 'color', 'background', 'size', 'font', 'link', 'script'] as const) {
    if (a[key]) out[key] = a[key]
  }
  return Object.keys(out).length ? out : undefined
}

function blockToQuill(a: BlockAttrs): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {}
  if (a.header) out.header = Math.min(a.header, 3)
  if (a.list) out.list = a.list
  if (a.indent) out.indent = a.indent
  if (a.align) out.align = a.align
  if (a.blockquote) out.blockquote = true
  if (a.codeBlock) out['code-block'] = 'plain'
  return Object.keys(out).length ? out : undefined
}

// Maps a point size to Quill's size classes (headings ignore it).
export function sizeFromPt(pt: number | undefined): InlineAttrs['size'] {
  if (!pt) return undefined
  if (pt <= 10) return 'small'
  if (pt >= 24) return 'huge'
  if (pt >= 15) return 'large'
  return undefined
}

export function fontFromFamily(family: string | undefined | null): InlineAttrs['font'] {
  if (!family) return undefined
  if (/mono|courier|consolas|menlo/i.test(family)) return 'monospace'
  if (/times|georgia|serif|garamond|cambria|liberation serif/i.test(family) && !/sans/i.test(family)) return 'serif'
  return undefined
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${mime};base64,${btoa(bin)}`
}

export function mimeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  return (
    { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' }[
      ext || ''
    ] || 'application/octet-stream'
  )
}

// Helpers for namespaced XML (prefix-agnostic).
export function children(el: Element, localName?: string): Element[] {
  return [...el.children].filter((c) => !localName || c.localName === localName)
}

export function child(el: Element | null | undefined, localName: string): Element | null {
  return el ? ([...el.children].find((c) => c.localName === localName) ?? null) : null
}

export function attr(el: Element | null | undefined, localName: string): string | null {
  if (!el) return null
  for (const a of el.attributes) if (a.localName === localName) return a.value
  return null
}

export function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Invalid XML in document')
  return doc
}
