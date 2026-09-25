// Entry points for opening and saving documents in external formats.

import type { Op } from 'quill'
import { linesToOps } from './model'

export type ExportFormat = 'docx' | 'odt' | 'html' | 'txt'

export const OPEN_ACCEPT = '.docx,.odt,.html,.htm,.txt,.md'

// Word/ODT become Delta ops directly; HTML and text go through Quill's clipboard.
export type Imported = { ops: Op[] } | { html: string } | { text: string }

export async function importFile(file: File): Promise<Imported> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'docx') {
    const { importDocx } = await import('./docx-import')
    return { ops: linesToOps(await importDocx(await file.arrayBuffer())) }
  }
  if (ext === 'odt') {
    const { importOdt } = await import('./odt-import')
    return { ops: linesToOps(await importOdt(await file.arrayBuffer())) }
  }
  if (ext === 'doc') throw new Error('Legacy .doc files are not supported; save them as .docx first')
  const text = await file.text()
  return ext === 'html' || ext === 'htm' ? { html: text } : { text }
}

export async function exportFile(format: ExportFormat, ops: Op[], html: string, text: string, title: string): Promise<Blob> {
  switch (format) {
    case 'docx': {
      const { exportDocx } = await import('./docx')
      return exportDocx(ops, title)
    }
    case 'odt': {
      const { exportOdt } = await import('./odt')
      return exportOdt(ops, title)
    }
    case 'html': {
      const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${html}</body></html>`
      return new Blob([doc], { type: 'text/html' })
    }
    case 'txt':
      return new Blob([text], { type: 'text/plain' })
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
