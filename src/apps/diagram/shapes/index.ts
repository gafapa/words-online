// draw.io-compatible shapes, markers, perimeters and stencils for maxGraph.
// After registerShapes(), cells whose style has shape=<name> (and edges with
// draw.io's endArrow/startArrow names) render like in draw.io.
import { ShapeRegistry, registerDefaultEdgeMarkers, registerDefaultEdgeStyles, registerDefaultPerimeters, registerDefaultShapes } from '@maxgraph/core'
import { BASIC_SHAPES } from './basic'
import { BASIC_LIB_SHAPES } from './basiclib'
import { EDGE_SHAPES, registerMarkers } from './edges'
import { registerPerimeters } from './perimeters'
import { registerStencils } from './stencils'
import { UML_SHAPES } from './uml'

export { configureDrawioStylesheet, parseDrawioStyle, DRAWIO_NAMED_STYLES } from './style'
export { registerStencilSet } from './stencils'

let registered = false

export function registerShapes(): void {
  if (registered) return
  registered = true
  // Core shapes first so draw.io variants (hexagon, rhombus, cylinder) replace them.
  registerDefaultShapes()
  registerDefaultEdgeMarkers()
  registerDefaultPerimeters()
  registerDefaultEdgeStyles()
  for (const [name, ctor] of [...BASIC_SHAPES, ...UML_SHAPES, ...EDGE_SHAPES, ...BASIC_LIB_SHAPES]) ShapeRegistry.add(name, ctor)
  registerMarkers()
  registerPerimeters()
  registerStencils()
}

// Every shape name registered by registerShapes() (excluding stencils).
export const CUSTOM_SHAPE_NAMES = [...BASIC_SHAPES, ...UML_SHAPES, ...EDGE_SHAPES, ...BASIC_LIB_SHAPES].map(([name]) => name)
