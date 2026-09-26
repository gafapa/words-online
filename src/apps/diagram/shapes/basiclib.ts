// A subset of draw.io's "Basic" library shapes (shapes/mxBasic.js), Copyright
// (c) 2006-2025 JGraph Holdings Ltd / draw.io AG, Apache-2.0.
import { Rectangle, Shape } from '@maxgraph/core'
import type { AbstractCanvas2D, ShapeConstructor } from '@maxgraph/core'
import { bool, clamp, num } from './util'

// Shapes whose whole outline is one closed path built by `path`.
abstract class BasicShape extends Shape {
  protected dxDefault = 0.5
  abstract path(c: AbstractCanvas2D, w: number, h: number): void
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    c.translate(x, y)
    c.begin()
    this.path(c, w, h)
    c.fillAndStroke()
  }
  protected dx(w: number) {
    return clamp(num(this.style, 'dx', this.dxDefault), 0, w)
  }
}

class Cross2Shape extends BasicShape {
  path(c: AbstractCanvas2D, w: number, h: number) {
    const dx = this.dx(w)
    c.moveTo(w * 0.5 + dx, 0)
    c.lineTo(w * 0.5 + dx, h * 0.5 - dx)
    c.lineTo(w, h * 0.5 - dx)
    c.lineTo(w, h * 0.5 + dx)
    c.lineTo(w * 0.5 + dx, h * 0.5 + dx)
    c.lineTo(w * 0.5 + dx, h)
    c.lineTo(w * 0.5 - dx, h)
    c.lineTo(w * 0.5 - dx, h * 0.5 + dx)
    c.lineTo(0, h * 0.5 + dx)
    c.lineTo(0, h * 0.5 - dx)
    c.lineTo(w * 0.5 - dx, h * 0.5 - dx)
    c.lineTo(w * 0.5 - dx, 0)
    c.close()
  }
}

class RectCalloutShape extends BasicShape {
  getLabelMargins() {
    return bool(this.style, 'boundedLbl') ? new Rectangle(0, 0, 0, num(this.style, 'dy', 0.5) * this.scale) : null
  }
  path(c: AbstractCanvas2D, w: number, h: number) {
    const dx = this.dx(w)
    const dy = clamp(num(this.style, 'dy', 0.5), 0, h)
    c.moveTo(dx - dy * 0.5, h - dy)
    c.lineTo(0, h - dy)
    c.lineTo(0, 0)
    c.lineTo(w, 0)
    c.lineTo(w, h - dy)
    c.lineTo(dx + dy * 0.5, h - dy)
    c.lineTo(dx - dy, h)
    c.close()
  }
}

class RoundRectCalloutShape extends RectCalloutShape {
  path(c: AbstractCanvas2D, w: number, h: number) {
    let dx = this.dx(w)
    const dy = clamp(num(this.style, 'dy', 0.5), 0, h)
    let r = clamp(num(this.style, 'size', 10), 0, h)
    r = Math.min((h - dy) / 2, w / 2, r)
    dx = Math.min(w - r - dy * 0.5, Math.max(r + dy * 0.5, dx))
    c.moveTo(dx - dy * 0.5, h - dy)
    c.lineTo(r, h - dy)
    c.arcTo(r, r, 0, false, true, 0, h - dy - r)
    c.lineTo(0, r)
    c.arcTo(r, r, 0, false, true, r, 0)
    c.lineTo(w - r, 0)
    c.arcTo(r, r, 0, false, true, w, r)
    c.lineTo(w, h - dy - r)
    c.arcTo(r, r, 0, false, true, w - r, h - dy)
    c.lineTo(dx + dy * 0.5, h - dy)
    c.arcTo(1.9 * dy, 1.4 * dy, 0, false, true, dx - dy, h)
    c.arcTo(0.9 * dy, 1.4 * dy, 0, false, false, dx - dy * 0.5, h - dy)
    c.close()
  }
}

class OctagonShape extends BasicShape {
  path(c: AbstractCanvas2D, w: number, h: number) {
    const dx = Math.min(w * 0.5, h * 0.5, this.dx(w) * 2)
    c.moveTo(dx, 0)
    c.lineTo(w - dx, 0)
    c.lineTo(w, dx)
    c.lineTo(w, h - dx)
    c.lineTo(w - dx, h)
    c.lineTo(dx, h)
    c.lineTo(0, h - dx)
    c.lineTo(0, dx)
    c.close()
  }
}

class AcuteTriangleShape extends BasicShape {
  path(c: AbstractCanvas2D, w: number, h: number) {
    const dx = w * this.dx(w)
    c.moveTo(0, h)
    c.lineTo(dx, 0)
    c.lineTo(w, h)
    c.close()
  }
}

class ObtuseTriangleShape extends BasicShape {
  path(c: AbstractCanvas2D, w: number, h: number) {
    const dx = w * this.dx(w)
    c.moveTo(dx, h)
    c.lineTo(0, 0)
    c.lineTo(w, h)
    c.close()
  }
}

class DropShape extends BasicShape {
  path(c: AbstractCanvas2D, w: number, h: number) {
    const r = Math.min(h, w) * 0.5
    const d = h - r
    const a = Math.sqrt(Math.max(0, d * d - r * r))
    const angle = Math.atan(a / r)
    const x1 = r * Math.sin(angle)
    const y1 = r * Math.cos(angle)
    c.moveTo(w * 0.5, 0)
    c.lineTo(w * 0.5 + x1, h - r - y1)
    c.arcTo(r, r, 0, false, true, w * 0.5 + r, h - r)
    c.arcTo(r, r, 0, false, true, w * 0.5, h)
    c.arcTo(r, r, 0, false, true, w * 0.5 - r, h - r)
    c.arcTo(r, r, 0, false, true, w * 0.5 - x1, h - r - y1)
    c.close()
  }
}

class DiagSnipRectShape extends BasicShape {
  path(c: AbstractCanvas2D, w: number, h: number) {
    const dx = Math.min(w * 0.5, h * 0.5, this.dx(w) * 2)
    c.moveTo(dx, 0)
    c.lineTo(w, 0)
    c.lineTo(w, h - dx)
    c.lineTo(w - dx, h)
    c.lineTo(0, h)
    c.lineTo(0, dx)
    c.close()
  }
}

class DiagRoundRectShape extends BasicShape {
  path(c: AbstractCanvas2D, w: number, h: number) {
    const dx = Math.min(w * 0.5, h * 0.5, this.dx(w) * 2)
    c.moveTo(dx, 0)
    c.lineTo(w, 0)
    c.lineTo(w, h - dx)
    c.arcTo(dx, dx, 0, false, true, w - dx, h)
    c.lineTo(0, h)
    c.lineTo(0, dx)
    c.arcTo(dx, dx, 0, false, true, dx, 0)
    c.close()
  }
}

class CornerRoundRectShape extends BasicShape {
  path(c: AbstractCanvas2D, w: number, h: number) {
    const dx = Math.min(w * 0.5, h * 0.5, this.dx(w) * 2)
    c.moveTo(dx, 0)
    c.lineTo(w, 0)
    c.lineTo(w, h)
    c.lineTo(0, h)
    c.lineTo(0, dx)
    c.arcTo(dx, dx, 0, false, true, dx, 0)
    c.close()
  }
}

class PlaqueShape extends BasicShape {
  path(c: AbstractCanvas2D, w: number, h: number) {
    const dx = Math.min(w * 0.5, h * 0.5, this.dx(w) * 2)
    c.moveTo(w - dx, 0)
    c.arcTo(dx, dx, 0, false, false, w, dx)
    c.lineTo(w, h - dx)
    c.arcTo(dx, dx, 0, false, false, w - dx, h)
    c.lineTo(dx, h)
    c.arcTo(dx, dx, 0, false, false, 0, h - dx)
    c.lineTo(0, dx)
    c.arcTo(dx, dx, 0, false, false, dx, 0)
    c.close()
  }
}

class FrameShape extends BasicShape {
  path(c: AbstractCanvas2D, w: number, h: number) {
    const dx = Math.min(w * 0.5, h * 0.5, this.dx(w))
    c.moveTo(w, 0)
    c.lineTo(w, h)
    c.lineTo(0, h)
    c.lineTo(0, 0)
    c.close()
    c.moveTo(dx, dx)
    c.lineTo(dx, h - dx)
    c.lineTo(w - dx, h - dx)
    c.lineTo(w - dx, dx)
    c.close()
  }
}

class DonutShape extends BasicShape {
  path(c: AbstractCanvas2D, w: number, h: number) {
    const dx = Math.min(w * 0.5, h * 0.5, this.dx(w))
    c.moveTo(0, h * 0.5)
    c.arcTo(w * 0.5, h * 0.5, 0, false, true, w * 0.5, 0)
    c.arcTo(w * 0.5, h * 0.5, 0, false, true, w, h * 0.5)
    c.arcTo(w * 0.5, h * 0.5, 0, false, true, w * 0.5, h)
    c.arcTo(w * 0.5, h * 0.5, 0, false, true, 0, h * 0.5)
    c.close()
    c.moveTo(w * 0.5, dx)
    c.arcTo(w * 0.5 - dx, h * 0.5 - dx, 0, false, false, dx, h * 0.5)
    c.arcTo(w * 0.5 - dx, h * 0.5 - dx, 0, false, false, w * 0.5, h - dx)
    c.arcTo(w * 0.5 - dx, h * 0.5 - dx, 0, false, false, w - dx, h * 0.5)
    c.arcTo(w * 0.5 - dx, h * 0.5 - dx, 0, false, false, w * 0.5, dx)
    c.close()
  }
}

class LayeredRectShape extends Shape {
  private size(w: number, h: number) {
    return Math.min(w * 0.5, h * 0.5, clamp(num(this.style, 'dx', 0.5), 0, w))
  }
  getLabelMargins(rect: Rectangle | null) {
    if (!bool(this.style, 'boundedLbl') || !rect) return null
    const dx = this.size(rect.width / this.scale, rect.height / this.scale) * this.scale
    return new Rectangle(0, 0, dx, dx)
  }
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    c.translate(x, y)
    const dx = this.size(w, h)
    const rect = (x0: number, y0: number, x1: number, y1: number) => {
      c.begin()
      c.moveTo(x0, y0)
      c.lineTo(x1, y0)
      c.lineTo(x1, y1)
      c.lineTo(x0, y1)
      c.close()
      c.fillAndStroke()
    }
    rect(dx, dx, w, h)
    rect(dx * 0.5, dx * 0.5, w - dx * 0.5, h - dx * 0.5)
    rect(0, 0, w - dx, h - dx)
  }
}

export const BASIC_LIB_SHAPES: [string, ShapeConstructor][] = [
  ['mxgraph.basic.cross2', Cross2Shape],
  ['mxgraph.basic.rectCallout', RectCalloutShape],
  ['mxgraph.basic.roundRectCallout', RoundRectCalloutShape],
  ['mxgraph.basic.octagon2', OctagonShape],
  ['mxgraph.basic.acute_triangle', AcuteTriangleShape],
  ['mxgraph.basic.obtuse_triangle', ObtuseTriangleShape],
  ['mxgraph.basic.drop', DropShape],
  ['mxgraph.basic.diag_snip_rect', DiagSnipRectShape],
  ['mxgraph.basic.diag_round_rect', DiagRoundRectShape],
  ['mxgraph.basic.corner_round_rect', CornerRoundRectShape],
  ['mxgraph.basic.plaque', PlaqueShape],
  ['mxgraph.basic.frame', FrameShape],
  ['mxgraph.basic.donut', DonutShape],
  ['mxgraph.basic.layered_rect', LayeredRectShape],
]
