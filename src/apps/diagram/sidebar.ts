// Left panel with the shape libraries: search, collapsible libraries, click to
// insert at the center of the view, or drag onto the canvas (or into a container).

import { Cell, Geometry, Graph, Point, gestureUtils, type AbstractGraph } from '@maxgraph/core'
import { el } from '../../ui/widgets'
import { renderSvg } from './export'
import { applyLook, styleFromString, type EditorGraph } from './graph'
import type { PaletteCell, PaletteItem, PaletteLibrary } from './palette'

export type { PaletteItem, PaletteLibrary }

const THUMB = 34

// A new detached cell for a palette item, positioned at (0, 0).
export function createItemCell(item: PaletteItem): Cell {
  const style = styleFromString(item.style)
  if (item.edge) {
    const geo = new Geometry(0, 0, item.width, item.height)
    geo.relative = true
    geo.setTerminalPoint(new Point(0, item.height), true)
    geo.setTerminalPoint(new Point(item.width, 0), false)
    const edge = new Cell(item.value ?? '', geo, style)
    edge.setEdge(true)
    return edge
  }
  const cell = new Cell(item.value ?? '', new Geometry(0, 0, item.width, item.height), style)
  cell.setVertex(true)
  item.children?.forEach((child) => cell.insert(childCell(child)))
  return cell
}

function childCell(item: PaletteCell): Cell {
  const cell = new Cell(item.value ?? '', new Geometry(item.x, item.y, item.width, item.height), styleFromString(item.style))
  cell.setVertex(true)
  if (item.connectable === false) cell.setConnectable(false)
  item.children?.forEach((child) => cell.insert(childCell(child)))
  return cell
}

export class ShapeSidebar {
  readonly element: HTMLElement
  private readonly thumbs = new Map<PaletteItem, string>()
  private thumbGraph: Graph | null = null
  private readonly open = new Set<string>()

  constructor(
    private readonly graph: EditorGraph,
    private readonly libraries: PaletteLibrary[],
    private readonly insert: (cells: Cell[], x: number, y: number, target: Cell | null) => void,
    private readonly insertAtCenter: (cells: Cell[]) => void,
  ) {
    const search = el('input', { type: 'search', class: 'sidebar-search', placeholder: 'Search shapes' })
    const list = el('div', { class: 'sidebar-list' })
    this.element = el('aside', { class: 'diagram-sidebar', ariaLabel: 'Shapes' }, search, list)
    if (libraries[0]) this.open.add(libraries[0].id)
    if (libraries[1]) this.open.add(libraries[1].id)

    const render = () => {
      list.replaceChildren()
      const query = search.value.trim().toLowerCase()
      if (query) {
        const found = libraries.flatMap((lib) => lib.items).filter((item) => item.label.toLowerCase().includes(query))
        list.append(found.length ? this.grid(found) : el('div', { class: 'sidebar-empty', textContent: 'No shapes found' }))
        return
      }
      for (const lib of libraries) {
        const header = el('button', { type: 'button', class: 'sidebar-lib', textContent: lib.name })
        header.classList.toggle('open', this.open.has(lib.id))
        header.addEventListener('click', () => {
          if (this.open.has(lib.id)) this.open.delete(lib.id)
          else this.open.add(lib.id)
          render()
        })
        list.append(header)
        if (this.open.has(lib.id)) list.append(this.grid(lib.items))
      }
    }
    search.addEventListener('input', render)
    render()
  }

  private grid(items: PaletteItem[]): HTMLElement {
    const grid = el('div', { class: 'sidebar-grid' })
    for (const item of items) {
      const button = el('button', { type: 'button', class: 'sidebar-item', title: item.label })
      button.setAttribute('aria-label', item.label)
      button.innerHTML = this.thumbnail(item)
      button.addEventListener('click', () => this.insertAtCenter([createItemCell(item)]))
      this.makeDraggable(button, item)
      grid.append(button)
    }
    return grid
  }

  private makeDraggable(button: HTMLElement, item: PaletteItem): void {
    const preview = el('div', { class: 'sidebar-drag-preview' })
    preview.style.width = `${item.width}px`
    preview.style.height = `${item.height}px`
    const source = gestureUtils.makeDraggable(
      button,
      this.graph,
      (_graph: AbstractGraph, _evt: MouseEvent, target: Cell | null, x?: number, y?: number) =>
        this.insert([createItemCell(item)], x ?? 0, y ?? 0, item.edge ? null : target),
      preview,
      0,
      0,
      true,
      true,
      !item.edge,
    )
    source.setGuidesEnabled(true)
    // Keep the pointer at the center of the preview.
    const createPreview = source.createPreviewElement.bind(source)
    source.createPreviewElement = (graph: AbstractGraph) => {
      const s = graph.view.scale
      source.previewOffset = new Point((-item.width * s) / 2, (-item.height * s) / 2)
      return createPreview(graph)
    }
  }

  // Cached SVG markup of a palette item, rendered by an offscreen graph.
  private thumbnail(item: PaletteItem): string {
    const cached = this.thumbs.get(item)
    if (cached) return cached
    if (!this.thumbGraph) {
      const host = el('div', { class: 'sidebar-thumb-host' })
      document.body.append(host)
      this.thumbGraph = new Graph(host, undefined, [])
      applyLook(this.thumbGraph)
    }
    const graph = this.thumbGraph
    const model = graph.getDataModel()
    const cell = createItemCell(item)
    let svg: SVGSVGElement
    model.beginUpdate()
    try {
      graph.addCell(cell, graph.getDefaultParent())
    } finally {
      model.endUpdate()
    }
    try {
      const scale = Math.min(THUMB / Math.max(item.width, 1), THUMB / Math.max(item.height, 1), 1)
      svg = renderSvg(graph, { scale, border: 1, background: null })
    } finally {
      model.beginUpdate()
      try {
        model.remove(cell)
      } finally {
        model.endUpdate()
      }
    }
    const markup = new XMLSerializer().serializeToString(svg)
    this.thumbs.set(item, markup)
    return markup
  }
}
