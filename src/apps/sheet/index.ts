// Entry point of the spreadsheet, loaded on demand by the app registry.

import type { Session, SubmitFile } from '../../core/session'
import { createLocalDocument } from '../../core/session'
import { mountSheet, sheetHandles } from './app'
import { exportSheetFile, importSheetFile, SHEET_ACCEPT } from './formats'
import type { IWorkbookData } from '@univerjs/presets'
import { SheetSync } from './sync'
import { t } from '../../core/i18n'
import './sheet.css'

export const accept = SHEET_ACCEPT

export async function mount(session: Session): Promise<void> {
  await mountSheet(session, document.getElementById('root')!)
}

// Imports a spreadsheet file into a new local document; returns its path.
export async function importFile(file: File): Promise<string> {
  const data = await importSheetFile(file)
  const title = file.name.replace(/\.[^.]+$/, '')
  return createLocalDocument('sheet', title, (doc) => SheetSync.setBase(doc, data))
}

// Creates a new local document from a workbook snapshot (templates); returns its path.
export function createFromWorkbook(title: string, data: Partial<IWorkbookData>): Promise<string> {
  return createLocalDocument('sheet', title, (doc) => SheetSync.setBase(doc, data))
}

// "Hand in": the workbook as .ods and .xlsx.
export async function submitFiles(session: Session): Promise<SubmitFile[]> {
  const handle = sheetHandles.get(session)
  if (!handle) throw new Error(t('The spreadsheet is still loading'))
  const title = String(session.doc.getMap('meta').get('title') || t('Untitled spreadsheet'))
  const data = handle.snapshot()
  return [
    { name: `${title}.ods`, blob: await exportSheetFile('ods', data) },
    { name: `${title}.xlsx`, blob: await exportSheetFile('xlsx', data) },
  ]
}
