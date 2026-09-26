// Perimeters ported from draw.io (grapheditor/Shapes.js), Copyright (c)
// 2006-2025 JGraph Holdings Ltd / draw.io AG, Apache-2.0.
import { Perimeter, PerimeterRegistry, Point, Rectangle, mathUtils } from '@maxgraph/core'
import type { CellState, PerimeterFunction } from '@maxgraph/core'
import { bool, clamp, num, str } from './util'

const P = (x: number, y: number) => new Point(x, y)

// Intersection of the ray from the center (or the orthogonal projection) to
// `next` with the given polygon.
function polygonPoint(bounds: Rectangle, pts: Point[], next: Point, orthogonal: boolean): Point | null {
  const p1 = P(bounds.getCenterX(), bounds.getCenterY())
  if (orthogonal) {
    if (next.x < bounds.x || next.x > bounds.x + bounds.width) p1.y = next.y
    else p1.x = next.x
  }
  return mathUtils.getPerimeterPoint(pts, p1, next)
}

// size in model units when fixedSize=1, else relative; scaled like draw.io.
function shapeSize(vertex: CellState, rel: number, fixed: number): { fixed: boolean; size: number } {
  const isFixed = bool(vertex.style, 'fixedSize')
  let size = num(vertex.style, 'size', isFixed ? fixed : rel)
  if (isFixed) size *= vertex.view.scale
  return { fixed: isFixed, size }
}

const direction = (vertex: CellState) => str(vertex.style, 'direction', 'east')

const parallelogramPerimeter: PerimeterFunction = (bounds, vertex, next, orthogonal) => {
  const { fixed, size } = shapeSize(vertex, 0.2, 20)
  const { x, y, width: w, height: h } = bounds
  const dir = direction(vertex)
  let pts: Point[]
  if (dir === 'north' || dir === 'south') {
    const dy = fixed ? clamp(size, 0, h) : h * clamp(size, 0, 1)
    pts = [P(x, y), P(x + w, y + dy), P(x + w, y + h), P(x, y + h - dy), P(x, y)]
  } else {
    const dx = fixed ? clamp(size, 0, w * 0.5) : w * clamp(size, 0, 1)
    pts = [P(x + dx, y), P(x + w, y), P(x + w - dx, y + h), P(x, y + h), P(x + dx, y)]
  }
  return polygonPoint(bounds, pts, next, orthogonal)
}

const trapezoidPerimeter: PerimeterFunction = (bounds, vertex, next, orthogonal) => {
  const { fixed, size } = shapeSize(vertex, 0.2, 20)
  const { x, y, width: w, height: h } = bounds
  const dir = direction(vertex)
  let pts: Point[]
  if (dir === 'east') {
    const dx = fixed ? clamp(size, 0, w * 0.5) : w * clamp(size, 0, 1)
    pts = [P(x + dx, y), P(x + w - dx, y), P(x + w, y + h), P(x, y + h), P(x + dx, y)]
  } else if (dir === 'west') {
    const dx = fixed ? clamp(size, 0, w) : w * clamp(size, 0, 1)
    pts = [P(x, y), P(x + w, y), P(x + w - dx, y + h), P(x + dx, y + h), P(x, y)]
  } else if (dir === 'north') {
    const dy = fixed ? clamp(size, 0, h) : h * clamp(size, 0, 1)
    pts = [P(x, y + dy), P(x + w, y), P(x + w, y + h), P(x, y + h - dy), P(x, y + dy)]
  } else {
    const dy = fixed ? clamp(size, 0, h) : h * clamp(size, 0, 1)
    pts = [P(x, y), P(x + w, y + dy), P(x + w, y + h - dy), P(x, y + h), P(x, y)]
  }
  return polygonPoint(bounds, pts, next, orthogonal)
}

const stepPerimeter: PerimeterFunction = (bounds, vertex, next, orthogonal) => {
  const { fixed, size } = shapeSize(vertex, 0.2, 20)
  const { x, y, width: w, height: h } = bounds
  const cx = bounds.getCenterX()
  const cy = bounds.getCenterY()
  const dir = direction(vertex)
  let pts: Point[]
  if (dir === 'east' || dir === 'west') {
    const dx = fixed ? clamp(size, 0, w) : w * clamp(size, 0, 1)
    pts = dir === 'east'
      ? [P(x, y), P(x + w - dx, y), P(x + w, cy), P(x + w - dx, y + h), P(x, y + h), P(x + dx, cy), P(x, y)]
      : [P(x + dx, y), P(x + w, y), P(x + w - dx, cy), P(x + w, y + h), P(x + dx, y + h), P(x, cy), P(x + dx, y)]
  } else {
    const dy = fixed ? clamp(size, 0, h) : h * clamp(size, 0, 1)
    pts = dir === 'north'
      ? [P(x, y + dy), P(cx, y), P(x + w, y + dy), P(x + w, y + h), P(cx, y + h - dy), P(x, y + h), P(x, y + dy)]
      : [P(x, y), P(cx, y + dy), P(x + w, y), P(x + w, y + h - dy), P(cx, y + h), P(x, y + h - dy), P(x, y)]
  }
  return polygonPoint(bounds, pts, next, orthogonal)
}

const hexagonPerimeter2: PerimeterFunction = (bounds, vertex, next, orthogonal) => {
  const { fixed, size } = shapeSize(vertex, 0.25, 20)
  const { x, y, width: w, height: h } = bounds
  const cx = bounds.getCenterX()
  const cy = bounds.getCenterY()
  const dir = direction(vertex)
  let pts: Point[]
  if (dir === 'north' || dir === 'south') {
    const dy = fixed ? clamp(size, 0, h) : h * clamp(size, 0, 1)
    pts = [P(cx, y), P(x + w, y + dy), P(x + w, y + h - dy), P(cx, y + h), P(x, y + h - dy), P(x, y + dy), P(cx, y)]
  } else {
    const dx = fixed ? clamp(size, 0, w) : w * clamp(size, 0, 1)
    pts = [P(x + dx, y), P(x + w - dx, y), P(x + w, cy), P(x + w - dx, y + h), P(x + dx, y + h), P(x, cy), P(x + dx, y)]
  }
  return polygonPoint(bounds, pts, next, orthogonal)
}

const calloutPerimeter: PerimeterFunction = (bounds, vertex, next, orthogonal) => {
  const size = clamp(num(vertex.style, 'size', 30) * vertex.view.scale, 0, bounds.height)
  const directed = mathUtils.getDirectedBounds(bounds, new Rectangle(0, 0, 0, size), vertex.style, false, false)
  return Perimeter.RectanglePerimeter(directed, vertex, next, orthogonal)
}

const centerPerimeter: PerimeterFunction = (bounds) => P(bounds.getCenterX(), bounds.getCenterY())

const lifelinePerimeter: PerimeterFunction = (bounds, vertex, next) => {
  const size = num(vertex.style, 'size', 40) * vertex.view.scale
  let max = bounds.y + bounds.height
  if (bool(vertex.style, 'lifelineMirror')) max -= size
  let sw = (num(vertex.style, 'strokeWidth', 1) * vertex.view.scale) / 2 - 1
  if (next.x < bounds.getCenterX()) sw = -(sw + 1)
  return P(bounds.getCenterX() + sw, Math.min(max, Math.max(bounds.y + size, next.y)))
}

const orthogonalPerimeter: PerimeterFunction = (bounds, vertex, next) => Perimeter.RectanglePerimeter(bounds, vertex, next, true)

const backbonePerimeter: PerimeterFunction = (bounds, vertex, next) => {
  const scale = vertex.view.scale
  let sw = (num(vertex.style, 'strokeWidth', 1) * scale) / 2 - 1
  const backbone = num(vertex.style, 'backboneSize', NaN)
  if (!Number.isNaN(backbone)) sw += (backbone * scale) / 2 - 1
  const dir = direction(vertex)
  if (dir === 'south' || dir === 'north') {
    if (next.x < bounds.getCenterX()) sw = -(sw + 1)
    return P(bounds.getCenterX() + sw, Math.min(bounds.y + bounds.height, Math.max(bounds.y, next.y)))
  }
  if (next.y < bounds.getCenterY()) sw = -(sw + 1)
  return P(Math.min(bounds.x + bounds.width, Math.max(bounds.x, next.x)), bounds.getCenterY() + sw)
}

export const PERIMETERS: [string, PerimeterFunction][] = [
  ['parallelogramPerimeter', parallelogramPerimeter],
  ['trapezoidPerimeter', trapezoidPerimeter],
  ['stepPerimeter', stepPerimeter],
  ['hexagonPerimeter2', hexagonPerimeter2],
  ['calloutPerimeter', calloutPerimeter],
  ['centerPerimeter', centerPerimeter],
  ['lifelinePerimeter', lifelinePerimeter],
  ['orthogonalPerimeter', orthogonalPerimeter],
  ['backbonePerimeter', backbonePerimeter],
]

export function registerPerimeters() {
  for (const [name, fn] of PERIMETERS) PerimeterRegistry.add(name, fn)
}
