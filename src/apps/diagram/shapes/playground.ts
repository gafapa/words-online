// Visual test bench: renders every palette item (and an edge marker sheet)
// with the draw.io-compatible shapes in a plain maxGraph Graph.
import { Graph, InternalEvent, Point } from '@maxgraph/core'
import type { Cell } from '@maxgraph/core'
import { PALETTE } from '../palette'
import type { PaletteCell } from '../palette'
import { configureDrawioStylesheet, parseDrawioStyle, registerShapes } from './index'

const COLS = 8
const CELL_W = 190
const CELL_H = 190
const CAPTION = 'text;html=1;align=center;verticalAlign=top;fontSize=10;fontColor=#666666;whiteSpace=wrap;'

export function renderGallery(container: HTMLElement): Graph {
  registerShapes()
  InternalEvent.disableContextMenu(container)
  const graph = new Graph(container)
  configureDrawioStylesheet(graph.getStylesheet())
  // draw.io renders labels as HTML when the style has html=1.
  graph.isHtmlLabel = (cell: Cell) => Number((cell.style as Record<string, unknown>)?.html) === 1
  graph.setHtmlLabels(false)
  const parent = graph.getDefaultParent()
  const insertChildren = (owner: Cell, children: PaletteCell[] | undefined) => {
    for (const child of children ?? []) {
      const cell = graph.insertVertex(owner, null, child.value ?? '', child.x, child.y, child.width, child.height, parseDrawioStyle(child.style))
      if (child.connectable === false) cell.setConnectable(false)
      insertChildren(cell, child.children)
    }
  }
  graph.batchUpdate(() => {
    let y = 10
    for (const lib of PALETTE) {
      graph.insertVertex(parent, null, lib.name, 10, y, 400, 30, parseDrawioStyle('text;fontSize=18;fontStyle=1;verticalAlign=middle;'))
      y += 40
      lib.items.forEach((item, i) => {
        const cx = 10 + (i % COLS) * CELL_W
        const cy = y + Math.floor(i / COLS) * CELL_H
        const scale = item.children ? 1 : Math.min(1, 150 / Math.max(item.width, 1), 130 / Math.max(item.height, 1))
        const w = item.width * scale
        const h = item.height * scale
        const x = cx + (170 - w) / 2
        const top = cy + (140 - h) / 2
        if (item.edge) {
          const edge = graph.insertEdge(parent, null, item.value ?? '', null, null, parseDrawioStyle(item.style))
          const geo = edge.getGeometry()!.clone()
          geo.setTerminalPoint(new Point(x, top + h), true)
          geo.setTerminalPoint(new Point(x + Math.max(w, 60), top), false)
          graph.getDataModel().setGeometry(edge, geo)
        } else {
          const cell = graph.insertVertex(parent, null, item.value ?? '', x, top, item.width, item.height, parseDrawioStyle(item.style))
          insertChildren(cell, item.children)
          if (scale < 1) {
            const geo = cell.getGeometry()!.clone()
            geo.width = w
            geo.height = h
            graph.getDataModel().setGeometry(cell, geo)
          }
        }
        graph.insertVertex(parent, null, item.label, cx, cy + 150, 170, 30, parseDrawioStyle(CAPTION))
      })
      y += Math.ceil(lib.items.length / COLS) * CELL_H + 20
    }
  })
  return graph
}
