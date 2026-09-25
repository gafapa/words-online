// Intention preservation for concurrent structural edits.
//
// A mutation created without knowing about a concurrent row/column insertion
// or removal addresses cells in the old coordinates. Before replaying it, its
// coordinates are shifted through those structural changes (a light form of
// operational transformation). Mutation types not listed here pass through.

interface Structural {
  sheet: string
  axis: 'row' | 'col'
  kind: 'insert' | 'remove'
  start: number
  count: number
}

interface Range {
  startRow: number
  endRow: number
  startColumn: number
  endColumn: number
  [key: string]: unknown
}

type Params = Record<string, unknown> & { subUnitId?: string }

const STRUCTURAL: Record<string, Pick<Structural, 'axis' | 'kind'>> = {
  'sheet.mutation.insert-row': { axis: 'row', kind: 'insert' },
  'sheet.mutation.remove-rows': { axis: 'row', kind: 'remove' },
  'sheet.mutation.insert-col': { axis: 'col', kind: 'insert' },
  'sheet.mutation.remove-col': { axis: 'col', kind: 'remove' },
}

// Mutations whose `ranges` array addresses cells.
const RANGES_MUTATIONS = new Set([
  'sheet.mutation.add-worksheet-merge',
  'sheet.mutation.remove-worksheet-merge',
  'sheet.mutation.set-worksheet-col-width',
  'sheet.mutation.set-worksheet-row-height',
])

export function structuralOf(mutation: string, params: Params): Structural | null {
  const kind = STRUCTURAL[mutation]
  const range = params.range as Range | undefined
  if (!kind || !range || !params.subUnitId) return null
  const [start, end] = kind.axis === 'row' ? [range.startRow, range.endRow] : [range.startColumn, range.endColumn]
  return { sheet: params.subUnitId, ...kind, start, count: end - start + 1 }
}

// Maps an index through one structural change; null when it was removed.
function mapIndex(i: number, s: Structural): number | null {
  if (s.kind === 'insert') return i >= s.start ? i + s.count : i
  if (i < s.start) return i
  if (i < s.start + s.count) return null
  return i - s.count
}

// Maps an inclusive span; removed parts are dropped, null when nothing remains.
function mapSpan(start: number, end: number, s: Structural): [number, number] | null {
  if (s.kind === 'insert') {
    if (end < s.start) return [start, end]
    if (start >= s.start) return [start + s.count, end + s.count]
    return [start, end + s.count] // insertion inside the span grows it
  }
  const removedEnd = s.start + s.count - 1
  if (end < s.start) return [start, end]
  if (start > removedEnd) return [start - s.count, end - s.count]
  const keptStart = start < s.start ? start : s.start
  const keptEnd = end > removedEnd ? end - s.count : s.start - 1
  return keptEnd >= keptStart ? [keptStart, keptEnd] : null
}

function mapRange(range: Range, s: Structural): Range | null {
  if (s.axis === 'row') {
    const rows = mapSpan(range.startRow, range.endRow, s)
    return rows && { ...range, startRow: rows[0], endRow: rows[1] }
  }
  const cols = mapSpan(range.startColumn, range.endColumn, s)
  return cols && { ...range, startColumn: cols[0], endColumn: cols[1] }
}

// Returns transformed params, or null when the mutation no longer applies.
export function transform(mutation: string, params: Params, concurrent: Structural[]): Params | null {
  const changes = concurrent.filter((c) => c.sheet === params.subUnitId)
  if (!changes.length) return params

  if (mutation === 'sheet.mutation.set-range-values') {
    const cellValue = (params.cellValue ?? {}) as Record<string, Record<string, unknown>>
    const next: Record<number, Record<number, unknown>> = {}
    for (const [r, cols] of Object.entries(cellValue)) {
      for (const [c, cell] of Object.entries(cols ?? {})) {
        let row: number | null = Number(r)
        let col: number | null = Number(c)
        for (const s of changes) {
          if (row === null || col === null) break
          if (s.axis === 'row') row = mapIndex(row, s)
          else col = mapIndex(col, s)
        }
        if (row === null || col === null) continue
        ;(next[row] ??= {})[col] = cell
      }
    }
    return Object.keys(next).length ? { ...params, cellValue: next } : null
  }

  if (STRUCTURAL[mutation]) {
    let range: Range | null = params.range as Range
    for (const s of changes) {
      if (!range) break
      // Two insertions at the same place both happen; the later one lands before.
      range = mapRange(range, s)
    }
    return range ? { ...params, range } : null
  }

  if (RANGES_MUTATIONS.has(mutation)) {
    const ranges = ((params.ranges ?? []) as Range[])
      .map((r) => changes.reduce<Range | null>((acc, s) => (acc ? mapRange(acc, s) : null), r))
      .filter((r): r is Range => r !== null)
    return ranges.length ? { ...params, ranges } : null
  }

  return params
}
