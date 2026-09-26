// Drawing templates, written as .excalidraw scenes and opened through the
// drawing app's import (Excalidraw restores missing element defaults).

import { appInfo } from '../apps/registry'
import { pick, type Lang } from './types'

type Element = Record<string, unknown>

let seed = 1
const base = (type: string, id: string, x: number, y: number, width: number, height: number, extra: Element = {}): Element => ({
  id,
  type,
  x,
  y,
  width,
  height,
  angle: 0,
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
  fillStyle: 'solid',
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 1,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: null,
  seed: seed++,
  version: 1,
  versionNonce: seed * 7919,
  isDeleted: false,
  boundElements: [],
  updated: 1,
  link: null,
  locked: false,
  ...extra,
})

const text = (id: string, value: string, x: number, y: number, width: number, height: number, fontSize: number, extra: Element = {}): Element =>
  base('text', id, x, y, width, height, {
    text: value,
    originalText: value,
    fontSize,
    fontFamily: 5,
    textAlign: 'center',
    verticalAlign: 'middle',
    containerId: null,
    autoResize: true,
    lineHeight: 1.25,
    ...extra,
  })

// A shape with a centred label bound to it.
function labelled(elements: Element[], id: string, type: string, label: string, x: number, y: number, w: number, h: number, fill: string, fontSize = 20): string {
  const shape = base(type, id, x, y, w, h, {
    backgroundColor: fill,
    roundness: type === 'rectangle' ? { type: 3 } : { type: 2 },
    boundElements: [{ id: `${id}-t`, type: 'text' }],
  })
  const lines = label.split('\n').length
  const th = lines * fontSize * 1.25
  elements.push(shape, text(`${id}-t`, label, x + 10, y + (h - th) / 2, w - 20, th, fontSize, { containerId: id }))
  return id
}

// Distance from a shape's centre to its outline along (dx, dy), as a fraction of (dx, dy).
function toOutline(e: Element, dx: number, dy: number, gap: number): number {
  const hw = (e.width as number) / 2 + gap
  const hh = (e.height as number) / 2 + gap
  if (e.type === 'ellipse') return 1 / Math.hypot(dx / hw, dy / hh)
  return Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity)
}

// An arrow between two shapes, bound to both and ending at their outlines.
function arrow(elements: Element[], id: string, from: Element, to: Element): void {
  const center = (e: Element) => [(e.x as number) + (e.width as number) / 2, (e.y as number) + (e.height as number) / 2]
  const [cx1, cy1] = center(from)
  const [cx2, cy2] = center(to)
  const dx = cx2 - cx1
  const dy = cy2 - cy1
  const t1 = toOutline(from, dx, dy, 8)
  const t2 = 1 - toOutline(to, -dx, -dy, 8)
  const x1 = cx1 + dx * t1
  const y1 = cy1 + dy * t1
  const w = dx * (t2 - t1)
  const h = dy * (t2 - t1)
  elements.push(
    base('arrow', id, x1, y1, w, h, {
      points: [
        [0, 0],
        [w, h],
      ],
      roundness: { type: 2 },
      startBinding: { elementId: from.id, focus: 0, gap: 8 },
      endBinding: { elementId: to.id, focus: 0, gap: 8 },
      startArrowhead: null,
      endArrowhead: 'arrow',
      strokeColor: '#868e96',
    }),
  )
  ;(from.boundElements as Element[]).push({ id, type: 'arrow' })
  ;(to.boundElements as Element[]).push({ id, type: 'arrow' })
}

function brainstorm(lang: Lang): Element[] {
  const L = pick(lang)
  const els: Element[] = []
  els.push(text('title', L('Lluvia de ideas', 'Chuvia de ideas', 'Remue-méninges', 'Brainstorming'), 300, 100, 400, 45, 36))
  labelled(els, 'topic', 'ellipse', L('Tema central', 'Tema central', 'Thème central', 'Zentrales Thema'), 380, 380, 240, 130, '#a5d8ff', 28)
  const topic = els.find((e) => e.id === 'topic')!
  const colors = ['#ffec99', '#b2f2bb', '#ffc9c9', '#d0bfff', '#ffd8a8', '#99e9f2']
  const spots = [
    [80, 190],
    [390, 190],
    [700, 190],
    [80, 600],
    [390, 600],
    [700, 600],
  ]
  spots.forEach(([x, y], i) => {
    labelled(els, `idea${i}`, 'rectangle', `${L('Idea', 'Idea', 'Idée', 'Idee')} ${i + 1}`, x, y, 220, 110, colors[i])
    arrow(els, `a${i}`, topic, els.find((e) => e.id === `idea${i}`)!)
  })
  els.push(
    text(
      'help',
      L('Duplica las notas (Ctrl+D) para añadir más ideas y agrúpalas por colores.', 'Duplica as notas (Ctrl+D) para engadir máis ideas e agrúpaas por cores.', 'Duplique les notes (Ctrl+D) pour ajouter d’autres idées et regroupe-les par couleur.', 'Dupliziere die Notizen (Strg+D), um weitere Ideen hinzuzufügen, und gruppiere sie nach Farben.'),
      150,
      760,
      700,
      25,
      18,
      { strokeColor: '#868e96' },
    ),
  )
  return els
}

const BUILDERS: Record<string, (lang: Lang) => Element[]> = { brainstorm }

export async function createDrawTemplate(id: string, lang: Lang, name: string): Promise<string> {
  const scene = { type: 'excalidraw', version: 2, source: 'words-online', elements: BUILDERS[id](lang), appState: { gridSize: 20, viewBackgroundColor: '#ffffff' }, files: {} }
  const module = await appInfo('draw').load!()
  return module.importFile(new File([JSON.stringify(scene)], `${name}.excalidraw`, { type: 'application/json' }))
}
