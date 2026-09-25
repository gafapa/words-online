// Spreadsheet app: Univer inside the common shell, synced over Yjs, with the
// suite's menus, file actions, collaborator selections and printing.

import { ICommandService, type FUniver, type IDisposable, type IRange, type IWorkbookData } from '@univerjs/presets'
import { appInfo } from '../registry'
import { homePath, newDocPath } from '../../core/router'
import type { Session } from '../../core/session'
import { setupChrome } from '../../ui/chrome'
import { renderShell } from '../../ui/shell'
import { t } from '../../core/i18n'
import { documentMenuItems } from '../../ui/versions'
import { createMenuBar, el, shortcutLabel, showDialog, toast } from '../../ui/widgets'
import { exportSheetFile, SHEET_ACCEPT, type SheetExportFormat } from './formats'
import { renderPrintHtml } from './print'
import { SheetSync } from './sync'
import { createSpreadsheet } from './univer'

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
const mod = (k: string) => (isMac ? `⌘${k}` : `Ctrl+${k}`)

// Live workbook access of each open session (for hand in).
export const sheetHandles = new WeakMap<Session, { snapshot: () => IWorkbookData; activeSheetId: () => string }>()

export async function mountSheet(session: Session, root: HTMLElement): Promise<void> {
  const info = appInfo('sheet')
  const shell = renderShell(info, root)
  shell.toolbar.hidden = true // Univer brings its own ribbon
  shell.statusbar.hidden = true
  setupChrome(session, info.untitled)

  const container = el('div', { class: 'sheet-host' })
  const printArea = el('div', { class: 'sheet-print' })
  const fileInput = el('input', { type: 'file', accept: SHEET_ACCEPT, hidden: true })
  shell.main.append(container)
  document.body.append(printArea, fileInput)

  const { univer, univerAPI } = await createSpreadsheet(container)
  // Declared first: the initial rebuild runs inside the SheetSync constructor.
  let presence: SelectionPresence | undefined
  // Viewers and commenters get a read-only workbook (again after every rebuild).
  const applyAccess = () => {
    if (!session.canEdit) univerAPI.getActiveWorkbook()?.setEditable(false)
  }
  const sync = new SheetSync({
    doc: session.doc,
    univer,
    univerAPI,
    onRebuild: () => {
      applyAccess()
      presence?.render()
    },
  })
  presence = new SelectionPresence(session, univerAPI, univer.__getInjector().get(ICommandService))
  applyAccess()
  if (!session.canEdit) {
    // Commands and local mutations are refused (operations such as selecting,
    // scrolling or copying still work); remote changes arrive as collab mutations.
    univer.__getInjector().get(ICommandService).beforeCommandExecuted((info, options) => {
      if (options?.fromCollab || options?.onlyLocal || /\.operation\.|copy|zoom/.test(info.id)) return
      if (!/\.(command|mutation)\./.test(info.id)) return
      toast(t('This spreadsheet is view only'))
      throw new Error(t('This spreadsheet is view only'))
    })
  }

  const meta = session.doc.getMap<unknown>('meta')
  const title = () => String(meta.get('title') || info.untitled)
  const snapshot = () => univerAPI.getActiveWorkbook()!.save() as IWorkbookData
  sheetHandles.set(session, { snapshot, activeSheetId: () => univerAPI.getActiveWorkbook()!.getActiveSheet().getSheetId() })

  // ---------- File actions ----------

  const download = async (format: SheetExportFormat) => {
    try {
      const workbook = univerAPI.getActiveWorkbook()!
      const blob = await exportSheetFile(format, snapshot(), workbook.getActiveSheet().getSheetId())
      const a = el('a', { href: URL.createObjectURL(blob), download: `${title().replace(/[\\/:*?"<>|]+/g, '_')}.${format}` })
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    } catch (err) {
      toast(t('Download failed: {message}', { message: (err as Error).message }))
    }
  }

  const print = () => {
    const workbook = univerAPI.getActiveWorkbook()!
    const sheet = workbook.getActiveSheet()
    printArea.innerHTML = renderPrintHtml(snapshot(), sheet.getSheetId(), (r, c) => sheet.getRange(r, c).getDisplayValue())
    window.print()
    printArea.innerHTML = ''
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file) return
    try {
      toast(t('Opening…'))
      const { importFile } = await import('./index')
      location.href = await importFile(file)
    } catch (err) {
      toast(t('Could not open the file: {message}', { message: (err as Error).message }))
    }
  })

  session.hooks.print = print

  // ---------- Menus ----------

  createMenuBar(shell.menubar, [
    {
      label: t('File'),
      items: [
        { label: t('New spreadsheet'), run: () => window.open(newDocPath('sheet'), '_blank') },
        { label: t('Open file…'), shortcut: mod('O'), run: () => fileInput.click() },
        { label: t('All documents'), run: () => (location.href = homePath()) },
        '-',
        { label: t('Share…'), run: () => document.getElementById('btn-share')!.click() },
        {
          label: t('Download'),
          submenu: [
            { label: t('Microsoft Excel (.xlsx)'), run: () => download('xlsx') },
            { label: t('OpenDocument spreadsheet (.ods)'), run: () => download('ods') },
            { label: t('Comma-separated values (.csv, current sheet)'), run: () => download('csv') },
            { label: t('PDF (via Print, current sheet)'), run: print },
          ],
        },
        '-',
        ...documentMenuItems(session),
        '-',
        { label: t('Print'), shortcut: mod('P'), run: print },
      ],
    },
    {
      label: t('Edit'),
      items: [
        { label: t('Undo'), shortcut: mod('Z'), run: () => univerAPI.undo() },
        { label: t('Redo'), shortcut: mod('Y'), run: () => univerAPI.redo() },
        '-',
        { label: t('Find and replace'), shortcut: mod('F'), run: () => univerAPI.executeCommand('ui.operation.open-find-dialog') },
      ],
    },
    {
      label: t('Help'),
      items: [{ label: t('Keyboard shortcuts'), run: shortcuts }],
    },
  ])

  document.addEventListener(
    'keydown',
    (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'p') {
        e.preventDefault()
        e.stopPropagation()
        print()
      } else if (key === 'o') {
        e.preventDefault()
        fileInput.click()
      } else if (key === 's') {
        e.preventDefault()
        toast(t('All changes are saved automatically in this browser'))
      }
    },
    true,
  )

  // ---------- Save indicator ----------

  const saveState = document.getElementById('save-state')!
  let saveTimer = 0
  session.doc.on('update', () => {
    saveState.textContent = t('Saving…')
    clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => (saveState.textContent = t('Saved in this browser')), 600)
  })
  saveState.textContent = t('Saved in this browser')

  // Handles for automated browser tests in development builds only.
  if (import.meta.env.DEV) Object.assign(window, { univerAPI, sheetSync: sync, awareness: session.awareness })
}

// Shows where collaborators are: their selection is outlined in their color.
class SelectionPresence {
  private highlights: IDisposable[] = []

  constructor(
    private readonly session: Session,
    private readonly univerAPI: FUniver,
    commands: ICommandService,
  ) {
    // Selection operations are observed directly: facade events do not survive workbook rebuilds.
    commands.onCommandExecuted((info) => {
      if (info.id === 'sheet.operation.set-selections') {
        const params = info.params as { subUnitId?: string; selections?: { range: IRange }[] }
        const range = params.selections?.[params.selections.length - 1]?.range
        if (range && params.subUnitId) session.awareness.setLocalStateField('sheetSelection', { sheetId: params.subUnitId, range: pickRange(range) })
      } else if (info.id === 'sheet.operation.set-worksheet-active') {
        this.render()
      }
    })
    session.awareness.on('change', () => this.render())
  }

  render(): void {
    this.highlights.forEach((h) => h.dispose())
    this.highlights = []
    const workbook = this.univerAPI.getActiveWorkbook()
    const sheet = workbook?.getActiveSheet()
    if (!sheet) return
    for (const [clientId, state] of this.session.awareness.getStates()) {
      if (clientId === this.session.doc.clientID || !state.sheetSelection || !state.user) continue
      const { sheetId, range } = state.sheetSelection as { sheetId: string; range: IRange }
      if (sheetId !== sheet.getSheetId()) continue
      try {
        const fRange = sheet.getRange(range.startRow, range.startColumn, range.endRow - range.startRow + 1, range.endColumn - range.startColumn + 1)
        this.highlights.push(fRange.highlight({ stroke: state.user.color, strokeWidth: 2, fill: hexToRgba(state.user.color, 0.08) }))
      } catch {
        // Range outside the current sheet bounds: ignore.
      }
    }
  }
}

function pickRange(r: IRange): IRange {
  return { startRow: r.startRow, endRow: r.endRow, startColumn: r.startColumn, endColumn: r.endColumn }
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

async function shortcuts(): Promise<void> {
  const rows: [string, string][] = [
    [t('Edit cell'), 'F2 / Enter'],
    [t('Confirm and move down / right'), 'Enter / Tab'],
    [t('Line break in cell'), 'Alt+Enter'],
    [t('Bold / Italic / Underline'), `${mod('B')} / ${mod('I')} / ${mod('U')}`],
    [t('Undo / redo'), `${mod('Z')} / ${mod('Y')}`],
    [t('Copy / cut / paste'), `${mod('C')} / ${mod('X')} / ${mod('V')}`],
    [t('Find and replace'), `${mod('F')} / ${mod('H')}`],
    [t('Select all'), mod('A')],
    [t('Jump to edge of data'), `${mod('Arrow')}`],
    [t('Extend selection'), 'Shift+Arrow'],
    [t('Open file / print'), `${mod('O')} / ${mod('P')}`],
  ]
  const table = el('table', { class: 'shortcuts' })
  for (const [label, keys] of rows) table.append(el('tr', {}, el('td', { textContent: label }), el('td', {}, el('kbd', { textContent: shortcutLabel(keys) }))))
  await showDialog(t('Keyboard shortcuts'), table, [{ label: t('Close'), value: 'ok', primary: true }], true)
}
