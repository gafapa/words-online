// Style accessors for shapes ported from draw.io. maxGraph keeps the cell style
// as an object whose values may be numbers (converted from the style string) or
// strings, so every read goes through these tolerant helpers.
import type { CellStateStyle, Shape } from '@maxgraph/core'
import { Point } from '@maxgraph/core'

type AnyStyle = Record<string, unknown>

export function styleOf(shape: Shape): AnyStyle {
  return (shape.style ?? {}) as unknown as AnyStyle
}

export function raw(style: CellStateStyle | AnyStyle | null | undefined, key: string): unknown {
  return style ? (style as AnyStyle)[key] : undefined
}

export function num(style: CellStateStyle | AnyStyle | null | undefined, key: string, def: number): number {
  const v = raw(style, key)
  if (v == null || v === '') return def
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : def
}

export function bool(style: CellStateStyle | AnyStyle | null | undefined, key: string, def = false): boolean {
  const v = raw(style, key)
  if (v == null || v === '') return def
  return v === true || v === 1 || v === '1' || v === 'true'
}

export function str(style: CellStateStyle | AnyStyle | null | undefined, key: string, def: string): string
export function str(style: CellStateStyle | AnyStyle | null | undefined, key: string, def?: string | null): string | null
export function str(style: CellStateStyle | AnyStyle | null | undefined, key: string, def: string | null = null): string | null {
  const v = raw(style, key)
  return v == null ? def : String(v)
}

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

// draw.io's "size" parameter: an absolute length when fixedSize=1 (clamped to
// fixedMax), else a fraction of `extent` (clamped to relMax).
export function sizeParam(shape: Shape, extent: number, rel: number, fixed: number, fixedMax: number, relMax = 1): number {
  const style = styleOf(shape)
  return bool(style, 'fixedSize')
    ? clamp(num(style, 'size', fixed), 0, fixedMax)
    : extent * clamp(num(style, 'size', rel), 0, relMax)
}

// Half of arcSize, draw.io's default for rounded polygon corners (LINE_ARCSIZE / 2).
export function lineArc(shape: Shape): number {
  return num(styleOf(shape), 'arcSize', 20) / 2
}

export const pt = (x: number, y: number) => new Point(x, y)
