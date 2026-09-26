// draw.io's shape libraries, generated into diagram-libs/ by
// scripts/build-diagram-libs.mjs and loaded on demand: the "More shapes"
// catalog, the palettes of the libraries a person enables, and the stencil sets
// and shape code that cells on the page use (whatever added them: a file, a
// remote edit, a paste or the shape panel).

import { InternalEvent, ShapeRegistry, StencilShapeRegistry, type Cell, type EventObject, type Graph } from '@maxgraph/core'
import { el, showDialog, toast } from '../../ui/widgets'
import { LIBS_BASE } from './graph'
import type { PaletteItem, PaletteLibrary } from './palette'
import { loadShapeFile } from './shapes/compat'
import { registerStencilSet } from './shapes/stencils'
import { locale, t } from '../../core/i18n'

export interface CatalogEntry {
  id: string
  title: string
  libraries: { id: string; name: string; count: number }[]
  // Size of palettes/<id>.json.
  bytes: number
}

export interface Catalog {
  version: string
  build: string
  groups: { title: string; entries: CatalogEntry[] }[]
  // Files per stencil basename (mxgraph.<basename>.<name>), in load order.
  libraries: Record<string, string[]>
  // Stencil files (stencils/<name>.xml) for the other basenames.
  stencils: string[]
  // Shape, marker and perimeter names outside the basename scheme.
  names: Record<string, string[]>
}

const STORAGE_KEY = 'diagram-libraries'

let catalog: Promise<Catalog | null> | null = null
let loadedCatalog: Catalog | null = null
let stencilNames = new Set<string>()

// The catalog, or null when it is unavailable (not built, or offline before first use).
export function loadCatalog(): Promise<Catalog | null> {
  catalog ??= fetch(LIBS_BASE + 'catalog.json')
    .then((r) => (r.ok ? (r.json() as Promise<Catalog>) : null))
    .catch(() => null)
    .then((cat) => {
      if (!cat) catalog = null
      else {
        loadedCatalog = cat
        stencilNames = new Set(cat.stencils)
        void dropOldCaches(cat.build)
      }
      return cat
    })
  return catalog
}

// Offline copies of earlier builds of the libraries (see vite.config.ts).
async function dropOldCaches(build: string) {
  try {
    for (const name of await caches.keys()) if (name.startsWith('diagram-libs-') && name !== `diagram-libs-${build}`) await caches.delete(name)
  } catch {
    // No Cache Storage (e.g. insecure context).
  }
}

// ---------- Stencils and shape code ----------

// Files that define a shape (or marker) name, like draw.io's mxStencilRegistry.getStencil.
function filesFor(cat: Catalog, name: string): string[] {
  const named = cat.names[name]
  if (named) return named
  const parts = name.split('.')
  if (parts[0] !== 'mxgraph' || parts.length < 3) return []
  const base = parts.slice(1, -1).join('/')
  const files = cat.libraries[base]
  if (files) return files
  const file = base.replace('_-_', '_')
  return stencilNames.has(file) ? [`stencils/${file}.xml`] : []
}

const isKnown = (name: string) => !!ShapeRegistry.get(name) || !!StencilShapeRegistry.get(name)

const loads = new Map<string, Promise<void>>()
const loaded = new Set<string>()

function loadFile(file: string): Promise<void> {
  let load = loads.get(file)
  if (!load) {
    load = file.endsWith('.js')
      ? loadShapeFile(LIBS_BASE, file)
      : fetch(LIBS_BASE + file).then(async (r) => {
          if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
          registerStencilSet(await r.text())
        })
    load = load.then(
      () => void loaded.add(file),
      (e) => {
        // Tried again the next time a cell needs it.
        loads.delete(file)
        console.warn(`Could not load ${file}:`, e)
      },
    )
    loads.set(file, load)
  }
  return load
}

// Whether a name still needs files: unknown so far, or its library is halfway
// loaded (e.g. the shape code is there but not the stencils it draws).
function needsLoad(name: string): boolean {
  if (!name) return false
  const files = loadedCatalog ? filesFor(loadedCatalog, name) : []
  if (files.some((f) => loads.has(f) && !loaded.has(f))) return true
  return !isKnown(name) && (!loadedCatalog || files.some((f) => !loaded.has(f)))
}

// Shape-like values of a style: its shape, markers and stencil references (e.g. resIcon=mxgraph.aws4.lambda).
function styleNames(style: Record<string, unknown>, out: Set<string>) {
  for (const [key, value] of Object.entries(style)) {
    if (typeof value !== 'string') continue
    if (key === 'shape' || key === 'startArrow' || key === 'endArrow' || value.startsWith('mxgraph.')) out.add(value)
  }
  for (const base of (style.baseStyleNames as string[] | undefined) ?? []) if (base.startsWith('mxgraph.')) out.add(base)
}

function parseStyleNames(style: string, out: Set<string>) {
  const obj: Record<string, unknown> = {}
  const bases: string[] = []
  for (const part of style.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) bases.push(part)
    else obj[part.slice(0, eq)] = part.slice(eq + 1)
  }
  obj.baseStyleNames = bases
  styleNames(obj, out)
}

// Loads what the given names need; resolves true if anything new was loaded.
async function ensureNames(names: Set<string>): Promise<boolean> {
  const unknown = [...names].filter(needsLoad)
  if (!unknown.length) return false
  const cat = await loadCatalog()
  if (!cat) return false
  const groups = new Map<string, string[]>()
  for (const name of unknown) {
    const files = filesFor(cat, name)
    if (files.length) groups.set(files.join(), files)
  }
  if (!groups.size) return false
  // Files of one library load in order (shape code may extend earlier files).
  await Promise.all([...groups.values()].map(async (files) => {
    for (const file of files) await loadFile(file)
  }))
  return true
}

// Loads the stencils and shape code for palette items (before their thumbnails
// are drawn); null when nothing is missing.
export function prepareItems(items: PaletteItem[]): Promise<boolean> | null {
  const names = new Set<string>()
  for (const item of items) {
    parseStyleNames(item.style, names)
    item.cells?.forEach((c) => c.style && parseStyleNames(c.style, names))
  }
  return [...names].some(needsLoad) ? ensureNames(names) : null
}

// Keeps the graph's cells rendered with their draw.io shapes: whenever cells
// appear or change style, loads what they need and redraws the view. Until then
// unknown shapes render as rectangles; styles are never changed.
export function watchGraph(graph: Graph): void {
  const model = graph.getDataModel()
  let pending = 0
  let loadedAny = false
  const scan = (cells: Cell[]) => {
    const names = new Set<string>()
    const visit = (cell: Cell) => {
      const style = cell.getStyle() as Record<string, unknown> | null
      if (style) styleNames(style, names)
      for (let i = 0; i < cell.getChildCount(); i++) visit(cell.getChildAt(i))
    }
    cells.forEach(visit)
    if (![...names].some(needsLoad)) return
    pending++
    void ensureNames(names).then((loaded) => {
      loadedAny ||= loaded
      // One redraw once the concurrent loads are done.
      if (--pending === 0 && loadedAny) {
        loadedAny = false
        graph.refresh()
      }
    })
  }
  model.addListener(InternalEvent.CHANGE, (_sender: unknown, evt: EventObject) => {
    const cells: Cell[] = []
    for (const change of (evt.getProperty('edit') as { changes: Record<string, unknown>[] }).changes) {
      const cell = (change.cell ?? change.child ?? change.root) as Cell | undefined
      if (cell) cells.push(cell)
    }
    if (cells.length) scan(cells)
  })
  const root = model.getRoot()
  if (root) scan([root])
}

// ---------- Enabled libraries ----------

export function enabledEntries(): string[] {
  try {
    const ids = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function saveEnabled(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // Private mode: enabled for this session only.
  }
}

const palettes = new Map<string, Promise<PaletteLibrary[]>>()

function loadEntry(id: string): Promise<PaletteLibrary[]> {
  let load = palettes.get(id)
  if (!load) {
    load = fetch(`${LIBS_BASE}palettes/${encodeURIComponent(id)}.json`).then(async (r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
      const libs = (await r.json()) as PaletteLibrary[]
      // Prefixed so they never clash with the built-in libraries.
      return libs.map((lib) => ({ ...lib, id: `drawio.${lib.id}` }))
    })
    load.catch(() => palettes.delete(id))
    palettes.set(id, load)
  }
  return load
}

// Palettes of the enabled entries, in catalog order; entries that fail to load are skipped.
export async function loadEnabledLibraries(ids = enabledEntries()): Promise<PaletteLibrary[]> {
  if (!ids.length) return []
  const cat = await loadCatalog()
  if (!cat) return []
  const order = cat.groups.flatMap((g) => g.entries.map((e) => e.id)).filter((id) => ids.includes(id))
  const results = await Promise.allSettled(order.map(loadEntry))
  const failed = results.filter((r) => r.status === 'rejected').length
  if (failed) toast(`${failed} shape ${failed === 1 ? 'library' : 'libraries'} could not be loaded`)
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}

const formatSize = (bytes: number) => (bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1e3))} KB` : `${(bytes / 1e6).toFixed(1)} MB`)

// Generic group and library titles of the catalog in the user's language (product names stay).
const CATALOG_TITLES: Record<string, string> = {
  Standard: t('Standard'),
  Software: t('Software'),
  Networking: t('Networking'),
  Business: t('Business'),
  Other: t('Other'),
  General: t('General'),
  Arrows: t('Arrows'),
  Clipart: t('Clipart'),
  'Data Flow Diagram': t('Data Flow Diagram'),
  Mockups: t('Mockups'),
  Sitemap: t('Sitemap'),
  'Value Stream Mapping': t('Value Stream Mapping'),
  Cabinets: t('Cabinets'),
  Infographic: t('Infographic'),
  Electrical: t('Electrical'),
  Floorplans: t('Floorplans'),
  'Fluid Power (ISO 1219)': t('Fluid Power (ISO 1219)'),
  'Process Engineering': t('Process Engineering'),
  'Threat Modeling': t('Threat Modeling'),
  'Web Icons': t('Web Icons'),
  Signs: t('Signs'),
}
const catalogTitle = (title: string) => CATALOG_TITLES[title] ?? title

// "More shapes" dialog: pick the draw.io libraries shown in the shape panel.
// Resolves the new selection, or null when cancelled.
export async function chooseLibraries(): Promise<string[] | null> {
  const cat = await loadCatalog()
  if (!cat) {
    toast(t('Shape libraries are not available (offline?)'))
    return null
  }
  const enabled = new Set(enabledEntries())
  const filter = el('input', { type: 'search', class: 'field', placeholder: t('Filter libraries') })
  filter.setAttribute('aria-label', t('Filter libraries'))
  const list = el('div', { class: 'libs-list' })
  const boxes: { box: HTMLInputElement; row: HTMLElement; text: string }[] = []
  const sections: { section: HTMLElement; rows: HTMLElement[] }[] = []
  for (const group of cat.groups) {
    const rows: HTMLElement[] = []
    const section = el('section', { class: 'libs-group' }, el('h3', { textContent: catalogTitle(group.title) }))
    for (const entry of group.entries) {
      const box = el('input', { type: 'checkbox', value: entry.id, checked: enabled.has(entry.id) })
      const count = entry.libraries.reduce((n, l) => n + l.count, 0)
      const row = el('label', { class: 'libs-entry', title: entry.libraries.map((l) => catalogTitle(l.name)).join('\n') },
        box, el('span', { textContent: catalogTitle(entry.title) }), el('small', { textContent: `${count.toLocaleString(locale)} · ${formatSize(entry.bytes)}` }))
      boxes.push({ box, row, text: `${group.title} ${catalogTitle(group.title)} ${entry.title} ${catalogTitle(entry.title)} ${entry.libraries.map((l) => l.name).join(' ')}`.toLowerCase() })
      rows.push(row)
      section.append(row)
    }
    sections.push({ section, rows })
    list.append(section)
  }
  filter.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase()
    for (const { row, text } of boxes) row.hidden = !!q && !text.includes(q)
    for (const { section, rows } of sections) section.hidden = rows.every((r) => r.hidden)
  })
  filter.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.preventDefault()
  })
  const body = el('div', { class: 'libs-dialog' }, filter, list,
    el('p', { class: 'libs-note', textContent: t('Shapes from draw.io. Libraries are downloaded when enabled and then also work offline.') }))
  const result = await showDialog(t('More shapes'), body, [
    { label: t('Cancel'), value: 'cancel' },
    { label: t('Apply'), value: 'ok', primary: true },
  ], true)
  if (result !== 'ok') return null
  const ids = boxes.filter((b) => b.box.checked).map((b) => b.box.value)
  saveEnabled(ids)
  return ids
}
