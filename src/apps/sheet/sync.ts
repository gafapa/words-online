// Collaboration for Univer over Yjs without a server.
//
// The shared state is a base workbook snapshot plus an append-only log of
// Univer mutations (Y.Array). Yjs gives every replica the same log order, so
// replaying the log over the base always yields the same workbook.
//
// Local mutations are applied immediately and appended to the log. When a
// concurrent remote mutation lands *before* local ones, the local state was
// built in a different order: if the reordered mutations commute (cell edits on
// different cells) the remote ones are simply applied; otherwise the workbook
// is rebuilt by replaying the log in its final order.
//
// Each entry records which mutations its author had seen, so a mutation that
// did not know about a concurrent row/column insertion or removal is shifted
// accordingly before being replayed (see transform.ts).
//
// Checkpoints keep loading fast: a checkpoint is a workbook snapshot plus the
// set of log entries it contains (a per-client counter clock). The state is
// always "latest checkpoint + uncovered entries in log order"; the latest
// checkpoint is the same on every replica (Y.Map conflict resolution).

import * as Y from 'yjs'
import { ICommandService, type IWorkbookData, type Univer } from '@univerjs/presets'
import type { FUniver } from '@univerjs/presets'
import { emptyWorkbook, WORKBOOK_ID } from './univer'
import { structuralOf, transform } from './transform'

const SET_RANGE_VALUES = 'sheet.mutation.set-range-values'
// How far back to look for concurrent structural changes.
const CONCURRENCY_WINDOW = 1000
// Entries replayed on load before a new checkpoint is written.
const CHECKPOINT_EVERY = 300

interface Checkpoint {
  snapshot: Partial<IWorkbookData>
  clock: Record<string, number>
}

interface LogEntry {
  id: string // `${clientId}-${counter}`
  m: string // mutation id
  p: string // JSON params
  k: Record<string, number> // highest counter seen per client when created
}

type Params = Record<string, unknown> & { subUnitId?: string; unitId?: string }

export interface SheetSyncOptions {
  doc: Y.Doc
  univer: Univer
  univerAPI: FUniver
  onRebuild?: () => void
}

function parseId(id: string): [string, number] {
  const [client, counter] = id.split('-')
  return [client, Number(counter)]
}

export class SheetSync {
  private readonly log: Y.Array<LogEntry>
  private readonly state: Y.Map<unknown>
  private readonly commands: ICommandService
  // Op ids in the order they were applied to the current workbook.
  private applied: string[] = []
  private appliedSet = new Set<string>()
  // Params actually executed for each op (after transformation).
  private effective = new Map<string, Params | null>()
  private known = new Map<string, number>()
  private applying = false
  private counter = 0
  private recalcTimer = 0
  // Entries executed (not covered by the checkpoint) since the last checkpoint.
  private uncovered = 0
  rebuilds = 0

  constructor(private readonly options: SheetSyncOptions) {
    const { doc, univer } = options
    this.log = doc.getArray<LogEntry>('sheet-ops')
    this.state = doc.getMap('sheet')
    this.commands = univer.__getInjector().get(ICommandService)

    this.rebuild()
    this.commands.onMutationExecutedForCollab((info, execOptions) => {
      if (this.applying || execOptions?.fromCollab || execOptions?.onlyLocal) return
      const params = info.params as Params | undefined
      // Only mutations of the shared workbook (not of internal editors) are replicated.
      if (params?.unitId !== WORKBOOK_ID) return
      const entry: LogEntry = {
        id: `${doc.clientID}-${++this.counter}`,
        m: info.id,
        p: JSON.stringify(params),
        k: Object.fromEntries(this.known),
      }
      this.effective.set(entry.id, JSON.parse(entry.p))
      this.markApplied(entry.id)
      this.uncovered++
      doc.transact(() => this.log.push([entry]), this)
      this.maybeCheckpoint()
    })
    this.log.observe((event) => {
      if (event.transaction.origin === this) return
      this.reconcile()
    })
    this.state.observe((event) => {
      if (event.transaction.origin === this) return
      if (event.keysChanged.has('base') || event.keysChanged.has('checkpoint')) this.rebuild()
    })
  }

  // Stores an initial snapshot (e.g. an imported file) as the shared base.
  static setBase(doc: Y.Doc, data: Partial<IWorkbookData>): void {
    doc.getMap('sheet').set('base', JSON.stringify({ ...data, id: WORKBOOK_ID }))
  }

  private checkpoint(): Checkpoint | null {
    const raw = this.state.get('checkpoint')
    if (typeof raw !== 'string') return null
    try {
      return JSON.parse(raw) as Checkpoint
    } catch {
      return null
    }
  }

  // Writes a checkpoint when this replica holds exactly the shared log order.
  private maybeCheckpoint(): void {
    if (this.uncovered < CHECKPOINT_EVERY) return
    const entries = this.log.toArray()
    if (entries.length !== this.applied.length || entries.some((e, i) => e.id !== this.applied[i])) return
    const workbook = this.options.univerAPI.getActiveWorkbook()
    if (!workbook) return
    const checkpoint: Checkpoint = { snapshot: workbook.save(), clock: Object.fromEntries(this.known) }
    this.options.doc.transact(() => this.state.set('checkpoint', JSON.stringify(checkpoint)), this)
    this.uncovered = 0
  }

  private base(): Partial<IWorkbookData> {
    const raw = this.state.get('base')
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw)
      } catch {
        // Corrupt base: fall back to an empty workbook.
      }
    }
    return emptyWorkbook()
  }

  private reconcile(): void {
    const entries = this.log.toArray()
    let prefix = 0
    while (prefix < this.applied.length && prefix < entries.length && entries[prefix].id === this.applied[prefix]) prefix++

    if (prefix === this.applied.length) {
      this.applyFrom(entries, prefix)
      return
    }
    // Our local order differs from the shared order from `prefix` on.
    const sharedTail = entries.slice(prefix)
    const tailIds = new Set(sharedTail.map((e) => e.id))
    if (this.applied.slice(prefix).every((id) => tailIds.has(id)) && commute(sharedTail)) {
      this.applyFrom(entries, prefix)
      this.applied = entries.map((e) => e.id)
      this.appliedSet = new Set(this.applied)
      return
    }
    this.rebuild()
  }

  // Applies, in log order, the entries from `start` that are not applied yet.
  private applyFrom(entries: LogEntry[], start: number): void {
    let changed = false
    this.applying = true
    try {
      for (let i = start; i < entries.length; i++) {
        if (this.appliedSet.has(entries[i].id)) continue
        this.execute(entries, i)
        this.markApplied(entries[i].id)
        this.uncovered++
        changed = true
      }
    } finally {
      this.applying = false
    }
    if (changed) {
      this.recalculate()
      this.maybeCheckpoint()
    }
  }

  private execute(entries: LogEntry[], index: number, run = true): void {
    const entry = entries[index]
    const params = this.transformed(entries, index)
    this.effective.set(entry.id, params)
    if (!params || !run) return
    try {
      this.commands.syncExecuteCommand(entry.m, params, { onlyLocal: true, fromCollab: true })
    } catch (err) {
      console.warn('Could not apply mutation', entry.m, err)
    }
  }

  // Params of an entry shifted through concurrent structural changes before it.
  private transformed(entries: LogEntry[], index: number): Params | null {
    const entry = entries[index]
    const params = JSON.parse(entry.p) as Params
    const [author] = parseId(entry.id)
    const concurrent = []
    for (let j = Math.max(0, index - CONCURRENCY_WINDOW); j < index; j++) {
      const other = entries[j]
      const [client, counter] = parseId(other.id)
      if (client === author || counter <= (entry.k?.[client] ?? 0)) continue
      const otherParams = this.effective.get(other.id)
      const s = otherParams && structuralOf(other.m, otherParams)
      if (s) concurrent.push(s)
    }
    return concurrent.length ? transform(entry.m, params, concurrent) : params
  }

  private markApplied(id: string): void {
    this.applied.push(id)
    this.appliedSet.add(id)
    const [client, counter] = parseId(id)
    if (counter > (this.known.get(client) ?? 0)) this.known.set(client, counter)
  }

  // Remote mutations do not mark formulas dirty, so recalculate explicitly.
  private recalculate(): void {
    clearTimeout(this.recalcTimer)
    this.recalcTimer = window.setTimeout(() => this.options.univerAPI.getFormula().executeCalculation(), 50)
  }

  // Recreates the workbook from the latest checkpoint (or the base snapshot)
  // and the log entries it does not cover.
  private rebuild(): void {
    const { univerAPI } = this.options
    this.rebuilds++
    const active = univerAPI.getActiveWorkbook()
    const activeSheet = active?.getActiveSheet()?.getSheetId()
    this.applying = true
    try {
      if (active) univerAPI.disposeUnit(WORKBOOK_ID)
      const checkpoint = this.checkpoint()
      univerAPI.createWorkbook(checkpoint ? { ...checkpoint.snapshot, id: WORKBOOK_ID } : this.base())
      this.applied = []
      this.appliedSet = new Set()
      this.effective = new Map()
      this.uncovered = 0
      const entries = this.log.toArray()
      for (let i = 0; i < entries.length; i++) {
        const [client, counter] = parseId(entries[i].id)
        const covered = !!checkpoint && counter <= (checkpoint.clock[client] ?? 0)
        // Covered entries are already in the snapshot; their params are still
        // tracked so later concurrent entries transform consistently.
        this.execute(entries, i, !covered)
        this.markApplied(entries[i].id)
        if (!covered) this.uncovered++
      }
      if (activeSheet) univerAPI.getActiveWorkbook()?.getSheetBySheetId(activeSheet)?.activate()
    } finally {
      this.applying = false
    }
    this.recalculate()
    this.options.onRebuild?.()
  }
}

// True when the order of these entries does not matter: value/style edits on
// pairwise-distinct cells.
function commute(entries: LogEntry[]): boolean {
  const cells = new Set<string>()
  for (const e of entries) {
    if (e.m !== SET_RANGE_VALUES) return false
    const params = JSON.parse(e.p) as { subUnitId: string; cellValue?: Record<string, Record<string, unknown>> }
    for (const [row, cols] of Object.entries(params.cellValue ?? {})) {
      for (const col of Object.keys(cols ?? {})) {
        const key = `${params.subUnitId}:${row}:${col}`
        if (cells.has(key)) return false
        cells.add(key)
      }
    }
  }
  return true
}
