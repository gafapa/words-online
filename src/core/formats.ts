import { t } from './i18n'
// Helpers shared by importers and exporters.

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

// Parses "12pt", "16px", "1.2em"-less CSS sizes into points.
export function toPt(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const n = parseFloat(value)
  if (!Number.isFinite(n)) return undefined
  if (value.endsWith('px')) return Math.round(n * 0.75 * 2) / 2
  return n
}

export interface LoadedImage {
  data: Uint8Array
  type: 'png' | 'jpg' | 'gif' | 'bmp'
  mime: string
  // Natural size in pixels.
  width: number
  height: number
}

// Fetches an image (data: or http URL) and measures it. Returns null if unreachable.
export async function loadImage(src: string): Promise<LoadedImage | null> {
  try {
    const blob = await (await fetch(src)).blob()
    const data = new Uint8Array(await blob.arrayBuffer())
    const type = detectImageType(data)
    if (!type) return null
    const bitmap = await createImageBitmap(blob)
    const size = { width: bitmap.width, height: bitmap.height }
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

export function escapeXml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

// Prefix-agnostic helpers for namespaced XML.
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
  if (doc.getElementsByTagName('parsererror').length) throw new Error(t('Invalid XML in document'))
  return doc
}
