// draw.io style strings ↔ maxGraph cell styles, and draw.io's default
// stylesheet (war/styles/default.xml, Copyright (c) JGraph Holdings Ltd /
// draw.io AG, Apache-2.0) so base names like "ellipse", "text" or "swimlane"
// resolve as in draw.io.
import type { CellStateStyle, CellStyle, Stylesheet } from '@maxgraph/core'

// Keys whose values must stay strings even when they look numeric.
const STRING_KEYS = new Set(['dashPattern', 'image', 'fontFamily', 'points', 'link', 'tooltip', 'label'])
// draw.io's theme-dependent "default" color, resolved for a light theme.
const DEFAULT_COLORS: Record<string, string> = {
  fillColor: '#ffffff',
  strokeColor: '#000000',
  fontColor: '#000000',
  labelBackgroundColor: '#ffffff',
  swimlaneFillColor: '#ffffff',
  labelBorderColor: '#000000',
  gradientColor: 'none',
}
const NUMERIC = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/

// Parses "base1;key=value;..." into a maxGraph CellStyle (numbers converted,
// base names in baseStyleNames, a leading ";" ignores the default style).
export function parseDrawioStyle(input: string | null | undefined): CellStyle {
  const style: Record<string, unknown> = {}
  if (!input) return style as CellStyle
  if (input.startsWith(';')) style.ignoreDefaultStyle = true
  const bases: string[] = []
  for (const part of input.split(';')) {
    if (!part) continue
    const eq = part.indexOf('=')
    if (eq < 0) {
      bases.push(part)
      continue
    }
    const key = part.slice(0, eq)
    let value: unknown = part.slice(eq + 1)
    // "inherit" (take the parent cell's color) needs the model: fall back to the default.
    if (value === 'inherit') continue
    if (value === 'default' && key in DEFAULT_COLORS) value = DEFAULT_COLORS[key]
    else if (!STRING_KEYS.has(key) && NUMERIC.test(value as string)) value = parseFloat(value as string)
    style[key === 'autosize' ? 'autoSize' : key] = value
  }
  if (bases.length) style.baseStyleNames = bases
  return style as CellStyle
}

type Styles = Record<string, Record<string, string | number>>

const VERTEX: Record<string, string | number> = {
  shape: 'label',
  perimeter: 'rectanglePerimeter',
  fontSize: 12,
  fontFamily: 'Helvetica',
  align: 'center',
  verticalAlign: 'middle',
  fillColor: '#ffffff',
  strokeColor: '#000000',
  fontColor: '#000000',
  // draw.io's default (maxGraph uses east).
  gradientDirection: 'south',
}

const EDGE: Record<string, string | number> = {
  shape: 'connector',
  labelBackgroundColor: '#ffffff',
  endArrow: 'classic',
  fontSize: 11,
  fontFamily: 'Helvetica',
  align: 'center',
  verticalAlign: 'middle',
  rounded: 1,
  strokeColor: '#000000',
  fontColor: '#000000',
}

const fancy = { shadow: 1, glass: 1 }
const colorSets: Record<string, [string, string, string]> = {
  gray: ['#B3B3B3', '#F5F5F5', '#666666'],
  blue: ['#7EA6E0', '#DAE8FC', '#6C8EBF'],
  green: ['#97D077', '#D5E8D4', '#82B366'],
  turquoise: ['#67AB9F', '#D5E8D4', '#6A9153'],
  yellow: ['#FFD966', '#FFF2CC', '#D6B656'],
  orange: ['#FFA500', '#FFCD28', '#D79B00'],
  red: ['#EA6B66', '#F8CECC', '#B85450'],
  pink: ['#B5739D', '#E6D0DE', '#996185'],
  purple: ['#8C6C9C', '#E1D5E7', '#9673A6'],
}

const text = { fillColor: 'none', gradientColor: 'none', strokeColor: 'none', align: 'left', verticalAlign: 'top' }
const label = { fontStyle: 1, align: 'left', verticalAlign: 'middle', spacing: 2, spacingLeft: 52, imageWidth: 42, imageHeight: 42, rounded: 1 }
const image = { shape: 'image', labelBackgroundColor: '#ffffff', verticalAlign: 'top', verticalLabelPosition: 'bottom' }

export const DRAWIO_NAMED_STYLES: Styles = {
  text,
  edgeLabel: { ...text, labelBackgroundColor: '#ffffff', fontSize: 11 },
  label,
  icon: {
    ...label,
    align: 'center',
    imageAlign: 'center',
    verticalLabelPosition: 'bottom',
    verticalAlign: 'top',
    labelBackgroundColor: '#ffffff',
    spacing: 0,
    spacingLeft: 0,
    spacingTop: 6,
    fontStyle: 0,
    imageWidth: 48,
    imageHeight: 48,
  },
  swimlane: { shape: 'swimlane', fontSize: 12, fontStyle: 1, startSize: 23 },
  group: { verticalAlign: 'top', fillColor: 'none', strokeColor: 'none', gradientColor: 'none', pointerEvents: 0 },
  ellipse: { shape: 'ellipse', perimeter: 'ellipsePerimeter' },
  rhombus: { shape: 'rhombus', perimeter: 'rhombusPerimeter' },
  triangle: { shape: 'triangle', perimeter: 'trianglePerimeter' },
  line: { shape: 'line', strokeWidth: 4, labelBackgroundColor: '#ffffff', verticalAlign: 'top', spacingTop: 8 },
  image,
  roundImage: { ...image, perimeter: 'ellipsePerimeter' },
  rhombusImage: { ...image, perimeter: 'rhombusPerimeter' },
  arrow: { shape: 'arrow', edgeStyle: 'none', fillColor: '#ffffff' },
  fancy,
  ...Object.fromEntries(
    Object.entries(colorSets).flatMap(([name, [gradientColor, fillColor, strokeColor]]) => [
      [name, { ...fancy, gradientColor, fillColor, strokeColor }],
      [`plain-${name}`, { gradientColor, fillColor, strokeColor }],
    ]),
  ),
}

// Replaces the stylesheet's defaults with draw.io's and adds its named styles.
export function configureDrawioStylesheet(stylesheet: Stylesheet) {
  stylesheet.putDefaultVertexStyle({ ...VERTEX } as CellStateStyle)
  stylesheet.putDefaultEdgeStyle({ ...EDGE } as CellStateStyle)
  for (const [name, style] of Object.entries(DRAWIO_NAMED_STYLES)) stylesheet.putCellStyle(name, { ...style } as CellStateStyle)
}
