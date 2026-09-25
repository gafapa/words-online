// Entry point of the spreadsheet, loaded on demand by the app registry.

import type { Session } from '../../core/session'
import { createLocalDocument } from '../../core/session'
import { mountSheet } from './app'
import { importSheetFile, SHEET_ACCEPT } from './formats'
import { SheetSync } from './sync'
import './sheet.css'

export const accept = SHEET_ACCEPT

export function mount(session: Session): void {
  mountSheet(session, document.getElementById('root')!)
}

// Imports a spreadsheet file into a new local document; returns its path.
export async function importFile(file: File): Promise<string> {
  const data = await importSheetFile(file)
  const title = file.name.replace(/\.[^.]+$/, '')
  return createLocalDocument('sheet', title, (doc) => SheetSync.setBase(doc, data))
}
