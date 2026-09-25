// Entry points for opening and saving documents in external formats.
// Converters are loaded on demand to keep the initial bundle small.

import { generateJSON, type JSONContent } from '@tiptap/core'
import { allExtensions } from '../editor/extensions'
import { DEFAULT_PAGE, type DocumentData } from './types'
import { t } from '../../../core/i18n'

export type ExportFormat = 'docx' | 'odt' | 'html' | 'txt'

export const OPEN_ACCEPT = '.docx,.odt,.html,.htm,.txt,.md'

export type Imported = Omit<DocumentData, 'title'>

export async function importFile(file: File): Promise<Imported> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'docx') return (await import('./docx-import')).importDocx(await file.arrayBuffer())
  if (ext === 'odt') return (await import('./odt-import')).importOdt(await file.arrayBuffer())
  if (ext === 'doc') throw new Error(t('Legacy .doc files are not supported; save them as .docx first'))
  const text = await file.text()
  const body: JSONContent =
    ext === 'html' || ext === 'htm'
      ? generateJSON(text, allExtensions())
      : {
          type: 'doc',
          content: text.split(/\r?\n/).map((line) => (line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' })),
        }
  return { body, header: null, footer: null, page: DEFAULT_PAGE }
}

export async function exportFile(format: ExportFormat, data: DocumentData, html: string, text: string): Promise<Blob> {
  switch (format) {
    case 'docx':
      return (await import('./docx-export')).exportDocx(data)
    case 'odt':
      return (await import('./odt-export')).exportOdt(data)
    case 'html': {
      const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(data.title)}</title></head><body>${html}</body></html>`
      return new Blob([doc], { type: 'text/html' })
    }
    case 'txt':
      return new Blob([text], { type: 'text/plain' })
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
