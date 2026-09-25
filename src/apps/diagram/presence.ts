// Collaborator presence on the diagram: remote selections are highlighted and
// remote pointers are drawn with the collaborator's name, in their color.

import { CellHighlight, InternalEvent, type InternalMouseEvent } from '@maxgraph/core'
import type { Awareness } from 'y-protocols/awareness'
import type { EditorGraph } from './graph'

interface RemoteState {
  user?: { name: string; color: string }
  diagram?: { page: string; cells: string[]; pointer?: { x: number; y: number } }
}

export class DiagramPresence {
  private highlights: CellHighlight[] = []
  private pointers = new Map<number, HTMLElement>()
  private pointer: { x: number; y: number } | undefined
  private frame = 0

  constructor(
    private readonly graph: EditorGraph,
    private readonly awareness: Awareness,
    private readonly clientId: number,
  ) {
    graph.getSelectionModel().addListener(InternalEvent.CHANGE, () => this.publish())
    let last = 0
    graph.addMouseListener({
      mouseDown: () => {},
      mouseUp: () => {},
      mouseMove: (_sender: unknown, me: InternalMouseEvent) => {
        const now = Date.now()
        if (now - last < 50) return
        last = now
        const p = graph.getPointForEvent(me.getEvent(), false)
        this.pointer = { x: Math.round(p.x), y: Math.round(p.y) }
        this.publish()
      },
    })
    // Pointers are in graph coordinates: redraw when the view pans or zooms.
    const schedule = () => this.schedule()
    graph.view.addListener(InternalEvent.SCALE, schedule)
    graph.view.addListener(InternalEvent.TRANSLATE, schedule)
    graph.view.addListener(InternalEvent.SCALE_AND_TRANSLATE, schedule)
    graph.getDataModel().addListener(InternalEvent.CHANGE, schedule)
    awareness.on('change', schedule)
    this.publish()
  }

  // Called when another page is shown.
  pageChanged(): void {
    this.pointer = undefined
    this.publish()
    this.schedule()
  }

  private publish(): void {
    const cells = this.graph.getSelectionCells().map((c) => c.getId()!)
    this.awareness.setLocalStateField('diagram', { page: this.graph.pageId ?? '', cells, pointer: this.pointer })
  }

  private schedule(): void {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.render())
  }

  // Page each collaborator is looking at, for the page tabs.
  pagesOfPeers(): Map<string, { name: string; color: string }[]> {
    const out = new Map<string, { name: string; color: string }[]>()
    for (const [clientId, state] of this.awareness.getStates() as Map<number, RemoteState>) {
      if (clientId === this.clientId || !state.user || !state.diagram) continue
      const list = out.get(state.diagram.page) ?? []
      list.push(state.user)
      out.set(state.diagram.page, list)
    }
    return out
  }

  render(): void {
    const { graph } = this
    this.highlights.forEach((h) => h.destroy())
    this.highlights = []
    const seen = new Set<number>()

    for (const [clientId, state] of this.awareness.getStates() as Map<number, RemoteState>) {
      const diagram = state.diagram
      if (clientId === this.clientId || !state.user || !diagram || diagram.page !== graph.pageId) continue
      const { color, name } = state.user
      for (const id of diagram.cells) {
        const cell = graph.getDataModel().getCell(id)
        const cellState = cell ? graph.view.getState(cell) : null
        if (!cellState) continue
        const highlight = new CellHighlight(graph, color, 3)
        highlight.highlight(cellState)
        this.highlights.push(highlight)
      }
      const p = diagram.pointer
      if (!p) continue
      seen.add(clientId)
      let el = this.pointers.get(clientId)
      if (!el) {
        el = document.createElement('div')
        el.className = 'diagram-pointer'
        el.append(document.createElement('span'))
        graph.container.append(el)
        this.pointers.set(clientId, el)
      }
      const { scale, translate } = graph.view
      el.style.left = `${(p.x + translate.x) * scale}px`
      el.style.top = `${(p.y + translate.y) * scale}px`
      el.style.borderColor = color
      const label = el.firstElementChild as HTMLElement
      label.textContent = name
      label.style.background = color
    }
    for (const [id, el] of this.pointers) {
      if (seen.has(id)) continue
      el.remove()
      this.pointers.delete(id)
    }
  }
}
