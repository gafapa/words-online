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
  // File extensions the app opens; declared here so the home screen can offer
  // them without loading the app.
  accept?: string
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
    accept: '.docx,.odt,.html,.htm,.txt,.md',
    load: () => import('./writer'),
  },
  {
    type: 'sheet',
    name: 'Spreadsheet',
    newLabel: 'New spreadsheet',
    untitled: 'Untitled spreadsheet',
    letter: 'S',
    color: '#188038',
    accept: '.xlsx,.ods,.csv,.tsv',
    load: () => import('./sheet'),
  },
  { type: 'draw', name: 'Drawing', newLabel: 'New drawing', untitled: 'Untitled drawing', letter: 'D', color: '#e8710a' },
  {
    type: 'diagram',
    name: 'Diagram',
    newLabel: 'New diagram',
    untitled: 'Untitled diagram',
    letter: 'G',
    color: '#9334e6',
    accept: '.drawio,.xml,.vsdx',
    load: () => import('./diagram'),
  },
]

export function appInfo(type: DocType): AppInfo {
  return APPS.find((a) => a.type === type) ?? APPS[0]
}

export const ALL_ACCEPT = APPS.filter((a) => a.load && a.accept).map((a) => a.accept).join(',')

// Finds the app that opens a file, by extension, and loads only that app.
export async function appForFile(file: File): Promise<{ info: AppInfo; module: AppModule } | null> {
  const ext = `.${file.name.split('.').pop()?.toLowerCase()}`
  const info = APPS.find((a) => a.load && a.accept?.split(',').includes(ext))
  return info ? { info, module: await info.load!() } : null
}
