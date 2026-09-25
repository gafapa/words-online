// Collaborator presence inside draw.io: remote selections are highlighted and
// remote pointers are drawn with the collaborator's name, in their color.

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Awareness } from 'y-protocols/awareness'
import type { DrawioWindow, EditorUi } from './drawio'

interface RemoteState {
  user?: { name: string; color: string }
  diagram?: { page: string; cells: string[]; pointer?: { x: number; y: number } }
}

export class DiagramPresence {
  private highlights: any[] = []
  private pointers = new Map<number, HTMLElement>()
  private pointer: { x: number; y: number } | undefined
  private frame = 0

  constructor(
    private readonly ui: EditorUi,
    private readonly win: DrawioWindow,
    private readonly awareness: Awareness,
    private readonly clientId: number,
  ) {
    const graph = ui.editor.graph
    const { mxEvent } = win
    graph.getSelectionModel().addListener(mxEvent.CHANGE, () => this.publish())
    ui.editor.addListener('pageSelected', () => {
      this.publish()
      this.render()
    })
    let last = 0
    graph.addMouseListener({
      mouseDown: () => {},
      mouseUp: () => {},
      mouseMove: (_sender: unknown, me: any) => {
        const now = Date.now()
        if (now - last < 50) return
        last = now
        const p = graph.getPointForEvent(me.getEvent(), false)
        this.pointer = { x: Math.round(p.x), y: Math.round(p.y) }
        this.publish()
      },
    })
    // Pointers are in graph coordinates: redraw when the view pans or zooms.
    graph.view.addListener(mxEvent.SCALE, () => this.schedule())
    graph.view.addListener(mxEvent.TRANSLATE, () => this.schedule())
    graph.view.addListener(mxEvent.SCALE_AND_TRANSLATE, () => this.schedule())
    graph.getModel().addListener(mxEvent.CHANGE, () => this.schedule())
    awareness.on('change', () => this.schedule())
    this.publish()
  }

  private currentPageId(): string {
    return this.ui.currentPage?.getId() ?? ''
  }

  private publish(): void {
    const cells = (this.ui.editor.graph.getSelectionCells() as any[]).map((c) => c.getId())
    this.awareness.setLocalStateField('diagram', { page: this.currentPageId(), cells, pointer: this.pointer })
  }

  private schedule(): void {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.render())
  }

  render(): void {
    const { ui, win } = this
    const graph = ui.editor.graph
    this.highlights.forEach((h) => h.destroy())
    this.highlights = []
    const page = this.currentPageId()
    const seen = new Set<number>()

    for (const [clientId, state] of this.awareness.getStates() as Map<number, RemoteState>) {
      if (clientId === this.clientId || !state.user || state.diagram?.page !== page) continue
      const { color, name } = state.user
      for (const id of state.diagram.cells) {
        const cellState = graph.view.getState(graph.getModel().getCell(id))
        if (!cellState) continue
        const highlight = new win.mxCellHighlight(graph, color, 3)
        highlight.highlight(cellState)
        this.highlights.push(highlight)
      }
      const p = state.diagram.pointer
      if (!p) continue
      seen.add(clientId)
      let el = this.pointers.get(clientId)
      if (!el) {
        el = graph.container.ownerDocument.createElement('div') as HTMLElement
        el.className = 'wo-pointer'
        graph.container.appendChild(el)
        this.pointers.set(clientId, el)
      }
      if (!el) continue
      const { scale, translate } = graph.view
      el.style.cssText =
        `position:absolute;pointer-events:none;z-index:3;left:${(p.x + translate.x) * scale}px;top:${(p.y + translate.y) * scale}px;` +
        `border-left:2px solid ${color};height:18px;`
      el.innerHTML = `<span style="position:absolute;left:2px;top:14px;white-space:nowrap;font:600 11px sans-serif;color:#fff;background:${color};padding:1px 4px;border-radius:3px">${escape(name)}</span>`
    }
    for (const [id, el] of this.pointers) {
      if (!seen.has(id)) {
        el.remove()
        this.pointers.delete(id)
      }
    }
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
