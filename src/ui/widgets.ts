// Small UI building blocks: icons, menu bar, popovers and dialogs.

import { createElement, type IconNode } from 'lucide'

export function icon(node: IconNode, size = 18): SVGElement {
  return createElement(node, { width: size, height: size, 'stroke-width': 1.8 })
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string; dataset?: Record<string, string> } = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  const { class: className, dataset, ...rest } = props
  if (className) node.className = className
  if (dataset) Object.assign(node.dataset, dataset)
  Object.assign(node, rest)
  for (const c of children) if (c) node.append(c)
  return node
}

// ---------- Menu bar ----------

export interface MenuItem {
  label: string
  shortcut?: string
  run?: () => void
  active?: () => boolean
  enabled?: () => boolean
  submenu?: MenuEntry[]
}
export type MenuEntry = MenuItem | '-'

export interface Menu {
  label: string
  items: MenuEntry[]
}

export function createMenuBar(container: HTMLElement, menus: Menu[]): void {
  let openIndex = -1
  const buttons: HTMLButtonElement[] = []
  let panel: HTMLElement | null = null

  const close = () => {
    panel?.remove()
    panel = null
    buttons.forEach((b) => b.classList.remove('open'))
    openIndex = -1
  }

  const open = (index: number) => {
    close()
    openIndex = index
    const button = buttons[index]
    button.classList.add('open')
    panel = renderItems(menus[index].items, close)
    panel.classList.add('menu-panel')
    const rect = button.getBoundingClientRect()
    panel.style.left = `${rect.left}px`
    panel.style.top = `${rect.bottom + 2}px`
    document.body.append(panel)
  }

  menus.forEach((menu, i) => {
    const button = el('button', { type: 'button', class: 'menubar-item', textContent: menu.label })
    button.addEventListener('mousedown', (e) => {
      e.preventDefault() // keep the editor selection
      if (openIndex === i) close()
      else open(i)
    })
    button.addEventListener('mouseenter', () => openIndex >= 0 && openIndex !== i && open(i))
    buttons.push(button)
    container.append(button)
  })

  document.addEventListener('mousedown', (e) => {
    const target = e.target as Node
    if (panel && !panel.contains(target) && !buttons.some((b) => b.contains(target))) close()
  })
  document.addEventListener('keydown', (e) => e.key === 'Escape' && close())
  window.addEventListener('resize', close)
}

// Context menu at the pointer position.
export function showContextMenu(x: number, y: number, items: MenuEntry[]): void {
  document.querySelector('.context-menu')?.remove()
  const close = () => {
    panel.remove()
    document.removeEventListener('mousedown', outside)
  }
  const outside = (e: MouseEvent) => !panel.contains(e.target as Node) && close()
  const panel = renderItems(items, close)
  panel.classList.add('menu-panel', 'context-menu')
  document.body.append(panel)
  panel.style.left = `${Math.min(x, window.innerWidth - panel.offsetWidth - 8)}px`
  panel.style.top = `${Math.min(y, window.innerHeight - panel.offsetHeight - 8)}px`
  setTimeout(() => document.addEventListener('mousedown', outside))
  document.addEventListener('keydown', (e) => e.key === 'Escape' && close(), { once: true })
}

function renderItems(items: MenuEntry[], close: () => void): HTMLElement {
  const list = el('div', { class: 'menu-list', role: 'menu' })
  let submenu: HTMLElement | null = null
  for (const item of items) {
    if (item === '-') {
      list.append(el('div', { class: 'menu-sep' }))
      continue
    }
    const enabled = item.enabled ? item.enabled() : true
    const row = el(
      'button',
      { type: 'button', class: 'menu-row', disabled: !enabled, role: 'menuitem' },
      el('span', { class: 'menu-check', textContent: item.active?.() ? '✓' : '' }),
      el('span', { class: 'menu-label', textContent: item.label }),
      el('span', { class: 'menu-shortcut', textContent: item.submenu ? '▸' : (item.shortcut ?? '') }),
    )
    row.addEventListener('mousedown', (e) => e.preventDefault())
    if (item.submenu) {
      row.addEventListener('mouseenter', () => {
        submenu?.remove()
        submenu = renderItems(item.submenu!, close)
        submenu.classList.add('menu-panel')
        const rect = row.getBoundingClientRect()
        submenu.style.left = `${rect.right - 2}px`
        submenu.style.top = `${rect.top - 4}px`
        list.append(submenu)
      })
    } else {
      row.addEventListener('mouseenter', () => {
        submenu?.remove()
        submenu = null
      })
      row.addEventListener('click', () => {
        close()
        item.run?.()
      })
    }
    list.append(row)
  }
  return list
}

// ---------- Popovers ----------

let activePopover: { el: HTMLElement; anchor: HTMLElement } | null = null

export function closePopover(): void {
  activePopover?.el.remove()
  activePopover = null
}

export function openPopover(anchor: HTMLElement, content: HTMLElement): void {
  if (activePopover?.anchor === anchor) return closePopover()
  closePopover()
  const pop = el('div', { class: 'popover' }, content)
  document.body.append(pop)
  const rect = anchor.getBoundingClientRect()
  const left = Math.min(rect.left, window.innerWidth - pop.offsetWidth - 8)
  pop.style.left = `${Math.max(8, left)}px`
  pop.style.top = `${rect.bottom + 4}px`
  activePopover = { el: pop, anchor }
}

document.addEventListener('mousedown', (e) => {
  const target = e.target as Node
  if (activePopover && !activePopover.el.contains(target) && !activePopover.anchor.contains(target)) closePopover()
})
document.addEventListener('keydown', (e) => e.key === 'Escape' && closePopover())

const PALETTE = [
  ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'],
  ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'],
  ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'],
  ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
  ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'],
  ['#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4c1130'],
]

export function colorPalette(onPick: (color: string | null) => void, resetLabel: string): HTMLElement {
  const wrap = el('div', { class: 'palette' })
  const reset = el('button', { type: 'button', class: 'palette-reset', textContent: resetLabel })
  reset.addEventListener('mousedown', (e) => e.preventDefault())
  reset.addEventListener('click', () => {
    closePopover()
    onPick(null)
  })
  wrap.append(reset)
  const grid = el('div', { class: 'palette-grid' })
  for (const row of PALETTE) {
    for (const color of row) {
      const swatch = el('button', { type: 'button', class: 'swatch', title: color })
      swatch.style.background = color
      swatch.addEventListener('mousedown', (e) => e.preventDefault())
      swatch.addEventListener('click', () => {
        closePopover()
        onPick(color)
      })
      grid.append(swatch)
    }
  }
  const custom = el('input', { type: 'color', class: 'palette-custom', title: 'Custom color' })
  custom.addEventListener('change', () => {
    closePopover()
    onPick(custom.value)
  })
  wrap.append(grid, el('label', { class: 'palette-custom-row' }, 'Custom… ', custom))
  return wrap
}

export function tableGrid(onPick: (rows: number, cols: number) => void, size = 10): HTMLElement {
  const label = el('div', { class: 'table-size', textContent: 'Insert table' })
  const grid = el('div', { class: 'table-grid' })
  grid.style.gridTemplateColumns = `repeat(${size}, 16px)`
  const cells: HTMLElement[] = []
  for (let r = 1; r <= size; r++) {
    for (let c = 1; c <= size; c++) {
      const cell = el('button', { type: 'button', dataset: { r: String(r), c: String(c) } })
      cell.setAttribute('aria-label', `${r} × ${c}`)
      cells.push(cell)
      grid.append(cell)
    }
  }
  grid.addEventListener('mouseover', (e) => {
    const t = e.target as HTMLElement
    if (!t.dataset.r) return
    const r = Number(t.dataset.r)
    const c = Number(t.dataset.c)
    cells.forEach((x) => x.classList.toggle('on', Number(x.dataset.r) <= r && Number(x.dataset.c) <= c))
    label.textContent = `${r} × ${c}`
  })
  grid.addEventListener('mousedown', (e) => e.preventDefault())
  grid.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    if (!t.dataset.r) return
    closePopover()
    onPick(Number(t.dataset.r), Number(t.dataset.c))
  })
  return el('div', {}, label, grid)
}

// ---------- Dialogs ----------

export interface DialogButton {
  label: string
  primary?: boolean
  value: string
}

// Shows a modal dialog; resolves with the pressed button value ('' when dismissed).
export function showDialog(title: string, body: HTMLElement, buttons: DialogButton[], wide = false): Promise<string> {
  return new Promise((resolve) => {
    const dialog = el('dialog', { class: wide ? 'dlg wide' : 'dlg' })
    const form = el('form', { method: 'dialog' })
    const actions = el('div', { class: 'dlg-actions' })
    for (const b of buttons) actions.append(el('button', { value: b.value, textContent: b.label, class: b.primary ? 'primary' : '' }))
    form.append(el('h2', { textContent: title }), body, actions)
    dialog.append(form)
    document.body.append(dialog)
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue)
      dialog.remove()
    })
    dialog.showModal()
    body.querySelector<HTMLElement>('input, textarea, select')?.focus()
  })
}

export async function promptText(title: string, label: string, value = '', multiline = false): Promise<string | null> {
  const input = multiline
    ? el('textarea', { value, rows: 4, class: 'field' })
    : el('input', { value, class: 'field' })
  const body = el('label', { class: 'field-label' }, label, input)
  if (!multiline) {
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        e.preventDefault()
        ;(input.closest('dialog') as HTMLDialogElement).close('ok')
      }
    })
  }
  const result = await showDialog(title, body, [
    { label: 'Cancel', value: 'cancel' },
    { label: 'OK', value: 'ok', primary: true },
  ])
  return result === 'ok' ? input.value : null
}

let toastTimer = 0
export function toast(message: string): void {
  let node = document.getElementById('toast')
  if (!node) {
    node = el('div', { id: 'toast', class: 'toast' })
    document.body.append(node)
  }
  node.textContent = message
  node.hidden = false
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (node!.hidden = true), 3000)
}
