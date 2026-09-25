// Toolbar popover to insert tables (size grid) and edit rows/columns.

import type Quill from 'quill'
import type { Range } from 'quill'

const GRID = 8

type TableModule = {
  insertTable(rows: number, columns: number): void
  insertRowAbove(): void
  insertRowBelow(): void
  insertColumnLeft(): void
  insertColumnRight(): void
  deleteRow(): void
  deleteColumn(): void
  deleteTable(): void
  getTable(range?: Range): [unknown, unknown, unknown, number]
}

const ACTIONS: [label: string, method: keyof TableModule][] = [
  ['Insert row above', 'insertRowAbove'],
  ['Insert row below', 'insertRowBelow'],
  ['Insert column left', 'insertColumnLeft'],
  ['Insert column right', 'insertColumnRight'],
  ['Delete row', 'deleteRow'],
  ['Delete column', 'deleteColumn'],
  ['Delete table', 'deleteTable'],
]

export function setupTableUi(quill: Quill): () => void {
  const table = quill.getModule('table') as TableModule
  const toolbar = quill.getModule('toolbar') as { container: HTMLElement } | undefined
  const button = toolbar?.container.querySelector<HTMLButtonElement>('.ql-table')
  if (!button) return () => {}
  button.title = 'Table'
  let range: Range | null = null

  const popover = document.createElement('div')
  popover.className = 'table-popover'
  popover.hidden = true
  const grid = document.createElement('div')
  grid.className = 'table-grid'
  const label = document.createElement('div')
  label.className = 'table-size'
  const cells: HTMLElement[] = []
  for (let r = 1; r <= GRID; r++) {
    for (let c = 1; c <= GRID; c++) {
      const cell = document.createElement('button')
      cell.type = 'button'
      cell.dataset.r = String(r)
      cell.dataset.c = String(c)
      cell.setAttribute('aria-label', `${r} × ${c} table`)
      cells.push(cell)
      grid.append(cell)
    }
  }
  const highlight = (rows: number, cols: number) => {
    cells.forEach((el) => el.classList.toggle('on', Number(el.dataset.r) <= rows && Number(el.dataset.c) <= cols))
    label.textContent = rows ? `${rows} × ${cols}` : 'Insert table'
  }
  grid.addEventListener('mouseover', (e) => {
    const el = e.target as HTMLElement
    if (el.dataset.r) highlight(Number(el.dataset.r), Number(el.dataset.c))
  })
  grid.addEventListener('mouseleave', () => highlight(0, 0))
  grid.addEventListener('click', (e) => {
    const el = e.target as HTMLElement
    if (!el.dataset.r) return
    run(() => {
      // Insert on an empty line so the current paragraph's text stays outside the table.
      const at = quill.getSelection(true).index
      const [line, offset] = quill.getLine(at)
      if (line && line.length() > 1) {
        const end = at - offset + line.length() - 1
        quill.insertText(end, '\n', 'user')
        quill.setSelection(end + 1, 0, 'silent')
      }
      table.insertTable(Number(el.dataset.r), Number(el.dataset.c))
    })
  })

  const actions = document.createElement('div')
  actions.className = 'table-actions'
  ACTIONS.forEach(([text, method]) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = text
    b.addEventListener('click', () => run(() => (table[method] as () => void)()))
    actions.append(b)
  })
  popover.append(label, grid, actions)
  button.parentElement!.append(popover)

  // Runs an edit with the editor selection that existed when the popover opened.
  function run(edit: () => void) {
    hide()
    if (!range) return
    quill.setSelection(range, 'silent')
    edit()
    quill.focus()
  }

  function show() {
    range = quill.getSelection(true)
    const inTable = range != null && table.getTable(range)[2] != null
    // Inside a table: row/column actions. Elsewhere: size grid (tables cannot be nested).
    actions.hidden = !inTable
    grid.hidden = inTable
    label.hidden = inTable
    highlight(0, 0)
    popover.hidden = false
  }

  function hide() {
    popover.hidden = true
  }

  document.addEventListener('mousedown', (e) => {
    if (!popover.hidden && !popover.contains(e.target as Node) && !button.contains(e.target as Node)) hide()
  })
  document.addEventListener('keydown', (e) => e.key === 'Escape' && hide())

  // Toolbar handler.
  return () => (popover.hidden ? show() : hide())
}
