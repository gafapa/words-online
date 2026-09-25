// Printing: renders the used range of a sheet as an HTML table (styles,
// merges, column widths and formatted values) for the browser's print dialog.

import type { ICellData, IRange, IStyleData, IWorkbookData } from '@univerjs/presets'
import { t } from '../../core/i18n'

const H_ALIGN: Record<number, string> = { 1: 'left', 2: 'center', 3: 'right', 4: 'justify', 5: 'justify', 6: 'justify' }
const V_ALIGN: Record<number, string> = { 1: 'top', 2: 'middle', 3: 'bottom' }
const DEFAULT_COL_WIDTH = 88

export function renderPrintHtml(data: IWorkbookData, sheetId: string, display: (row: number, col: number) => string): string {
  const sheet = data.sheets[sheetId]
  if (!sheet) return ''
  const cells = sheet.cellData ?? {}
  const merges: IRange[] = sheet.mergeData ?? []

  // Used range: the last row/column holding a value.
  let lastRow = -1
  let lastCol = -1
  for (const [r, cols] of Object.entries(cells)) {
    for (const [c, cell] of Object.entries(cols ?? {}) as [string, ICellData | undefined][]) {
      if (cell && cell.v !== undefined && cell.v !== null && cell.v !== '') {
        lastRow = Math.max(lastRow, Number(r))
        lastCol = Math.max(lastCol, Number(c))
      }
    }
  }
  for (const m of merges) {
    lastRow = Math.max(lastRow, m.endRow)
    lastCol = Math.max(lastCol, m.endColumn)
  }
  if (lastRow < 0) return `<p>${t('(empty sheet)')}</p>`

  const covered = new Set<string>()
  const spans = new Map<string, IRange>()
  for (const m of merges) {
    spans.set(`${m.startRow}:${m.startColumn}`, m)
    for (let r = m.startRow; r <= m.endRow; r++) for (let c = m.startColumn; c <= m.endColumn; c++) if (r !== m.startRow || c !== m.startColumn) covered.add(`${r}:${c}`)
  }

  const style = (cell: ICellData | undefined): IStyleData | undefined => {
    if (!cell?.s) return undefined
    return typeof cell.s === 'string' ? (data.styles?.[cell.s] ?? undefined) : cell.s
  }

  let html = `<h1>${escape(sheet.name ?? '')}</h1><table><colgroup>`
  for (let c = 0; c <= lastCol; c++) html += `<col style="width:${sheet.columnData?.[c]?.w ?? sheet.defaultColumnWidth ?? DEFAULT_COL_WIDTH}px">`
  html += '</colgroup>'
  for (let r = 0; r <= lastRow; r++) {
    if (sheet.rowData?.[r]?.hd) continue
    const height = sheet.rowData?.[r]?.h
    html += height ? `<tr style="height:${height}px">` : '<tr>'
    for (let c = 0; c <= lastCol; c++) {
      if (covered.has(`${r}:${c}`)) continue
      const cell = cells[r]?.[c]
      const span = spans.get(`${r}:${c}`)
      const attrs = span ? ` rowspan="${span.endRow - span.startRow + 1}" colspan="${span.endColumn - span.startColumn + 1}"` : ''
      const css = cellCss(style(cell), typeof cell?.v === 'number')
      html += `<td${attrs}${css ? ` style="${css}"` : ''}>${escape(display(r, c))}</td>`
    }
    html += '</tr>'
  }
  return `${html}</table>`
}

function cellCss(s: IStyleData | undefined, numeric: boolean): string {
  const css: string[] = []
  if (numeric) css.push('text-align:right')
  if (!s) return css.join(';')
  if (s.ff) css.push(`font-family:"${s.ff}"`)
  if (s.fs) css.push(`font-size:${s.fs}pt`)
  if (s.bl) css.push('font-weight:bold')
  if (s.it) css.push('font-style:italic')
  const deco = [s.ul?.s ? 'underline' : '', s.st?.s ? 'line-through' : ''].filter(Boolean).join(' ')
  if (deco) css.push(`text-decoration:${deco}`)
  if (s.cl?.rgb) css.push(`color:${s.cl.rgb}`)
  if (s.bg?.rgb) css.push(`background:${s.bg.rgb}`)
  if (s.ht && H_ALIGN[s.ht]) css.push(`text-align:${H_ALIGN[s.ht]}`)
  if (s.vt && V_ALIGN[s.vt]) css.push(`vertical-align:${V_ALIGN[s.vt]}`)
  if (s.tb === 3) css.push('white-space:pre-wrap')
  for (const [side, key] of [['top', 't'], ['right', 'r'], ['bottom', 'b'], ['left', 'l']] as const) {
    const b = s.bd?.[key]
    if (b?.s) css.push(`border-${side}:${b.s >= 8 ? 2 : 1}px ${b.s === 7 ? 'double' : b.s === 3 ? 'dotted' : b.s === 4 ? 'dashed' : 'solid'} ${b.cl?.rgb ?? '#000'}`)
  }
  return css.join(';')
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
