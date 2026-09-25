// Bundled draw.io stencil sets (XML shape descriptions) registered under
// draw.io's names, e.g. "mxgraph.flowchart.multi-document".
import { StencilShape, StencilShapeRegistry } from '@maxgraph/core'
import type { AbstractCanvas2D, Rectangle, Shape } from '@maxgraph/core'
import basicXml from './stencils/basic.xml?raw'
import flowchartXml from './stencils/flowchart.xml?raw'

export const STENCIL_SETS = [basicXml, flowchartXml]

const COLOR = /^(#|rgb|hsl)/i

// draw.io stencils may name a style key as color (e.g. <fillcolor
// color="accentColor" default="#ffff00"/>), plus "stroke"/"fill"/"font".
export class DrawioStencil extends StencilShape {
  private color(shape: Shape, node: Element): string | null {
    const value = node.getAttribute('color')
    if (!value || value === 'none' || COLOR.test(value)) return value
    const style = (shape.style ?? {}) as Record<string, unknown>
    if (value === 'stroke') return shape.stroke
    if (value === 'fill') return shape.fill
    if (value === 'font') return String(style.fontColor ?? '#000000')
    const v = style[value]
    if (v != null && v !== 'default') return String(v)
    const def = node.getAttribute('default')
    if (def != null) return def
    return node.nodeName === 'fillcolor' ? '#ffffff' : '#000000'
  }
  drawNode(canvas: AbstractCanvas2D, shape: Shape, node: Element, aspect: Rectangle, disableShadow: boolean, paint: boolean) {
    const name = node.nodeName
    if (paint && (name === 'fillcolor' || name === 'strokecolor' || name === 'fontcolor')) {
      const color = this.color(shape, node)
      if (name === 'fillcolor') canvas.setFillColor(color)
      else if (name === 'strokecolor') canvas.setStrokeColor(color)
      else canvas.setFontColor(color)
      return
    }
    super.drawNode(canvas, shape, node, aspect, disableShadow, paint)
  }
}

// Mirrors draw.io's mxStencilRegistry.parseStencilSet naming: lowercase
// package name + shape name with spaces replaced by underscores.
export function registerStencilSet(xml: string): string[] {
  const root = new DOMParser().parseFromString(xml, 'text/xml').documentElement
  const pkg = (root.getAttribute('name') ?? '').toLowerCase()
  const names: string[] = []
  for (let node = root.firstElementChild; node; node = node.nextElementSibling) {
    const name = node.getAttribute('name')
    if (node.nodeName !== 'shape' || !name) continue
    const id = (pkg ? pkg + '.' : '') + name.replace(/ /g, '_').toLowerCase()
    // Registration is idempotent: the first definition of a name wins.
    if (!StencilShapeRegistry.get(id)) StencilShapeRegistry.add(id, new DrawioStencil(node))
    names.push(id)
  }
  return names
}

export function registerStencils() {
  for (const xml of STENCIL_SETS) registerStencilSet(xml)
}
