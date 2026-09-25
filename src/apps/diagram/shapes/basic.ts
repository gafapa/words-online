// General-purpose vertex shapes ported from draw.io (grapheditor/Shapes.js,
// shapes/mxFlowchart.js, shapes/mxArrows.js), Copyright (c) 2006-2025 JGraph
// Holdings Ltd / draw.io AG, Apache-2.0. Geometry and style parameters follow
// the originals so diagrams render the same in both editors.
import {
  ActorShape,
  CylinderShape,
  DoubleEllipseShape,
  EllipseShape,
  Rectangle,
  RectangleShape,
  RhombusShape,
  Shape,
  constants,
} from '@maxgraph/core'
import type { AbstractCanvas2D, Point, ShapeConstructor } from '@maxgraph/core'
import { bool, clamp, lineArc, num, pt, sizeParam, str, styleOf } from './util'

const NONE = constants.NONE

// draw.io's mxActor-style path shapes all start from the same base.
abstract class PathShape extends ActorShape {
  isRoundable() {
    return true
  }
  // Rounded polygon through the given points (draw.io's addPoints + arcSize).
  poly(c: AbstractCanvas2D, pts: Point[], close = true, exclude?: number[]) {
    this.addPoints(c, pts, this.isRounded, lineArc(this), close, exclude)
  }
}

function darkOverlay(c: AbstractCanvas2D, op: number) {
  c.setFillAlpha(Math.abs(op))
  c.setFillColor(op < 0 ? '#FFFFFF' : '#000000')
}

// Cube with size and darkOpacity/darkOpacity2 shading.
export class CubeShape extends CylinderShape {
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const style = styleOf(this)
    const s = clamp(num(style, 'size', 20), 0, Math.min(w, h))
    const op = clamp(num(style, 'darkOpacity', 0), -1, 1)
    const op2 = clamp(num(style, 'darkOpacity2', 0), -1, 1)
    c.translate(x, y)
    c.begin()
    c.moveTo(0, 0)
    c.lineTo(w - s, 0)
    c.lineTo(w, s)
    c.lineTo(w, h)
    c.lineTo(s, h)
    c.lineTo(0, h - s)
    c.lineTo(0, 0)
    c.close()
    c.fillAndStroke()
    if (this.outline) return
    c.setShadow(false)
    if (op !== 0) {
      darkOverlay(c, op)
      c.begin()
      c.moveTo(0, 0)
      c.lineTo(w - s, 0)
      c.lineTo(w, s)
      c.lineTo(s, s)
      c.close()
      c.fill()
    }
    if (op2 !== 0) {
      darkOverlay(c, op2)
      c.begin()
      c.moveTo(0, 0)
      c.lineTo(s, s)
      c.lineTo(s, h)
      c.lineTo(0, h - s)
      c.close()
      c.fill()
    }
    c.begin()
    c.moveTo(s, h)
    c.lineTo(s, s)
    c.lineTo(0, 0)
    c.moveTo(s, s)
    c.lineTo(w, s)
    c.stroke()
  }
  getLabelMargins() {
    if (!bool(this.style, 'boundedLbl')) return null
    const s = num(this.style, 'size', 20) * this.scale
    return new Rectangle(s, s, 0, 0)
  }
}

// Isometric cube (isoAngle).
export class IsoCube2Shape extends Shape {
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const angle = (clamp(num(this.style, 'isoAngle', 15), 0.01, 94) * Math.PI) / 200
    const isoH = Math.min(w * Math.tan(angle), h * 0.5)
    c.translate(x, y)
    c.begin()
    c.moveTo(w * 0.5, 0)
    c.lineTo(w, isoH)
    c.lineTo(w, h - isoH)
    c.lineTo(w * 0.5, h)
    c.lineTo(0, h - isoH)
    c.lineTo(0, isoH)
    c.close()
    c.fillAndStroke()
    c.setShadow(false)
    c.begin()
    c.moveTo(0, isoH)
    c.lineTo(w * 0.5, 2 * isoH)
    c.lineTo(w, isoH)
    c.moveTo(w * 0.5, 2 * isoH)
    c.lineTo(w * 0.5, h)
    c.stroke()
  }
}

// Stacked disks ("datastore").
export class DataStoreShape extends CylinderShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number, isForeground = false) {
    const dy = Math.min(h / 2, Math.round(h / 8) + this.strokeWidth - 1)
    if ((isForeground && this.fill !== NONE) || (!isForeground && this.fill === NONE)) {
      for (let i = 0; i < 3; i++) {
        c.moveTo(0, dy)
        c.curveTo(0, 2 * dy, w, 2 * dy, w, dy)
        if (!isForeground) {
          c.stroke()
          c.begin()
        }
        if (i < 2) c.translate(0, dy / 2)
      }
      c.translate(0, -dy)
    }
    if (!isForeground) {
      c.moveTo(0, dy)
      c.curveTo(0, -dy / 3, w, -dy / 3, w, dy)
      c.lineTo(w, h - dy)
      c.curveTo(w, h + dy / 3, 0, h + dy / 3, 0, h - dy)
      c.close()
    }
  }
  getLabelMargins(rect: Rectangle | null) {
    const h = rect?.height ?? 0
    return new Rectangle(0, 2.5 * Math.min(h / 2, Math.round(h / 8) + this.strokeWidth - 1), 0, 0)
  }
}

// Note with folded corner (size, darkOpacity).
export class NoteShape extends CylinderShape {
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const s = clamp(num(this.style, 'size', 30), 0, Math.min(w, h))
    const op = clamp(num(this.style, 'darkOpacity', 0), -1, 1)
    c.translate(x, y)
    c.begin()
    c.moveTo(0, 0)
    c.lineTo(w - s, 0)
    c.lineTo(w, s)
    c.lineTo(w, h)
    c.lineTo(0, h)
    c.lineTo(0, 0)
    c.close()
    c.fillAndStroke()
    if (this.outline) return
    c.setShadow(false)
    if (op !== 0) {
      darkOverlay(c, op)
      c.begin()
      c.moveTo(w - s, 0)
      c.lineTo(w - s, s)
      c.lineTo(w, s)
      c.close()
      c.fill()
    }
    c.begin()
    c.moveTo(w - s, 0)
    c.lineTo(w - s, s)
    c.lineTo(w, s)
    c.stroke()
  }
}

export class Note2Shape extends NoteShape {
  getLabelMargins(rect: Rectangle | null) {
    if (!bool(this.style, 'boundedLbl') || !rect) return null
    const size = num(this.style, 'size', 15)
    return new Rectangle(0, Math.min(rect.height * this.scale, size * this.scale), 0, Math.max(0, size * this.scale))
  }
}

// Core cylinder with draw.io's relative size and boundedLbl support.
export class DrawioCylinderShape extends CylinderShape {
  getCylinderSize(x: number, y: number, w: number, h: number) {
    const size = this.style ? (this.style as Record<string, unknown>).size : undefined
    return size != null ? h * clamp(num(this.style, 'size', 0), 0, 1) : super.getCylinderSize(x, y, w, h)
  }
  getLabelMargins(rect: Rectangle | null) {
    if (!bool(this.style, 'boundedLbl') || !rect) return null
    const size = num(this.style, 'size', 0.15) * 2
    return new Rectangle(0, Math.min(this.maxHeight * this.scale, rect.height * size), 0, 0)
  }
}

// Legacy flexible cylinder ("cylinder2").
export class Cylinder2Shape extends Shape {
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const size = clamp(num(this.style, 'size', 15), 0, h * 0.5)
    c.translate(x, y)
    if (size === 0) {
      c.rect(0, 0, w, h)
      c.fillAndStroke()
      return
    }
    c.begin()
    c.moveTo(0, size)
    c.arcTo(w * 0.5, size, 0, false, true, w * 0.5, 0)
    c.arcTo(w * 0.5, size, 0, false, true, w, size)
    c.lineTo(w, h - size)
    c.arcTo(w * 0.5, size, 0, false, true, w * 0.5, h)
    c.arcTo(w * 0.5, size, 0, false, true, 0, h - size)
    c.close()
    c.fillAndStroke()
    c.setShadow(false)
    c.begin()
    c.moveTo(w, size)
    c.arcTo(w * 0.5, size, 0, false, true, w * 0.5, 2 * size)
    c.arcTo(w * 0.5, size, 0, false, true, 0, size)
    c.stroke()
  }
}

// Cylinder with absolute size and optional lid ("cylinder3", draw.io's default).
export class Cylinder3Shape extends CylinderShape {
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const size = clamp(num(this.style, 'size', 15), 0, h * 0.5)
    const lid = bool(this.style, 'lid', true)
    c.translate(x, y)
    if (size === 0) {
      c.rect(0, 0, w, h)
      c.fillAndStroke()
      return
    }
    c.begin()
    if (lid) {
      c.moveTo(0, size)
      c.arcTo(w * 0.5, size, 0, false, true, w * 0.5, 0)
      c.arcTo(w * 0.5, size, 0, false, true, w, size)
    } else {
      c.moveTo(0, 0)
      c.arcTo(w * 0.5, size, 0, false, false, w * 0.5, size)
      c.arcTo(w * 0.5, size, 0, false, false, w, 0)
    }
    c.lineTo(w, h - size)
    c.arcTo(w * 0.5, size, 0, false, true, w * 0.5, h)
    c.arcTo(w * 0.5, size, 0, false, true, 0, h - size)
    c.close()
    c.fillAndStroke()
    c.setShadow(false)
    if (lid) {
      c.begin()
      c.moveTo(w, size)
      c.arcTo(w * 0.5, size, 0, false, true, w * 0.5, 2 * size)
      c.arcTo(w * 0.5, size, 0, false, true, 0, size)
      c.stroke()
    }
  }
  getLabelMargins(rect: Rectangle | null) {
    if (!bool(this.style, 'boundedLbl') || !rect) return null
    let size = num(this.style, 'size', 15)
    if (!bool(this.style, 'lid', true)) size /= 2
    return new Rectangle(0, Math.min(rect.height * this.scale, size * 2 * this.scale), 0, Math.max(0, size * 0.3 * this.scale))
  }
}

export class SwitchShape extends ActorShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const curve = 0.5
    c.moveTo(0, 0)
    c.quadTo(w / 2, h * curve, w, 0)
    c.quadTo(w * (1 - curve), h / 2, w, h)
    c.quadTo(w / 2, h * (1 - curve), 0, h)
    c.quadTo(w * curve, h / 2, 0, 0)
    c.end()
  }
}

// Folder / UML package (tabWidth, tabHeight, tabPosition, rounded).
export class FolderShape extends CylinderShape {
  isRoundable() {
    return true
  }
  private arc(w: number, h: number, dy: number): number {
    let arcSize = num(this.style, 'arcSize', 0.1)
    if (!bool(this.style, 'absoluteArcSize')) arcSize = Math.min(w, h) * arcSize
    return Math.min(arcSize, w * 0.5, (h - dy) * 0.5)
  }
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    c.translate(x, y)
    let dx = clamp(num(this.style, 'tabWidth', 60), 0, w)
    const dy = clamp(num(this.style, 'tabHeight', 20), 0, h)
    const tp = str(this.style, 'tabPosition', 'right')
    const rounded = bool(this.style, 'rounded')
    let arcSize = this.arc(w, h, dy)
    dx = Math.min(w - arcSize, Math.max(dx, arcSize))
    if (!rounded) arcSize = 0
    c.begin()
    if (tp === 'left') {
      c.moveTo(Math.max(arcSize, 0), dy)
      c.lineTo(Math.max(arcSize, 0), 0)
      c.lineTo(dx, 0)
      c.lineTo(dx, dy)
    } else {
      c.moveTo(w - dx, dy)
      c.lineTo(w - dx, 0)
      c.lineTo(w - Math.max(arcSize, 0), 0)
      c.lineTo(w - Math.max(arcSize, 0), dy)
    }
    if (rounded) {
      c.moveTo(0, arcSize + dy)
      c.arcTo(arcSize, arcSize, 0, false, true, arcSize, dy)
      c.lineTo(w - arcSize, dy)
      c.arcTo(arcSize, arcSize, 0, false, true, w, arcSize + dy)
      c.lineTo(w, h - arcSize)
      c.arcTo(arcSize, arcSize, 0, false, true, w - arcSize, h)
      c.lineTo(arcSize, h)
      c.arcTo(arcSize, arcSize, 0, false, true, 0, h - arcSize)
    } else {
      c.moveTo(0, dy)
      c.lineTo(w, dy)
      c.lineTo(w, h)
      c.lineTo(0, h)
    }
    c.close()
    c.fillAndStroke()
    c.setShadow(false)
    if (str(this.style, 'folderSymbol') === 'triangle') {
      c.begin()
      c.moveTo(w - 30, dy + 20)
      c.lineTo(w - 20, dy + 10)
      c.lineTo(w - 10, dy + 20)
      c.close()
      c.stroke()
    }
  }
  getLabelMargins(rect: Rectangle | null) {
    if (!bool(this.style, 'boundedLbl') || !rect) return null
    const sizeY = num(this.style, 'tabHeight', 15) * this.scale
    if (!bool(this.style, 'labelInHeader')) return new Rectangle(0, Math.min(rect.height, sizeY), 0, 0)
    const sizeX = num(this.style, 'tabWidth', 15) * this.scale
    const arcSize = bool(this.style, 'rounded') ? this.arc(rect.width, rect.height, sizeY) : 0
    return str(this.style, 'tabPosition', 'right') === 'left'
      ? new Rectangle(arcSize, 0, Math.min(rect.width, rect.width - sizeX), Math.min(rect.height, rect.height - sizeY))
      : new Rectangle(Math.min(rect.width, rect.width - sizeX), 0, arcSize, Math.min(rect.height, rect.height - sizeY))
  }
}

export class CardShape extends PathShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const s = clamp(num(this.style, 'size', 30), 0, Math.min(w, h))
    this.poly(c, [pt(s, 0), pt(w, 0), pt(w, h), pt(0, h), pt(0, s)])
    c.end()
  }
}

export class TapeShape extends ActorShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const dy = h * clamp(num(this.style, 'size', 0.4), 0, 1)
    const fy = 1.4
    c.moveTo(0, dy / 2)
    c.quadTo(w / 4, dy * fy, w / 2, dy / 2)
    c.quadTo((w * 3) / 4, dy * (1 - fy), w, dy / 2)
    c.lineTo(w, h - dy / 2)
    c.quadTo((w * 3) / 4, h - dy * fy, w / 2, h - dy / 2)
    c.quadTo(w / 4, h - dy * (1 - fy), 0, h - dy / 2)
    c.lineTo(0, dy / 2)
    c.close()
    c.end()
  }
  getLabelBounds(rect: Rectangle) {
    if (!bool(this.style, 'boundedLbl')) return rect
    const size = num(this.style, 'size', 0.4)
    if (this.direction == null || this.direction === 'east' || this.direction === 'west') {
      const dy = rect.height * size
      return new Rectangle(rect.x, rect.y + dy, rect.width, rect.height - 2 * dy)
    }
    const dx = rect.width * size
    return new Rectangle(rect.x + dx, rect.y, rect.width - 2 * dx, rect.height)
  }
}

export class DocumentShape extends ActorShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const dy = h * clamp(num(this.style, 'size', 0.3), 0, 1)
    const fy = 1.4
    c.moveTo(0, 0)
    c.lineTo(w, 0)
    c.lineTo(w, h - dy / 2)
    c.quadTo((w * 3) / 4, h - dy * fy, w / 2, h - dy / 2)
    c.quadTo(w / 4, h - dy * (1 - fy), 0, h - dy / 2)
    c.lineTo(0, dy / 2)
    c.close()
    c.end()
  }
  getLabelMargins(rect: Rectangle | null) {
    if (!bool(this.style, 'boundedLbl') || !rect) return null
    return new Rectangle(0, 0, 0, num(this.style, 'size', 0.3) * rect.height)
  }
}

// Stacked documents: draw.io's "mxgraph.flowchart.multi-document" is a stencil;
// this path version is registered as "multiDocument" for convenience.
export class MultiDocumentShape extends Shape {
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const off = Math.min(10, w / 10, h / 10)
    c.translate(x, y)
    const page = (dx: number, dy: number, pw: number, ph: number) => {
      const wave = ph * 0.15
      c.begin()
      c.moveTo(dx, dy)
      c.lineTo(dx + pw, dy)
      c.lineTo(dx + pw, dy + ph - wave / 2)
      c.quadTo(dx + (pw * 3) / 4, dy + ph - wave * 1.4, dx + pw / 2, dy + ph - wave / 2)
      c.quadTo(dx + pw / 4, dy + ph + wave * 0.4, dx, dy + ph - wave / 2)
      c.close()
      c.fillAndStroke()
    }
    page(2 * off, 0, w - 2 * off, h - 2 * off)
    c.setShadow(false)
    page(off, off, w - 2 * off, h - 2 * off)
    page(0, 2 * off, w - 2 * off, h - 2 * off)
  }
}

export class ParallelogramShape extends PathShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const dx = sizeParam(this, w, 0.2, 20, w)
    this.poly(c, [pt(0, h), pt(dx, 0), pt(w, 0), pt(w - dx, h)])
    c.end()
  }
}

export class TrapezoidShape extends PathShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const dx = sizeParam(this, w, 0.2, 20, w * 0.5, 0.5)
    this.poly(c, [pt(0, h), pt(dx, 0), pt(w - dx, 0), pt(w, h)])
  }
}

export class CurlyBracketShape extends ActorShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    c.setFillColor(null)
    const s = w * clamp(num(this.style, 'size', 0.5), 0, 1)
    this.addPoints(c, [pt(w, 0), pt(s, 0), pt(s, h / 2), pt(0, h / 2), pt(s, h / 2), pt(s, h), pt(w, h)], this.isRounded, lineArc(this), false)
    c.end()
  }
}

// Rectangle with vertical inner bars (predefined process).
export class ProcessShape extends RectangleShape {
  isHtmlAllowed() {
    return false
  }
  private inset(w: number, h: number, scale: number): number {
    const fixed = bool(this.style, 'fixedSize')
    let inset = num(this.style, 'size', 0.1)
    if (fixed) return clamp(inset * scale, 0, w)
    inset = w * clamp(inset, 0, 1)
    if (this.isRounded) {
      const f = num(this.style, 'arcSize', 15) / 100
      inset = Math.max(inset, Math.min(w * f, h * f))
    }
    return inset
  }
  getLabelBounds(rect: Rectangle) {
    const horizontal = bool(this.state?.style, 'horizontal', true)
    const dirHorizontal = this.direction == null || this.direction === 'east' || this.direction === 'west'
    if (horizontal !== dirHorizontal) return rect
    const inset = this.inset(rect.width, rect.height, this.scale)
    return new Rectangle(rect.x + Math.round(inset), rect.y, rect.width - Math.round(2 * inset), rect.height)
  }
  paintForeground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const inset = Math.round(this.inset(w, h, 1))
    c.begin()
    c.moveTo(x + inset, y)
    c.lineTo(x + inset, y + h)
    c.moveTo(x + w - inset, y)
    c.lineTo(x + w - inset, y + h)
    c.stroke()
    super.paintForeground(c, x, y, w, h)
  }
}

export class TransparentShape extends RectangleShape {
  paintBackground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    c.setFillColor(NONE)
    c.rect(x, y, w, h)
    c.fill()
  }
  paintForeground() {}
}

// Speech bubble with a pointer at the bottom (size, position, position2, base).
export class CalloutShape extends PathShape {
  getLabelMargins() {
    return new Rectangle(0, 0, 0, num(this.style, 'size', 30) * this.scale)
  }
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const s = clamp(num(this.style, 'size', 30), 0, h)
    const dx = w * clamp(num(this.style, 'position', 0.5), 0, 1)
    const dx2 = w * clamp(num(this.style, 'position2', 0.5), 0, 1)
    const base = clamp(num(this.style, 'base', 20), 0, w)
    this.poly(c, [pt(0, 0), pt(w, 0), pt(w, h - s), pt(Math.min(w, dx + base), h - s), pt(dx2, h), pt(Math.max(0, dx), h - s), pt(0, h - s)], true, [4])
  }
}

// Speech bubble with a freely placed tip (tipX/tipY relative to the center).
export class WedgeCalloutShape extends PathShape {
  private tail(w: number, h: number): { points: Point[]; index: number } | null {
    const max = 100
    const tx = clamp(num(this.style, 'tipX', -0.25), -max, max)
    const ty = clamp(num(this.style, 'tipY', 1), -max, max)
    const dx = tx * w
    const dy = ty * h
    if (Math.abs(dx) <= w / 2 && Math.abs(dy) <= h / 2) return null
    const base = Math.max(0, num(this.style, 'base', 20))
    let inset = this.isRounded ? lineArc(this) : 0
    const tip = pt(w / 2 + dx, h / 2 + dy)
    if (Math.abs(dx) * h >= Math.abs(dy) * w && dx !== 0) {
      inset = Math.min(inset, h / 2)
      const hb = clamp(base, 0, h - 2 * inset) / 2
      const ey = clamp(h / 2 + (dy * (w / 2)) / Math.abs(dx), inset + hb, h - inset - hb)
      return dx > 0
        ? { points: [pt(w, ey - hb), tip, pt(w, ey + hb)], index: 2 }
        : { points: [pt(0, ey + hb), tip, pt(0, ey - hb)], index: 4 }
    }
    inset = Math.min(inset, w / 2)
    const hb = clamp(base, 0, w - 2 * inset) / 2
    const ex = clamp(w / 2 + (dx * (h / 2)) / Math.abs(dy), inset + hb, w - inset - hb)
    return dy > 0
      ? { points: [pt(ex + hb, h), tip, pt(ex - hb, h)], index: 3 }
      : { points: [pt(ex - hb, 0), tip, pt(ex + hb, 0)], index: 1 }
  }
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const pts = [pt(0, 0), pt(w, 0), pt(w, h), pt(0, h)]
    const tail = this.tail(w, h)
    let exclude: number[] | undefined
    if (tail) {
      pts.splice(tail.index, 0, ...tail.points)
      exclude = [tail.index, tail.index + 1, tail.index + 2]
    }
    this.poly(c, pts, true, exclude)
  }
}

export class StepShape extends PathShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const s = sizeParam(this, w, 0.2, 20, w)
    this.poly(c, [pt(0, 0), pt(w - s, 0), pt(w, h / 2), pt(w - s, h), pt(0, h), pt(s, h / 2)])
    c.end()
  }
}

// draw.io's hexagon (replaces maxGraph's fixed-ratio one; size, fixedSize).
export class HexagonShape extends PathShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const s = sizeParam(this, w, 0.25, 20, w * 0.5)
    this.poly(c, [pt(s, 0), pt(w - s, 0), pt(w, 0.5 * h), pt(w - s, h), pt(s, h), pt(0, 0.5 * h)])
  }
}

export class PlusShape extends RectangleShape {
  isHtmlAllowed() {
    return false
  }
  paintForeground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const border = Math.min(w / 5, h / 5) + 1
    c.begin()
    c.moveTo(x + w / 2, y + border)
    c.lineTo(x + w / 2, y + h - border)
    c.moveTo(x + border, y + h / 2)
    c.lineTo(x + w - border, y + h / 2)
    c.stroke()
    super.paintForeground(c, x, y, w, h)
  }
}

function doubleMargin(shape: Shape, factor: number): number {
  return Math.max(2, shape.strokeWidth + 1) * factor + num(shape.style, 'margin', 0)
}

// Rhombus with draw.io's double=1 support.
export class DrawioRhombusShape extends RhombusShape {
  getLabelBounds(rect: Rectangle) {
    if (!bool(this.style, 'double')) return rect
    const m = doubleMargin(this, 2) * this.scale
    return new Rectangle(rect.x + m, rect.y + m, rect.width - 2 * m, rect.height - 2 * m)
  }
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    super.paintVertexShape(c, x, y, w, h)
    if (!this.outline && bool(this.style, 'double')) {
      const m = doubleMargin(this, 2)
      if (w - 2 * m > 0 && h - 2 * m > 0) {
        c.setShadow(false)
        super.paintVertexShape(c, x + m, y + m, w - 2 * m, h - 2 * m)
      }
    }
  }
}

// Rectangle with optional inner double border ("ext;double=1").
export class ExtendedShape extends RectangleShape {
  isHtmlAllowed() {
    return false
  }
  getLabelBounds(rect: Rectangle) {
    if (!bool(this.style, 'double')) return rect
    const m = doubleMargin(this, 1) * this.scale
    return new Rectangle(rect.x + m, rect.y + m, rect.width - 2 * m, rect.height - 2 * m)
  }
  paintForeground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    if (!this.outline && bool(this.style, 'double')) {
      const m = doubleMargin(this, 1)
      if (w - 2 * m > 0 && h - 2 * m > 0) this.paintBackground(c, x + m, y + m, w - 2 * m, h - 2 * m)
    }
    c.setDashed(false)
    super.paintForeground(c, x, y, w, h)
  }
}

// Envelope.
export class MessageShape extends CylinderShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number, isForeground = false) {
    if (isForeground) {
      c.moveTo(0, 0)
      c.lineTo(w / 2, h / 2)
      c.lineTo(w, 0)
      c.end()
    } else {
      c.moveTo(0, 0)
      c.lineTo(w, 0)
      c.lineTo(w, h)
      c.lineTo(0, h)
      c.close()
    }
  }
}

export class AssociativeEntityShape extends RectangleShape {
  paintForeground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    c.begin()
    this.addPoints(c, [pt(x + w / 2, y), pt(x + w, y + h / 2), pt(x + w / 2, y + h), pt(x, y + h / 2)], this.isRounded, lineArc(this), true)
    c.stroke()
    super.paintForeground(c, x, y, w, h)
  }
}

// UML end state (bull's eye) and start state (filled circle).
export class EndStateShape extends DoubleEllipseShape {
  protected outerStroke = true
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const inset = Math.min(4, Math.min(w / 5, h / 5))
    if (w > 0 && h > 0) {
      c.ellipse(x + inset, y + inset, w - 2 * inset, h - 2 * inset)
      c.fillAndStroke()
    }
    c.setShadow(false)
    if (this.outerStroke) {
      c.ellipse(x, y, w, h)
      c.stroke()
    }
  }
}

export class StartStateShape extends EndStateShape {
  protected outerStroke = false
}

export class ManualInputShape extends PathShape {
  getLabelMargins() {
    if (!bool(this.style, 'boundedLbl')) return null
    return new Rectangle(0, num(this.style, 'size', 30) * this.scale, 0, 0)
  }
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const s = Math.min(h, num(this.style, 'size', 30))
    this.poly(c, [pt(0, h), pt(0, s), pt(w, 0), pt(w, h)])
    c.end()
  }
}

export class InternalStorageShape extends RectangleShape {
  isHtmlAllowed() {
    return false
  }
  paintForeground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    super.paintForeground(c, x, y, w, h)
    let inset = 0
    if (this.isRounded) {
      const f = num(this.style, 'arcSize', 15) / 100
      inset = Math.max(inset, Math.min(w * f, h * f))
    }
    const dx = Math.max(inset, Math.min(w, num(this.style, 'dx', 20)))
    const dy = Math.max(inset, Math.min(h, num(this.style, 'dy', 20)))
    c.begin()
    c.moveTo(x, y + dy)
    c.lineTo(x + w, y + dy)
    c.stroke()
    c.begin()
    c.moveTo(x + dx, y)
    c.lineTo(x + dx, y + h)
    c.stroke()
  }
}

export class CornerShape extends PathShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const dx = clamp(num(this.style, 'dx', 20), 0, w)
    const dy = clamp(num(this.style, 'dy', 20), 0, h)
    this.poly(c, [pt(0, 0), pt(w, 0), pt(w, dy), pt(dx, dy), pt(dx, h), pt(0, h)])
    c.end()
  }
}

export class CrossbarShape extends ActorShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    c.moveTo(0, 0)
    c.lineTo(0, h)
    c.moveTo(w, 0)
    c.lineTo(w, h)
    c.moveTo(0, h / 2)
    c.lineTo(w, h / 2)
    c.end()
  }
}

export class TeeShape extends PathShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const dx = clamp(num(this.style, 'dx', 20), 0, w)
    const dy = clamp(num(this.style, 'dy', 20), 0, h)
    this.poly(c, [pt(0, 0), pt(w, 0), pt(w, dy), pt((w + dx) / 2, dy), pt((w + dx) / 2, h), pt((w - dx) / 2, h), pt((w - dx) / 2, dy), pt(0, dy)])
    c.end()
  }
}

function arrowParams(shape: Shape, w: number, h: number) {
  const aw = h * clamp(num(shape.style, 'arrowWidth', 0.3), 0, 1)
  const as = w * clamp(num(shape.style, 'arrowSize', 0.2), 0, 1)
  const at = (h - aw) / 2
  return { as, at, ab: at + aw }
}

export class SingleArrowShape extends PathShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const { as, at, ab } = arrowParams(this, w, h)
    this.poly(c, [pt(0, at), pt(w - as, at), pt(w - as, 0), pt(w, h / 2), pt(w - as, h), pt(w - as, ab), pt(0, ab)])
    c.end()
  }
}

export class DoubleArrowShape extends PathShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const { as, at, ab } = arrowParams(this, w, h)
    this.poly(c, [pt(0, h / 2), pt(as, 0), pt(as, at), pt(w - as, at), pt(w - as, 0), pt(w, h / 2), pt(w - as, h), pt(w - as, ab), pt(as, ab), pt(as, h)])
    c.end()
  }
}

export class DataStorageShape extends ActorShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const s = sizeParam(this, w, 0.1, 20, w)
    c.moveTo(s, 0)
    c.lineTo(w, 0)
    c.quadTo(w - s * 2, h / 2, w, h)
    c.lineTo(s, h)
    c.quadTo(s - s * 2, h / 2, s, 0)
    c.close()
    c.end()
  }
}

export class OrShape extends ActorShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    c.moveTo(0, 0)
    c.quadTo(w, 0, w, h / 2)
    c.quadTo(w, h, 0, h)
    c.close()
    c.end()
  }
}

export class XorShape extends ActorShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    c.moveTo(0, 0)
    c.quadTo(w, 0, w, h / 2)
    c.quadTo(w, h, 0, h)
    c.quadTo(w / 2, h / 2, 0, 0)
    c.close()
    c.end()
  }
}

export class LoopLimitShape extends PathShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const s = Math.min(w / 2, Math.min(h, num(this.style, 'size', 20)))
    this.poly(c, [pt(s, 0), pt(w - s, 0), pt(w, s * 0.8), pt(w, h), pt(0, h), pt(0, s * 0.8)])
    c.end()
  }
}

export class OffPageConnectorShape extends PathShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const s = h * clamp(num(this.style, 'size', 3 / 8), 0, 1)
    this.poly(c, [pt(0, 0), pt(w, 0), pt(w, h - s), pt(w / 2, h), pt(0, h - s)])
    c.end()
  }
}

export class TapeDataShape extends EllipseShape {
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    super.paintVertexShape(c, x, y, w, h)
    c.begin()
    c.moveTo(x + w / 2, y + h)
    c.lineTo(x + w, y + h)
    c.stroke()
  }
}

export class OrEllipseShape extends EllipseShape {
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    super.paintVertexShape(c, x, y, w, h)
    c.setShadow(false)
    c.begin()
    c.moveTo(x, y + h / 2)
    c.lineTo(x + w, y + h / 2)
    c.stroke()
    c.begin()
    c.moveTo(x + w / 2, y)
    c.lineTo(x + w / 2, y + h)
    c.stroke()
  }
}

export class SumEllipseShape extends EllipseShape {
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    super.paintVertexShape(c, x, y, w, h)
    const s2 = 0.145
    c.setShadow(false)
    c.begin()
    c.moveTo(x + w * s2, y + h * s2)
    c.lineTo(x + w * (1 - s2), y + h * (1 - s2))
    c.stroke()
    c.begin()
    c.moveTo(x + w * (1 - s2), y + h * s2)
    c.lineTo(x + w * s2, y + h * (1 - s2))
    c.stroke()
  }
}

export class LineEllipseShape extends EllipseShape {
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    super.paintVertexShape(c, x, y, w, h)
    c.setShadow(false)
    c.begin()
    if (str(this.style, 'line') === 'vertical') {
      c.moveTo(x + w / 2, y)
      c.lineTo(x + w / 2, y + h)
    } else {
      c.moveTo(x, y + h / 2)
      c.lineTo(x + w, y + h / 2)
    }
    c.stroke()
  }
}

export class SortShape extends RhombusShape {
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    super.paintVertexShape(c, x, y, w, h)
    c.setShadow(false)
    c.begin()
    c.moveTo(x, y + h / 2)
    c.lineTo(x + w, y + h / 2)
    c.stroke()
  }
}

export class CollateShape extends Shape {
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    c.begin()
    c.moveTo(x, y)
    c.lineTo(x + w, y)
    c.lineTo(x + w / 2, y + h / 2)
    c.close()
    c.fillAndStroke()
    c.begin()
    c.moveTo(x, y + h)
    c.lineTo(x + w, y + h)
    c.lineTo(x + w / 2, y + h / 2)
    c.close()
    c.fillAndStroke()
  }
}

// Rectangle with individually hidden sides (top/left/bottom/right=0).
export function paintPartialRectangle(shape: Shape, c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
  const style = shape.style
  if (!shape.outline) c.setStrokeColor(null)
  const filled = shape.fill != null && shape.fill !== NONE
  const pointerEvents = c.pointerEvents
  if (!bool(style, 'pointerEvents', true) && !filled) c.pointerEvents = false
  const top = bool(style, 'top', true)
  const left = bool(style, 'left', true)
  const right = bool(style, 'right', true)
  const bottom = bool(style, 'bottom', true)
  c.rect(x, y, w, h)
  c.fill()
  c.pointerEvents = pointerEvents
  c.setStrokeColor(shape.stroke)
  c.setLineCap('square')
  c.begin()
  c.moveTo(x, y)
  const o = shape.outline
  if (o || top) c.lineTo(x + w, y)
  else c.moveTo(x + w, y)
  if (o || right) c.lineTo(x + w, y + h)
  else c.moveTo(x + w, y + h)
  if (o || bottom) c.lineTo(x, y + h)
  else c.moveTo(x, y + h)
  if (o || left) c.lineTo(x, y)
  c.stroke()
  c.setLineCap('flat')
}

export class PartialRectangleShape extends Shape {
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    paintPartialRectangle(this, c, x, y, w, h)
  }
}

export class DelayShape extends ActorShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const dx = Math.min(w, h / 2)
    c.moveTo(0, 0)
    c.lineTo(w - dx, 0)
    c.quadTo(w, 0, w, h / 2)
    c.quadTo(w, h, w - dx, h)
    c.lineTo(0, h)
    c.close()
    c.end()
  }
}

export class CrossShape extends ActorShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const m = Math.min(h, w)
    const size = clamp(m * num(this.style, 'size', 0.2), 0, m)
    const t = (h - size) / 2
    const b = t + size
    const l = (w - size) / 2
    const r = l + size
    c.moveTo(0, t)
    c.lineTo(l, t)
    c.lineTo(l, 0)
    c.lineTo(r, 0)
    c.lineTo(r, t)
    c.lineTo(w, t)
    c.lineTo(w, b)
    c.lineTo(r, b)
    c.lineTo(r, h)
    c.lineTo(l, h)
    c.lineTo(l, b)
    c.lineTo(0, b)
    c.close()
    c.end()
  }
}

export class DisplayShape extends ActorShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    const dx = Math.min(w, h / 2)
    const s = Math.min(w - dx, Math.max(0, num(this.style, 'size', 0.25)) * w)
    c.moveTo(0, h / 2)
    c.lineTo(s, 0)
    c.lineTo(w - dx, 0)
    c.quadTo(w, 0, w, h / 2)
    c.quadTo(w, h, w - dx, h)
    c.lineTo(s, h)
    c.close()
    c.end()
  }
}

// mxgraph.flowchart.document2 (document with rounded top corners).
export class FlowchartDocument2Shape extends Shape {
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    c.translate(x, y)
    const dy = h * clamp(num(this.style, 'size', 0.5), 0, 1)
    const fy = 1.4
    const r = 5
    c.begin()
    c.moveTo(w - r, 0)
    c.arcTo(r, r, 0, false, true, w, r)
    c.lineTo(w, h - dy / 2)
    c.quadTo((w * 3) / 4, h - dy * fy, w / 2, h - dy / 2)
    c.quadTo(w / 4, h - dy * (1 - fy), 0, h - dy / 2)
    c.lineTo(0, dy / 2)
    c.lineTo(0, r)
    c.arcTo(r, r, 0, false, true, r, 0)
    c.close()
    c.fillAndStroke()
  }
}

// mxgraph.arrows2.arrow (block arrow with dx, dy, notch).
export class Arrows2ArrowShape extends Shape {
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    c.translate(x, y)
    const dy = h * 0.5 * clamp(num(this.style, 'dy', 0.5), 0, 1)
    const dx = clamp(num(this.style, 'dx', 0.5), 0, w)
    const notch = clamp(num(this.style, 'notch', 0), 0, w)
    c.begin()
    c.moveTo(0, dy)
    c.lineTo(w - dx, dy)
    c.lineTo(w - dx, 0)
    c.lineTo(w, h * 0.5)
    c.lineTo(w - dx, h)
    c.lineTo(w - dx, h - dy)
    c.lineTo(0, h - dy)
    c.lineTo(notch, h * 0.5)
    c.close()
    c.fillAndStroke()
    c.setShadow(false)
    if (bool(this.style, 'headCrossline')) {
      c.begin()
      c.moveTo(w - dx, dy)
      c.lineTo(w - dx, h - dy)
      c.stroke()
    }
    if (bool(this.style, 'tailCrossline')) {
      c.begin()
      c.moveTo(notch, dy)
      c.lineTo(notch, h - dy)
      c.stroke()
    }
  }
}

export const BASIC_SHAPES: [string, ShapeConstructor][] = [
  ['cube', CubeShape],
  ['isoCube2', IsoCube2Shape],
  ['datastore', DataStoreShape],
  ['note', NoteShape],
  ['note2', Note2Shape],
  ['cylinder', DrawioCylinderShape],
  ['cylinder2', Cylinder2Shape],
  ['cylinder3', Cylinder3Shape],
  ['switch', SwitchShape],
  ['folder', FolderShape],
  ['card', CardShape],
  ['tape', TapeShape],
  ['document', DocumentShape],
  ['multiDocument', MultiDocumentShape],
  ['parallelogram', ParallelogramShape],
  ['trapezoid', TrapezoidShape],
  ['curlyBracket', CurlyBracketShape],
  ['process', ProcessShape],
  ['process2', ProcessShape],
  ['transparent', TransparentShape],
  ['callout', CalloutShape],
  ['wedgeCallout', WedgeCalloutShape],
  ['step', StepShape],
  ['hexagon', HexagonShape],
  ['plus', PlusShape],
  ['rhombus', DrawioRhombusShape],
  ['ext', ExtendedShape],
  ['message', MessageShape],
  ['associativeEntity', AssociativeEntityShape],
  ['endState', EndStateShape],
  ['startState', StartStateShape],
  ['manualInput', ManualInputShape],
  ['internalStorage', InternalStorageShape],
  ['corner', CornerShape],
  ['crossbar', CrossbarShape],
  ['tee', TeeShape],
  ['singleArrow', SingleArrowShape],
  ['doubleArrow', DoubleArrowShape],
  ['dataStorage', DataStorageShape],
  ['or', OrShape],
  ['xor', XorShape],
  ['loopLimit', LoopLimitShape],
  ['offPageConnector', OffPageConnectorShape],
  ['tapeData', TapeDataShape],
  ['orEllipse', OrEllipseShape],
  ['sumEllipse', SumEllipseShape],
  ['lineEllipse', LineEllipseShape],
  ['sortShape', SortShape],
  ['collate', CollateShape],
  ['partialRectangle', PartialRectangleShape],
  ['delay', DelayShape],
  ['cross', CrossShape],
  ['display', DisplayShape],
  ['mxgraph.flowchart.document2', FlowchartDocument2Shape],
  ['mxgraph.arrows2.arrow', Arrows2ArrowShape],
]
