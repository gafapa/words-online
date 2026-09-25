// Apps of the suite. Each app is loaded with a dynamic import() only when opened.

import type { Session } from '../core/session'
import type { DocType } from '../core/store'

export interface AppModule {
  mount(session: Session): void | Promise<void>
  // File types the app can open (extensions, for <input accept>).
  accept: string
  // Imports a file into a new local document and returns its path.
  importFile(file: File): Promise<string>
}

export interface AppInfo {
  type: DocType
  name: string // e.g. "Document"
  newLabel: string
  untitled: string
  letter: string
  color: string
  load?: () => Promise<AppModule>
}

export const APPS: AppInfo[] = [
  {
    type: 'writer',
    name: 'Document',
    newLabel: 'New document',
    untitled: 'Untitled document',
    letter: 'W',
    color: '#1a73e8',
    load: () => import('./writer'),
  },
  {
    type: 'sheet',
    name: 'Spreadsheet',
    newLabel: 'New spreadsheet',
    untitled: 'Untitled spreadsheet',
    letter: 'S',
    color: '#188038',
    load: () => import('./sheet'),
  },
  { type: 'draw', name: 'Drawing', newLabel: 'New drawing', untitled: 'Untitled drawing', letter: 'D', color: '#e8710a' },
  { type: 'diagram', name: 'Diagram', newLabel: 'New diagram', untitled: 'Untitled diagram', letter: 'G', color: '#9334e6' },
]

export function appInfo(type: DocType): AppInfo {
  return APPS.find((a) => a.type === type) ?? APPS[0]
}

// Finds the app that opens a file, by extension.
export async function appForFile(file: File): Promise<{ info: AppInfo; module: AppModule } | null> {
  const ext = `.${file.name.split('.').pop()?.toLowerCase()}`
  for (const info of APPS) {
    if (!info.load) continue
    const module = await info.load()
    if (module.accept.split(',').includes(ext)) return { info, module }
  }
  return null
}
