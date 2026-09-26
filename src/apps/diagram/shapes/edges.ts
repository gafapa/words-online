// Edge shapes and markers ported from draw.io (grapheditor/Shapes.js,
// shapes/er/mxER.js, mxgraph/src/shape/mxMarker.js), Copyright (c) 2006-2025
// JGraph Holdings Ltd / draw.io AG, Apache-2.0.
import { ArrowConnectorShape, EdgeMarkerRegistry, EdgeStyleRegistry, Point, constants } from '@maxgraph/core'
import type { AbstractCanvas2D, CellState, EdgeStyleFunction, MarkerFactoryFunction, ShapeConstructor } from '@maxgraph/core'
import { num } from './util'

const ARROW_SIZE = constants.ARROW_SIZE

// Filled arrow drawn along the edge ("flexArrow"): width, startWidth, endWidth.
export class FlexArrowShape extends ArrowConnectorShape {
  apply(state: CellState) {
    super.apply(state)
    this.spacing = 0
    this.startSize = num(this.style, 'startSize', ARROW_SIZE / 5) * 3
    this.endSize = num(this.style, 'endSize', ARROW_SIZE / 5) * 3
  }
  getEdgeWidth() {
    return num(this.style, 'width', 10) + Math.max(0, this.strokeWidth - 1)
  }
  getStartArrowWidth() {
    return this.getEdgeWidth() + num(this.style, 'startWidth', 20)
  }
  getEndArrowWidth() {
    return this.getEdgeWidth() + num(this.style, 'endWidth', 20)
  }
}

// Double line ("link"), open ended.
export class LinkShape extends ArrowConnectorShape {
  apply(state: CellState) {
    super.apply(state)
    this.spacing = 0
    this.startSize = num(this.style, 'startSize', ARROW_SIZE / 5) * 3
    this.endSize = num(this.style, 'endSize', ARROW_SIZE / 5) * 3
  }
  isOpenEnded() {
    return true
  }
  getEdgeWidth() {
    return num(this.style, 'width', 4) + Math.max(0, this.strokeWidth - 1)
  }
  isArrowRounded() {
    return this.isRounded
  }
}

export const EDGE_SHAPES: [string, ShapeConstructor][] = [
  ['flexArrow', FlexArrowShape],
  ['link', LinkShape],
]

function finish(c: AbstractCanvas2D, filled: boolean) {
  if (filled) c.fillAndStroke()
  else c.stroke()
}

const lineMarker = (draw: (c: AbstractCanvas2D, pe: Point, nx: number, ny: number) => void): MarkerFactoryFunction =>
  (c, _shape, _type, pe, unitX, unitY, size, _source, sw) => {
    const nx = unitX * (size + sw + 1)
    const ny = unitY * (size + sw + 1)
    const p = pe.clone()
    return () => {
      c.begin()
      draw(c, p, nx, ny)
      c.stroke()
    }
  }

const dash = lineMarker((c, pe, nx, ny) => {
  c.moveTo(pe.x - nx / 2 - ny / 2, pe.y - ny / 2 + nx / 2)
  c.lineTo(pe.x + ny / 2 - (3 * nx) / 2, pe.y - (3 * ny) / 2 - nx / 2)
})

const cross = lineMarker((c, pe, nx, ny) => {
  c.moveTo(pe.x - nx / 2 - ny / 2, pe.y - ny / 2 + nx / 2)
  c.lineTo(pe.x + ny / 2 - (3 * nx) / 2, pe.y - (3 * ny) / 2 - nx / 2)
  c.moveTo(pe.x - nx / 2 + ny / 2, pe.y - ny / 2 - nx / 2)
  c.lineTo(pe.x - ny / 2 - (3 * nx) / 2, pe.y - (3 * ny) / 2 + nx / 2)
})

const baseDash = lineMarker((c, pe, nx, ny) => {
  c.moveTo(pe.x - ny / 2, pe.y + nx / 2)
  c.lineTo(pe.x + ny / 2, pe.y - nx / 2)
})

const erOne = lineMarker((c, pe, nx, ny) => {
  c.moveTo(pe.x - nx / 2 - ny / 2, pe.y - ny / 2 + nx / 2)
  c.lineTo(pe.x - nx / 2 + ny / 2, pe.y - ny / 2 - nx / 2)
})

const erMandOne = lineMarker((c, pe, nx, ny) => {
  c.moveTo(pe.x - nx / 2 - ny / 2, pe.y - ny / 2 + nx / 2)
  c.lineTo(pe.x - nx / 2 + ny / 2, pe.y - ny / 2 - nx / 2)
  c.moveTo(pe.x - nx - ny / 2, pe.y - ny + nx / 2)
  c.lineTo(pe.x - nx + ny / 2, pe.y - ny - nx / 2)
})

const erMany = lineMarker((c, pe, nx, ny) => {
  c.moveTo(pe.x + ny / 2, pe.y - nx / 2)
  c.lineTo(pe.x - nx, pe.y - ny)
  c.lineTo(pe.x - ny / 2, pe.y + nx / 2)
})

const erOneToMany = lineMarker((c, pe, nx, ny) => {
  c.moveTo(pe.x - nx - ny / 2, pe.y - ny + nx / 2)
  c.lineTo(pe.x - nx + ny / 2, pe.y - ny - nx / 2)
  c.moveTo(pe.x + ny / 2, pe.y - nx / 2)
  c.lineTo(pe.x - nx, pe.y - ny)
  c.lineTo(pe.x - ny / 2, pe.y + nx / 2)
})

// ERzeroToMany / ERzeroToOne: circle plus crow's foot / bar. When filled the
// circle is painted white (draw.io behaviour) and the line runs to the circle.
function erZero(many: boolean): MarkerFactoryFunction {
  return (c, shape, _type, pe, unitX, unitY, size, _source, sw, filled) => {
    const nx = unitX * (size + sw + 1)
    const ny = unitY * (size + sw + 1)
    const a = size / 2
    const px = pe.x
    const py = pe.y
    if (!filled) {
      pe.x -= 2 * nx - (unitX * sw) / 2
      pe.y -= 2 * ny - (unitY * sw) / 2
    }
    return () => {
      c.begin()
      c.ellipse(px - 1.5 * nx - a, py - 1.5 * ny - a, 2 * a, 2 * a)
      if (filled) {
        c.setFillColor('#ffffff')
        c.fillAndStroke()
        c.setFillColor(shape.stroke)
      } else {
        c.stroke()
      }
      c.begin()
      if (many) {
        c.moveTo(px + ny / 2, py - nx / 2)
        c.lineTo(px - nx, py - ny)
        c.lineTo(px - ny / 2, py + nx / 2)
        if (!filled) {
          c.moveTo(px - nx, py - ny)
          c.lineTo(px, py)
        }
      } else {
        c.moveTo(px - nx / 2 - ny / 2, py - ny / 2 + nx / 2)
        c.lineTo(px - nx / 2 + ny / 2, py - ny / 2 - nx / 2)
        if (!filled) {
          c.moveTo(px - nx - (unitX * sw) / 2, py - ny - (unitY * sw) / 2)
          c.lineTo(px, py)
        }
      }
      c.stroke()
    }
  }
}

const box: MarkerFactoryFunction = (c, _shape, _type, pe, unitX, unitY, size, _source, sw, filled) => {
  const nx = unitX * (size + sw + 1)
  const ny = unitY * (size + sw + 1)
  const px = pe.x + nx / 2
  const py = pe.y + ny / 2
  pe.x -= nx
  pe.y -= ny
  return () => {
    c.begin()
    c.moveTo(px - nx / 2 - ny / 2, py - ny / 2 + nx / 2)
    c.lineTo(px - nx / 2 + ny / 2, py - ny / 2 - nx / 2)
    c.lineTo(px + ny / 2 - (3 * nx) / 2, py - (3 * ny) / 2 - nx / 2)
    c.lineTo(px - ny / 2 - (3 * nx) / 2, py - (3 * ny) / 2 + nx / 2)
    c.close()
    finish(c, filled)
  }
}

const circle: MarkerFactoryFunction = (c, _shape, _type, pe, unitX, unitY, size, _source, sw, filled) => {
  const s = size + sw
  const p = pe.clone()
  pe.x -= unitX * (2 * s + sw)
  pe.y -= unitY * (2 * s + sw)
  const ux = unitX * (s + sw)
  const uy = unitY * (s + sw)
  return () => {
    c.ellipse(p.x - ux - s, p.y - uy - s, 2 * s, 2 * s)
    finish(c, filled)
  }
}

const circlePlus: MarkerFactoryFunction = (c, shape, type, pe, unitX, unitY, size, source, sw, filled) => {
  const p = pe.clone()
  const fn = circle(c, shape, type, pe, unitX, unitY, size, source, sw, filled)
  const nx = unitX * (size + 2 * sw)
  const ny = unitY * (size + 2 * sw)
  return () => {
    fn()
    c.begin()
    c.moveTo(p.x - unitX * sw, p.y - unitY * sw)
    c.lineTo(p.x - 2 * nx + unitX * sw, p.y - 2 * ny + unitY * sw)
    c.moveTo(p.x - nx - ny + unitY * sw, p.y - ny + nx - unitX * sw)
    c.lineTo(p.x + ny - nx - unitY * sw, p.y - ny - nx + unitX * sw)
    c.stroke()
  }
}

const halfCircle: MarkerFactoryFunction = (c, _shape, _type, pe, unitX, unitY, size, _source, sw) => {
  const nx = unitX * (size + sw + 1)
  const ny = unitY * (size + sw + 1)
  const p = pe.clone()
  pe.x -= nx
  pe.y -= ny
  const q = pe.clone()
  return () => {
    c.begin()
    c.moveTo(p.x - ny, p.y + nx)
    c.quadTo(q.x - ny, q.y + nx, q.x, q.y)
    c.quadTo(q.x + ny, q.y - nx, p.x + ny, p.y - nx)
    c.stroke()
  }
}

const async: MarkerFactoryFunction = (c, _shape, _type, pe, unitX, unitY, size, source, sw, filled) => {
  const endOffsetX = unitX * sw * 1.118
  const endOffsetY = unitY * sw * 1.118
  const ux = unitX * (size + sw)
  const uy = unitY * (size + sw)
  const p = pe.clone()
  p.x -= endOffsetX
  p.y -= endOffsetY
  pe.x += -ux - endOffsetX
  pe.y += -uy - endOffsetY
  return () => {
    c.begin()
    c.moveTo(p.x, p.y)
    if (source) c.lineTo(p.x - ux - uy / 2, p.y - uy + ux / 2)
    else c.lineTo(p.x + uy / 2 - ux, p.y - uy - ux / 2)
    c.lineTo(p.x - ux, p.y - uy)
    c.close()
    finish(c, filled)
  }
}

const openAsync: MarkerFactoryFunction = (c, _shape, _type, pe, unitX, unitY, size, source, sw) => {
  const ux = unitX * (size + sw)
  const uy = unitY * (size + sw)
  const p = pe.clone()
  return () => {
    c.begin()
    c.moveTo(p.x, p.y)
    if (source) c.lineTo(p.x - ux - uy / 2, p.y - uy + ux / 2)
    else c.lineTo(p.x + uy / 2 - ux, p.y - uy - ux / 2)
    c.stroke()
  }
}

const doubleBlock: MarkerFactoryFunction = (c, _shape, _type, pe, unitX, unitY, size, _source, sw, filled) => {
  const endOffsetX = unitX * sw * 1.118
  const endOffsetY = unitY * sw * 1.118
  const ux = unitX * (size + sw)
  const uy = unitY * (size + sw)
  const p = pe.clone()
  p.x -= endOffsetX
  p.y -= endOffsetY
  pe.x += -ux * 2 - endOffsetX
  pe.y += -uy * 2 - endOffsetY
  return () => {
    c.begin()
    c.moveTo(p.x, p.y)
    c.lineTo(p.x - ux - uy / 2, p.y - uy + ux / 2)
    c.lineTo(p.x + uy / 2 - ux, p.y - uy - ux / 2)
    c.close()
    c.moveTo(p.x - ux, p.y - uy)
    c.lineTo(p.x - 2 * ux - 0.5 * uy, p.y + 0.5 * ux - 2 * uy)
    c.lineTo(p.x - 2 * ux + 0.5 * uy, p.y - 0.5 * ux - 2 * uy)
    c.close()
    finish(c, filled)
  }
}

const manyOptional: MarkerFactoryFunction = (c, _shape, _type, pe, unitX, unitY, size, _source, sw, filled) => {
  const nx = unitX * (size + sw + 1)
  const ny = unitY * (size + sw + 1)
  const a = size / 2
  const px = pe.x
  const py = pe.y
  pe.x -= 2 * nx - (unitX * sw) / 2
  pe.y -= 2 * ny - (unitY * sw) / 2
  return () => {
    c.begin()
    c.ellipse(px - 1.5 * nx - a, py - 1.5 * ny - a, 2 * a, 2 * a)
    finish(c, filled)
    c.begin()
    c.moveTo(px, py)
    c.lineTo(px - nx, py - ny)
    c.moveTo(px + ny / 2, py - nx / 2)
    c.lineTo(px - nx, py - ny)
    c.lineTo(px - ny / 2, py + nx / 2)
    c.stroke()
  }
}

// Markers draw.io adds on top of the mxGraph core set (classic, classicThin,
// block, blockThin, open, openThin, oval, diamond, diamondThin), which maxGraph
// already registers. "none" needs no marker: unknown names draw nothing.
export const EDGE_MARKERS: [string, MarkerFactoryFunction][] = [
  ['dash', dash],
  ['cross', cross],
  ['baseDash', baseDash],
  ['box', box],
  ['circle', circle],
  ['circlePlus', circlePlus],
  ['halfCircle', halfCircle],
  ['async', async],
  ['openAsync', openAsync],
  ['doubleBlock', doubleBlock],
  ['manyOptional', manyOptional],
  ['ERone', erOne],
  ['ERmandOne', erMandOne],
  ['ERmany', erMany],
  ['ERoneToMany', erOneToMany],
  ['ERzeroToMany', erZero(true)],
  ['ERzeroToOne', erZero(false)],
]

export function registerMarkers() {
  for (const [name, fn] of EDGE_MARKERS) EdgeMarkerRegistry.add(name, fn)
  EdgeStyleRegistry.add('isometricEdgeStyle', isometricEdgeStyle, { handlerKind: 'elbow' })
}

// Isometric elbow (edgeStyle=isometricEdgeStyle, elbow=vertical): two segments
// along the 30° isometric axes through the first waypoint (or the middle).
const ISO_H = new Point(Math.cos(Math.PI / 6), -Math.sin(Math.PI / 6))
const ISO_V = new Point(Math.cos((-150 * Math.PI) / 180), Math.sin((-150 * Math.PI) / 180))

const isometricEdgeStyle: EdgeStyleFunction = (state, source, target, points, result) => {
  const view = state.view
  const pts = state.absolutePoints
  let p0 = pts[0] ?? (source ? new Point(source.getCenterX(), source.getCenterY()) : null)
  const pe = pts[pts.length - 1] ?? (target ? new Point(target.getCenterX(), target.getCenterY()) : null)
  if (!p0 || !pe) return
  const horizontal = String(state.style.elbow ?? 'horizontal') === 'horizontal'
  const [a1, a2, b1, b2] = [ISO_H.x, ISO_H.y, ISO_V.x, ISO_V.y]
  const lineTo = (x: number, y: number, first: boolean) => {
    const c1 = x - p0!.x
    const c2 = y - p0!.y
    const h = (b2 * c1 - b1 * c2) / (a1 * b2 - a2 * b1)
    const v = (a2 * c1 - a1 * c2) / (a2 * b1 - a1 * b2)
    const along = (dx: number, dy: number) => {
      p0 = new Point(p0!.x + dx, p0!.y + dy)
      result.push(p0)
    }
    if (horizontal) {
      if (first) along(a1 * h, a2 * h)
      along(b1 * v, b2 * v)
    } else {
      if (first) along(b1 * v, b2 * v)
      along(a1 * h, a2 * h)
    }
  }
  const pt = points?.[0] ? view.transformControlPoint(state, points[0]) : new Point(p0.x + (pe.x - p0.x) / 2, p0.y + (pe.y - p0.y) / 2)
  if (!pt) return
  lineTo(pt.x, pt.y, true)
  lineTo(pe.x, pe.y, false)
}
