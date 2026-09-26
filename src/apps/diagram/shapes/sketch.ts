// Hand-drawn rendering for cells with sketch=1 (rough.js) or comic=1 / sketchStyle=comic
// (jiggled lines). Ported from draw.io (diagramly/Editor.js RoughCanvas, grapheditor/Shapes.js
// HandJiggle), Copyright (c) 2006-2025 JGraph Holdings Ltd / draw.io AG, Apache-2.0.
// Like draw.io, the shape's canvas is wrapped while it paints: path operations are collected
// and drawn as rough.js (MIT) paths, seeded from the cell id so every render and peer looks alike.
import rough from 'roughjs'
import type { Drawable, OpSet, Options, ResolvedOptions } from 'roughjs/bin/core'
import { ImageShape, Rectangle, RectangleShape, Shape, SvgCanvas2D, TextShape, constants, mathUtils } from '@maxgraph/core'
import type { AbstractCanvas2D } from '@maxgraph/core'
import '@fontsource/architects-daughter/400.css'
import sketchFontData from '@fontsource/architects-daughter/files/architects-daughter-latin-400-normal.woff2?inline'
import { str, styleOf } from './util'
import { t } from '../../../core/i18n'

const NONE = constants.NONE

// draw.io's defaults for new sketch cells and its hand-drawn font.
export const SKETCH_DEFAULTS = { sketch: 1, curveFitting: 1, jiggle: 2 }
export const SKETCH_FONT_FAMILY = 'Architects Daughter'
export const SKETCH_FONT_SOURCE = 'https%3A%2F%2Ffonts.googleapis.com%2Fcss%3Ffamily%3DArchitects%2BDaughter'
// Fill styles offered by draw.io for sketch cells ('dots' is rendered as 'auto' there, see getStyle).
export const SKETCH_FILL_STYLES: [string, string][] = [
  ['auto', t('Auto')],
  ['hachure', t('Hachure')],
  ['solid', t('Solid')],
  ['zigzag', t('Zigzag')],
  ['cross-hatch', t('Cross hatch')],
  ['dashed', t('Dashed')],
  ['zigzag-line', t('Zigzag line')],
]

type Method = (...args: any[]) => any
type Canvas = AbstractCanvas2D & { handJiggle?: Wrapper | null } & Record<string, any>

// Canvas wrapper installed between beforePaint and afterPaint.
abstract class Wrapper {
  passThrough = false
  private originals = new Map<string, Method>()

  constructor(readonly canvas: Canvas, names: string[]) {
    // Avoids "spikes" in the output
    canvas.setLineJoin('round')
    canvas.setLineCap('round')
    for (const name of names) {
      const original = canvas[name] as Method
      this.originals.set(name, original)
      const own = (this as unknown as Record<string, Method>)[name]
      canvas[name] = (...args: unknown[]) => (this.passThrough ? original.apply(canvas, args) : own.apply(this, args))
    }
  }

  protected original(name: string, ...args: unknown[]): void {
    this.originals.get(name)!.apply(this.canvas, args)
  }

  destroy(): void {
    for (const [name, fn] of this.originals) this.canvas[name] = fn
  }
}

// Deterministic PRNG (the Lehmer generator rough.js uses for its seeds).
function random(seed: number): () => number {
  let s = seed || 1
  return () => ((2 ** 31 - 1) & (s = Math.imul(48271, s))) / 2 ** 31
}

// draw.io's seed: a string hash of the cell id.
function seedOf(shape: Shape): number {
  let seed = 1
  const id = shape.state?.cell?.id
  if (id != null) for (let i = 0; i < id.length; i++) seed = ((seed << 5) - seed + id.charCodeAt(i)) << 0
  return seed
}

// ---------- Comic: jiggled straight lines ----------

class HandJiggle extends Wrapper {
  private lastX: number | null = null
  private lastY: number | null = null
  private firstX: number | null = null
  private firstY: number | null = null
  private readonly random: () => number

  constructor(canvas: Canvas, private readonly variation: number, seed: number) {
    super(canvas, ['moveTo', 'lineTo', 'close', 'quadTo', 'curveTo', 'arcTo'])
    // draw.io uses Math.random; a seed keeps re-renders and peers identical.
    this.random = random(seed)
  }

  moveTo(x: number, y: number) {
    this.original('moveTo', x, y)
    this.lastX = this.firstX = x
    this.lastY = this.firstY = y
  }

  close() {
    if (this.firstX != null && this.firstY != null) this.lineTo(this.firstX, this.firstY)
    this.original('close')
  }

  quadTo(x1: number, y1: number, x2: number, y2: number) {
    this.original('quadTo', x1, y1, x2, y2)
    this.lastX = x2
    this.lastY = y2
  }

  curveTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) {
    this.original('curveTo', x1, y1, x2, y2, x3, y3)
    this.lastX = x3
    this.lastY = y3
  }

  arcTo(rx: number, ry: number, angle: number, large: boolean, sweep: boolean, x: number, y: number) {
    this.original('arcTo', rx, ry, angle, large, sweep, x, y)
    this.lastX = x
    this.lastY = y
  }

  lineTo(endX: number, endY: number) {
    if (this.lastX != null && this.lastY != null) {
      const dx = Math.abs(endX - this.lastX)
      const dy = Math.abs(endY - this.lastY)
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist >= 2) {
        let segs = Math.round(dist / 10)
        let variation = this.variation
        if (segs < 5) {
          segs = 5
          variation /= 3
        }
        const stepX = (Math.sign(endX - this.lastX) * dx) / segs
        const stepY = (Math.sign(endY - this.lastY) * dy) / segs
        const fx = dx / dist
        const fy = dy / dist
        for (let s = 0; s < segs; s++) {
          const offset = (this.random() - 0.5) * variation
          this.original('lineTo', stepX * s + this.lastX - offset * fy, stepY * s + this.lastY - offset * fx)
        }
      }
    }
    this.original('lineTo', endX, endY)
    this.lastX = endX
    this.lastY = endY
  }
}

// ---------- Rough: rough.js paths ----------

const generator = rough.generator()
const defaults = generator.defaultOptions

type RoughStyle = Options & { filled: boolean }

// Colors compared by value for the automatic fill style (as mxUtils.hex2rgb does).
const colorCache = new Map<string, string>()
let colorCtx: CanvasRenderingContext2D | null | undefined
function normalizeColor(color: string): string {
  let out = colorCache.get(color)
  if (out === undefined) {
    colorCtx ??= document.createElement('canvas').getContext('2d')
    out = color.toLowerCase()
    if (colorCtx) {
      colorCtx.fillStyle = '#010203'
      colorCtx.fillStyle = color
      out = String(colorCtx.fillStyle)
    }
    colorCache.set(color, out)
  }
  return out
}

class RoughCanvas extends Wrapper {
  private path: (string | number)[] = []
  private nextShape: Drawable | null = null
  private lastX = 0
  private lastY = 0

  constructor(canvas: Canvas, private readonly shape: Shape) {
    super(canvas, ['begin', 'end', 'rect', 'roundrect', 'ellipse', 'lineTo', 'moveTo', 'quadTo', 'curveTo', 'arcTo', 'close', 'fill', 'stroke', 'fillAndStroke'])
  }

  private getStyle(stroke: boolean, fill: boolean): RoughStyle {
    const s = this.canvas.state
    const style = styleOf(this.shape)
    // Numbers as in draw.io's parsed styles (rough.js would concatenate strings).
    const get = (key: string, def: unknown) => {
      const v = style[key]
      if (v == null || v === '') return def as any
      const n = Number(v)
      return (Number.isFinite(n) ? n : v) as any
    }
    const out: RoughStyle = {
      strokeWidth: s.strokeWidth,
      seed: seedOf(this.shape),
      preserveVertices: true,
      stroke: stroke ? (s.strokeColor === NONE ? 'transparent' : s.strokeColor) : NONE,
      filled: fill,
      fill: '',
    }
    let gradient: string | null = null
    if (fill) {
      out.fill = s.fillColor === NONE ? '' : s.fillColor
      gradient = s.gradientColor === NONE ? null : s.gradientColor
    }
    out.bowing = get('bowing', defaults.bowing)
    out.hachureAngle = get('hachureAngle', defaults.hachureAngle)
    out.curveFitting = get('curveFitting', defaults.curveFitting)
    out.roughness = get('jiggle', defaults.roughness)
    out.simplification = get('simplification', defaults.simplification)
    out.disableMultiStroke = get('disableMultiStroke', defaults.disableMultiStroke)
    out.disableMultiStrokeFill = get('disableMultiStrokeFill', defaults.disableMultiStrokeFill)
    const hachureGap = get('hachureGap', -1)
    out.hachureGap = hachureGap === 'auto' ? -1 : hachureGap
    out.dashGap = get('dashGap', out.hachureGap)
    out.dashOffset = get('dashOffset', out.hachureGap)
    out.zigzagOffset = get('zigzagOffset', out.hachureGap)
    const fillWeight = get('fillWeight', -1)
    out.fillWeight = fillWeight === 'auto' ? -1 : fillWeight
    let fillStyle = get('fillStyle', 'auto')
    // draw.io disables dots for performance.
    if (fillStyle === 'dots') fillStyle = 'auto'
    if (fillStyle === 'auto') {
      // Solid on page-colored fills and gradients, else hachure.
      const white = normalizeColor('#ffffff')
      fillStyle = out.fill && (gradient != null || normalizeColor(out.fill) === white) ? 'solid' : defaults.fillStyle
    }
    out.fillStyle = fillStyle
    return out
  }

  begin() {
    this.path = []
  }

  end() {}

  private addOp(op: string, ...coords: number[]) {
    this.path.push(op)
    for (let i = 1; i < coords.length; i += 2) {
      this.lastX = coords[i - 1]
      this.lastY = coords[i]
      this.path.push(this.canvas.format(this.lastX), this.canvas.format(this.lastY))
    }
  }

  lineTo(x: number, y: number) {
    this.addOp('L', x, y)
  }

  moveTo(x: number, y: number) {
    this.addOp('M', x, y)
  }

  close() {
    this.addOp('Z')
  }

  quadTo(x1: number, y1: number, x2: number, y2: number) {
    this.addOp('Q', x1, y1, x2, y2)
  }

  curveTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) {
    this.addOp('C', x1, y1, x2, y2, x3, y3)
  }

  arcTo(rx: number, ry: number, angle: number, large: boolean, sweep: boolean, x: number, y: number) {
    const curves = mathUtils.arcToCurves(this.lastX, this.lastY, rx, ry, angle, large, sweep, x, y)
    for (let i = 0; i < curves.length; i += 6) this.curveTo(curves[i], curves[i + 1], curves[i + 2], curves[i + 3], curves[i + 4], curves[i + 5])
    this.lastX = x
    this.lastY = y
  }

  rect(x: number, y: number, w: number, h: number) {
    this.path = []
    this.nextShape = generator.rectangle(x, y, w, h, this.getStyle(true, true))
  }

  ellipse(x: number, y: number, w: number, h: number) {
    this.path = []
    this.nextShape = generator.ellipse(x + w / 2, y + h / 2, w, h, this.getStyle(true, true))
  }

  roundrect(x: number, y: number, w: number, h: number, dx: number, dy: number) {
    this.begin()
    this.moveTo(x + dx, y)
    this.lineTo(x + w - dx, y)
    this.quadTo(x + w, y, x + w, y + dy)
    this.lineTo(x + w, y + h - dy)
    this.quadTo(x + w, y + h, x + w - dx, y + h)
    this.lineTo(x + dx, y + h)
    this.quadTo(x, y + h, x, y + h - dy)
    this.lineTo(x, y + dy)
    this.quadTo(x, y, x + dx, y)
  }

  stroke() {
    this.drawPath(this.getStyle(true, false))
  }

  fill() {
    this.drawPath(this.getStyle(false, true))
  }

  fillAndStroke() {
    this.drawPath(this.getStyle(true, true))
  }

  private drawPath(style: RoughStyle) {
    this.passThrough = true
    try {
      if (this.path.length > 0) {
        this.draw(generator.path(this.path.join(' '), style))
      } else if (this.nextShape) {
        const o = this.nextShape.options as unknown as Record<string, unknown>
        Object.assign(o, style)
        if (style.stroke === NONE || style.stroke == null) delete o.stroke
        if (!style.filled) delete o.fill
        this.draw(this.nextShape)
      }
    } catch {
      // Unparsable paths are skipped, as in draw.io.
    } finally {
      this.passThrough = false
    }
  }

  // rough.js drawables replayed on the (unwrapped) canvas.
  private draw(drawable: Drawable) {
    const o = drawable.options as ResolvedOptions & { filled?: boolean }
    for (const set of drawable.sets) {
      if (set.type === 'path') {
        if (o.stroke != null) this.drawOps(set, o)
      } else if (set.type === 'fillPath') this.drawOps(set, o)
      else if (set.type === 'fillSketch') this.fillSketch(set, o)
    }
  }

  // Hachure and other pattern fills: strokes in the fill color.
  private fillSketch(set: OpSet, o: ResolvedOptions) {
    const c = this.canvas
    const { strokeColor, strokeWidth, strokeAlpha, dashed } = c.state
    let weight = Number(o.fillWeight)
    if (weight < 0) weight = o.strokeWidth / 2
    c.setStrokeAlpha(c.state.fillAlpha)
    c.setStrokeColor(o.fill || '')
    c.setStrokeWidth(weight)
    c.setDashed(false)
    this.drawOps(set, o)
    c.setDashed(dashed)
    c.setStrokeWidth(strokeWidth)
    c.setStrokeColor(strokeColor)
    c.setStrokeAlpha(strokeAlpha)
  }

  private drawOps(set: OpSet, o: ResolvedOptions & { filled?: boolean }) {
    const c = this.canvas
    c.begin()
    for (const { op, data } of set.ops) {
      if (op === 'move') c.moveTo(data[0], data[1])
      else if (op === 'bcurveTo') c.curveTo(data[0], data[1], data[2], data[3], data[4], data[5])
      else if (op === 'lineTo') c.lineTo(data[0], data[1])
    }
    c.end()
    if (set.type === 'fillPath' && o.filled) c.fill()
    else c.stroke()
  }
}

// ---------- maxGraph integration ----------

function flag(value: unknown): boolean {
  return value != null && String(value) !== '0'
}

export function isSketch(style: Record<string, unknown> | null | undefined): boolean {
  return !!style && (flag(style.sketch) || flag(style.comic))
}

function createHandJiggle(shape: Shape, c: Canvas): Wrapper | null {
  if (shape.outline || !shape.style || shape instanceof TextShape) return null
  const style = styleOf(shape)
  if (flag(style.sketch)) {
    if (str(style, 'sketchStyle', 'rough') === 'comic') return new HandJiggle(c, Number(str(style, 'jiggle', '2')), seedOf(shape))
    return new RoughCanvas(c, shape)
  }
  if (flag(style.comic)) return new HandJiggle(c, Number(str(style, 'jiggle', '2')), seedOf(shape))
  return null
}

let installed = false

// Patches maxGraph's shapes once; cells without sketch/comic render as before.
export function installSketch(): void {
  if (installed) return
  installed = true
  const proto = Shape.prototype

  const beforePaint = proto.beforePaint
  proto.beforePaint = function (this: Shape, c: AbstractCanvas2D) {
    beforePaint.call(this, c)
    const canvas = c as Canvas
    if (canvas.handJiggle == null) canvas.handJiggle = createHandJiggle(this, canvas)
  }

  const afterPaint = proto.afterPaint
  proto.afterPaint = function (this: Shape, c: AbstractCanvas2D) {
    afterPaint.call(this, c)
    const canvas = c as Canvas
    if (canvas.handJiggle) {
      canvas.handJiggle.destroy()
      delete canvas.handJiggle
    }
  }

  // First paints the plain geometry invisibly (it receives the mouse events, as rough
  // strokes and hachures leave gaps), then the rough version.
  const paint = proto.paint
  proto.paint = function (this: Shape, c: AbstractCanvas2D) {
    const canvas = c as Canvas
    const jiggle = canvas.handJiggle
    if (!(jiggle instanceof RoughCanvas) || this.outline) {
      paint.call(this, c)
      return
    }
    canvas.save()
    const { fill, stroke, gradient } = this
    this.fill = this.stroke = this.gradient = NONE
    const setters = ['setStrokeColor', 'setFillColor', 'setGradient', 'setShadow'] as const
    const methods = canvas as Record<string, Method>
    const saved = setters.map((name) => methods[name])
    for (const name of setters) methods[name] = () => {}
    jiggle.passThrough = true
    try {
      paint.call(this, c)
    } finally {
      jiggle.passThrough = false
      setters.forEach((name, i) => (methods[name] = saved[i]))
      this.fill = fill
      this.stroke = stroke
      this.gradient = gradient
      canvas.restore()
    }
    // The invisible pass already has the stroke tolerance for hit detection.
    const svg = c instanceof SvgCanvas2D ? c : null
    const tolerance = svg?.strokeTolerance ?? 0
    if (svg) svg.strokeTolerance = 0
    try {
      paint.call(this, c)
    } finally {
      if (svg) svg.strokeTolerance = tolerance
    }
  }

  // Glass stays smooth.
  const paintGlassEffect = proto.paintGlassEffect
  proto.paintGlassEffect = function (this: Shape, c: AbstractCanvas2D, x: number, y: number, w: number, h: number, arc: number) {
    const jiggle = (c as Canvas).handJiggle
    if (!(jiggle instanceof RoughCanvas)) return paintGlassEffect.call(this, c, x, y, w, h, arc)
    jiggle.passThrough = true
    try {
      paintGlassEffect.call(this, c, x, y, w, h, arc)
    } finally {
      jiggle.passThrough = false
    }
  }

  // Images are drawn once (not in the invisible pass).
  const imagePaint = ImageShape.prototype.paintVertexShape
  ImageShape.prototype.paintVertexShape = function (this: ImageShape, c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    if (!(c as Canvas).handJiggle?.passThrough) imagePaint.call(this, c, x, y, w, h)
  }

  // Comic rectangles are paths so that their sides jiggle.
  const rectBackground = RectangleShape.prototype.paintBackground
  RectangleShape.prototype.paintBackground = function (this: RectangleShape, c: AbstractCanvas2D, x: number, y: number, w: number, h: number) {
    if (!((c as Canvas).handJiggle instanceof HandJiggle)) return rectBackground.call(this, c, x, y, w, h)
    const events = String(styleOf(this).pointerEvents ?? '1') !== '0'
    if (!events && this.fill === NONE && this.stroke === NONE) return
    if (!events && this.fill === NONE) c.pointerEvents = false
    c.begin()
    if (this.isRounded) {
      const r = this.getArcSize(w, h)
      c.moveTo(x + r, y)
      c.lineTo(x + w - r, y)
      c.quadTo(x + w, y, x + w, y + r)
      c.lineTo(x + w, y + h - r)
      c.quadTo(x + w, y + h, x + w - r, y + h)
      c.lineTo(x + r, y + h)
      c.quadTo(x, y + h, x, y + h - r)
      c.lineTo(x, y + r)
      c.quadTo(x, y, x + r, y)
    } else {
      c.moveTo(x, y)
      c.lineTo(x + w, y)
      c.lineTo(x + w, y + h)
      c.lineTo(x, y + h)
      c.lineTo(x, y)
    }
    c.close()
    c.end()
    c.fillAndStroke()
  }

  // Rough strokes overshoot the bounds: add the painted bounds (fit, export size).
  const updateBoundingBox = proto.updateBoundingBox
  proto.updateBoundingBox = function (this: Shape) {
    updateBoundingBox.call(this)
    if (this.useSvgBoundingBox || !this.boundingBox || this.outline || !isSketch(styleOf(this))) return
    const node = this.node as unknown as SVGGraphicsElement | null
    if (!node?.ownerSVGElement) return
    try {
      const b = node.getBBox()
      if (b.width > 0 && b.height > 0) {
        this.boundingBox.add(new Rectangle(b.x, b.y, b.width, b.height))
      }
    } catch {
      // Not rendered yet.
    }
  }
}

// ---------- Font ----------

// Embeds the self-hosted hand-drawn font in exported SVG (images cannot load page fonts).
export function embedSketchFont(svg: SVGSVGElement): void {
  if (!svg.innerHTML.includes(SKETCH_FONT_FAMILY)) return
  const ns = 'http://www.w3.org/2000/svg'
  const defs = document.createElementNS(ns, 'defs')
  const style = document.createElementNS(ns, 'style')
  style.textContent = `@font-face{font-family:'${SKETCH_FONT_FAMILY}';src:url(${sketchFontData}) format('woff2');}`
  defs.append(style)
  svg.prepend(defs)
}
