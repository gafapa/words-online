// Document model shared by the editor and the file converters.
// The body, header and footer are ProseMirror JSON documents that follow the
// schema in src/editor/extensions.ts.

import type { JSONContent } from '@tiptap/core'

export type PageSize = 'A4' | 'A5' | 'Letter' | 'Legal'

export interface PageSettings {
  size: PageSize
  orientation: 'portrait' | 'landscape'
  // Margins in millimetres.
  margins: { top: number; right: number; bottom: number; left: number }
}

export interface DocumentData {
  title: string
  // Comment ranges are `commentRange` marks (attrs.id) on the body's inline content.
  body: JSONContent
  header: JSONContent | null
  footer: JSONContent | null
  page: PageSettings
  comments?: CommentData[]
}

// A comment or, with parentId, a reply (replies have no range of their own).
export interface CommentData {
  id: string
  parentId?: string
  author: string
  // Milliseconds since the epoch; 0 when unknown.
  date: number
  text: string
  resolved?: boolean
}

// Portrait width × height in millimetres.
export const PAGE_SIZES_MM: Record<PageSize, [number, number]> = {
  A4: [210, 297],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
}

export const DEFAULT_PAGE: PageSettings = {
  size: 'A4',
  orientation: 'portrait',
  margins: { top: 25, right: 25, bottom: 25, left: 25 },
}

export function pageDimensionsMm(page: PageSettings): { width: number; height: number } {
  const [w, h] = PAGE_SIZES_MM[page.size] ?? PAGE_SIZES_MM.A4
  return page.orientation === 'landscape' ? { width: h, height: w } : { width: w, height: h }
}

export const DEFAULT_FONT = 'Calibri'
export const DEFAULT_FONT_SIZE_PT = 11
// Heading font sizes in points (level 1..6), plus named paragraph styles.
export const HEADING_SIZES_PT = [20, 16, 14, 12, 11, 11]
export const TITLE_SIZE_PT = 26
export const SUBTITLE_SIZE_PT = 15
export type ImportedDocument = Omit<DocumentData, 'title'>
