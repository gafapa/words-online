// UML and table shapes ported from draw.io (grapheditor/Shapes.js), Copyright (c)
// 2006-2025 JGraph Holdings Ltd / draw.io AG, Apache-2.0.
import { CylinderShape, EllipseShape, Rectangle, RectangleShape, Shape, ShapeRegistry, SwimlaneShape, constants } from '@maxgraph/core'
import type { AbstractCanvas2D, Cell, ShapeConstructor } from '@maxgraph/core'
import { paintPartialRectangle } from './basic'
import { bool, clamp, num, str } from './util'

const NONE = constants.NONE

export class UmlActorShape extends Shape {
  paintBackground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    c.translate(x, y)
    // Head
    c.ellipse(w / 4, 0, w / 2, h / 4)
    c.fillAndStroke()
    c.begin()
    c.moveTo(w / 2, h / 4)
    c.lineTo(w / 2, (2 * h) / 3)
    // Arms
    c.moveTo(w / 2, h / 3)
    c.lineTo(0, h / 3)
    c.moveTo(w / 2, h / 3)
    c.lineTo(w, h / 3)
    // Legs
    c.moveTo(w / 2, (2 * h) / 3)
    c.lineTo(0, h)
    c.moveTo(w / 2, (2 * h) / 3)
    c.lineTo(w, h)
    c.stroke()
  }
}

export class UmlBoundaryShape extends Shape {
  getLabelMargins(rect: Rectangle | null) {
    return new Rectangle((rect?.width ?? 0) / 6, 0, 0, 0)
  }
  paintBackground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    c.translate(x, y)
    c.begin()
    c.moveTo(0, h / 4)
    c.lineTo(0, (h * 3) / 4)
    c.stroke()
    c.begin()
    c.moveTo(0, h / 2)
    c.lineTo(w / 6, h / 2)
    c.stroke()
    c.ellipse(w / 6, 0, (w * 5) / 6, h)
    c.fillAndStroke()
  }
}

export class UmlEntityShape extends EllipseShape {
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    super.paintVertexShape(c, x, y, w, h)
    c.begin()
    c.moveTo(x + w / 8, y + h)
    c.lineTo(x + (w * 7) / 8, y + h)
    c.stroke()
  }
}

export class UmlDestroyShape extends Shape {
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    c.translate(x, y)
    c.begin()
    c.moveTo(w, 0)
    c.lineTo(0, h)
    c.moveTo(0, 0)
    c.lineTo(w, h)
    c.stroke()
  }
}

export class UmlControlShape extends Shape {
  getLabelBounds(rect: Rectangle) {
    return new Rectangle(rect.x, rect.y + rect.height / 8, rect.width, (rect.height * 7) / 8)
  }
  paintBackground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    c.translate(x, y)
    c.begin()
    c.moveTo((w * 3) / 8, (h / 8) * 1.1)
    c.lineTo((w * 5) / 8, 0)
    c.stroke()
    c.ellipse(0, h / 8, w, (h * 7) / 8)
    c.fillAndStroke()
  }
  paintForeground(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number) {
    c.begin()
    c.moveTo((w * 3) / 8, (h / 8) * 1.1)
    c.lineTo((w * 5) / 8, h / 4)
    c.stroke()
  }
}

// Sequence lifeline: head box (or participant=<shape>) and dashed line.
export class UmlLifelineShape extends RectangleShape {
  isHtmlAllowed() {
    return false
  }
  private mirrored() {
    return bool(this.style, 'lifelineMirror')
  }
  private headSize(h: number) {
    return clamp(num(this.style, 'size', 40), 0, this.mirrored() ? h / 2 : h)
  }
  getLabelBounds(rect: Rectangle) {
    const size = clamp(num(this.style, 'size', 40) * this.scale, 0, this.mirrored() ? rect.height / 2 : rect.height)
    return new Rectangle(rect.x, rect.y, rect.width, size)
  }
  private paintHead(c: AbstractCanvas2D, x: number, y: number, w: number, size: number) {
    const participant = str(this.style, 'participant')
    const ctor = participant && this.state ? ShapeRegistry.get(participant) : null
    if (ctor && ctor !== UmlLifelineShape) {
      const shape = new ctor()
      shape.apply(this.state!)
      c.save()
      shape.paintVertexShape(c, x, y, w, size)
      c.restore()
    } else {
      super.paintBackground(c, x, y, w, size)
    }
  }
  paintBackground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const size = this.headSize(h)
    const mirror = this.mirrored()
    this.paintHead(c, x, y, w, size)
    if (mirror) this.paintHead(c, x, y + h - size, w, size)
    const lineEnd = mirror ? h - size : h
    if (size < lineEnd) {
      c.setDashed(bool(this.style, 'lifelineDashed', true))
      c.begin()
      c.moveTo(x + w / 2, y + size)
      c.lineTo(x + w / 2, y + lineEnd)
      c.stroke()
    }
  }
  paintForeground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    if (str(this.style, 'participant') != null) return
    const size = this.headSize(h)
    super.paintForeground(c, x, y, w, Math.min(h, size))
    if (this.mirrored()) super.paintForeground(c, x, y + h - size, w, size)
  }
}

// Sequence/interaction frame with a pentagon title tab.
export class UmlFrameShape extends Shape {
  getLabelMargins(rect: Rectangle | null) {
    if (!rect) return null
    return new Rectangle(0, 0, rect.width - num(this.style, 'width', 60) * this.scale, rect.height - num(this.style, 'height', 30) * this.scale)
  }
  paintBackground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const co = 10
    const w0 = Math.min(w, Math.max(co, num(this.style, 'width', 60)))
    const h0 = Math.min(h, Math.max(co * 1.5, num(this.style, 'height', 30)))
    const bg = str(this.style, 'swimlaneFillColor', NONE)
    if (bg !== NONE) {
      c.setFillColor(bg)
      c.rect(x, y, w, h)
      c.fill()
    }
    if (this.fill !== NONE && this.gradient && this.gradient !== NONE) {
      c.setGradient(this.fill, this.gradient, x, y, w, h, this.gradientDirection)
    } else {
      c.setFillColor(this.fill)
    }
    c.pointerEvents = true
    c.begin()
    c.moveTo(x, y)
    c.lineTo(x + w0, y)
    c.lineTo(x + w0, y + Math.max(0, h0 - co * 1.5))
    c.lineTo(x + Math.max(0, w0 - co), y + h0)
    c.lineTo(x, y + h0)
    c.close()
    c.fillAndStroke()
    if ((bg === NONE || this.opacity === 0 || this.fillOpacity === 0) && !bool(this.style, 'pointerEvents', true)) {
      c.pointerEvents = false
    }
    c.begin()
    c.moveTo(x + w0, y)
    c.lineTo(x + w, y)
    c.lineTo(x + w, y + h)
    c.lineTo(x, y + h)
    c.lineTo(x, y + h0)
    c.stroke()
  }
}

export class LollipopShape extends Shape {
  paintBackground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const sz = num(this.style, 'size', 10)
    c.translate(x, y)
    c.ellipse((w - sz) / 2, 0, sz, sz)
    c.fillAndStroke()
    c.begin()
    c.moveTo(w / 2, sz)
    c.lineTo(w / 2, h)
    c.stroke()
  }
}

export class RequiresShape extends Shape {
  paintBackground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const sz = num(this.style, 'size', 10)
    const inset = num(this.style, 'inset', 2) + this.strokeWidth
    c.translate(x, y)
    c.begin()
    c.moveTo(w / 2, sz + inset)
    c.lineTo(w / 2, h)
    c.stroke()
    c.begin()
    c.moveTo((w - sz) / 2 - inset, sz / 2)
    c.quadTo((w - sz) / 2 - inset, sz + inset, w / 2, sz + inset)
    c.quadTo((w + sz) / 2 + inset, sz + inset, (w + sz) / 2 + inset, sz / 2)
    c.stroke()
  }
}

export class RequiredInterfaceShape extends Shape {
  paintBackground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    c.translate(x, y)
    c.begin()
    c.moveTo(0, 0)
    c.quadTo(w, 0, w, h / 2)
    c.quadTo(w, h, 0, h)
    c.stroke()
  }
}

export class ProvidedRequiredInterfaceShape extends Shape {
  paintBackground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const inset = num(this.style, 'inset', 2) + this.strokeWidth
    c.translate(x, y)
    c.ellipse(0, inset, w - 2 * inset, h - 2 * inset)
    c.fillAndStroke()
    c.begin()
    c.moveTo(w / 2, 0)
    c.quadTo(w, 0, w, h / 2)
    c.quadTo(w, h, w / 2, h)
    c.stroke()
  }
}

// Box with two jetties on the left (module: stacked at the top, component: at 30%/70%).
function jettyPath(c: AbstractCanvas2D, w: number, h: number, dx: number, dy: number, y0: number, y1: number, isForeground: boolean) {
  const x0 = dx / 2
  const x1 = x0 + dx / 2
  if (isForeground) {
    c.moveTo(x0, y0)
    c.lineTo(x1, y0)
    c.lineTo(x1, y0 + dy)
    c.lineTo(x0, y0 + dy)
    c.moveTo(x0, y1)
    c.lineTo(x1, y1)
    c.lineTo(x1, y1 + dy)
    c.lineTo(x0, y1 + dy)
    c.end()
  } else {
    c.moveTo(x0, 0)
    c.lineTo(w, 0)
    c.lineTo(w, h)
    c.lineTo(x0, h)
    c.lineTo(x0, y1 + dy)
    c.lineTo(0, y1 + dy)
    c.lineTo(0, y1)
    c.lineTo(x0, y1)
    c.lineTo(x0, y0 + dy)
    c.lineTo(0, y0 + dy)
    c.lineTo(0, y0)
    c.lineTo(x0, y0)
    c.close()
    c.end()
  }
}

export class ModuleShape extends CylinderShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number, isForeground = false) {
    const dx = num(this.style, 'jettyWidth', 20)
    const dy = num(this.style, 'jettyHeight', 10)
    const y0 = Math.min(dy, h - dy)
    const y1 = Math.min(y0 + 2 * dy, h - dy)
    jettyPath(c, w, h, dx, dy, y0, y1, isForeground)
  }
}

export class ComponentShape extends CylinderShape {
  redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number, isForeground = false) {
    const dx = num(this.style, 'jettyWidth', 32)
    const dy = num(this.style, 'jettyHeight', 12)
    jettyPath(c, w, h, dx, dy, 0.3 * h - dy / 2, 0.7 * h - dy / 2, isForeground)
  }
}

// draw.io tables: a swimlane-like container whose rows and cells are children.
// Grid lines are derived from the child geometries (no row/col spans).
function childVertices(cell: Cell | null | undefined): Cell[] {
  return (cell?.children ?? []).filter((c) => c.isVertex() && c.isVisible())
}

export class TableShape extends SwimlaneShape {
  paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const collapsed = this.state?.cell.isCollapsed() ?? false
    const horizontal = this.isHorizontal()
    const start = this.getTitleSize()
    const fixedHeader = bool(this.style, 'fixedHeader')
    if (start === 0 && this.isRounded && !this.outline) {
      const r = this.getArcSize(w, h)
      c.begin()
      c.roundrect(x, y, w, h, r, r)
      c.fillAndStroke()
    } else if ((start === 0 && !fixedHeader) || this.outline) {
      paintPartialRectangle(this, c, x, y, w, h)
    } else {
      super.paintVertexShape(c, x, y, w, h)
      c.translate(-x, -y)
    }
    if (!collapsed && !this.outline && ((horizontal && start < h) || (!horizontal && start < w))) {
      this.paintForeground(c, x, y, w, h)
    }
  }
  paintForeground(c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    const cell = this.state?.cell
    if (!cell) return
    const rows = childVertices(cell)
    const rowLines = bool(this.style, 'rowLines', true)
    const colLines = bool(this.style, 'columnLines', true)
    const start = this.getTitleSize()
    c.setShadow(false)
    c.begin()
    if (rowLines) {
      for (let i = 1; i < rows.length; i++) {
        const geo = rows[i].getGeometry()
        if (!geo) continue
        c.moveTo(x, y + geo.y)
        c.lineTo(x + w, y + geo.y)
      }
    }
    if (colLines && rows.length > 0) {
      const cols = childVertices(rows[0])
      const top = rows[0].getGeometry()?.y ?? start
      for (let i = 1; i < cols.length; i++) {
        const geo = cols[i].getGeometry()
        if (!geo) continue
        c.moveTo(x + geo.x, y + top)
        c.lineTo(x + geo.x, y + h)
      }
    }
    c.stroke()
  }
}

export class TableRowShape extends TableShape {
  paintForeground() {}
}

export const UML_SHAPES: [string, ShapeConstructor][] = [
  ['umlActor', UmlActorShape],
  ['umlBoundary', UmlBoundaryShape],
  ['umlEntity', UmlEntityShape],
  ['umlDestroy', UmlDestroyShape],
  ['umlControl', UmlControlShape],
  ['umlLifeline', UmlLifelineShape],
  ['umlFrame', UmlFrameShape],
  ['lollipop', LollipopShape],
  ['requires', RequiresShape],
  ['requiredInterface', RequiredInterfaceShape],
  ['providedRequiredInterface', ProvidedRequiredInterfaceShape],
  ['module', ModuleShape],
  ['component', ComponentShape],
  ['table', TableShape],
  ['tableRow', TableRowShape],
]
