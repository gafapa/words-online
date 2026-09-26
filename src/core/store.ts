// Local, per-browser bookkeeping: document index and user identity.

import { clearDocument } from 'y-indexeddb'
import { kvDelete } from './idb'
import type { Access, LinkKeys } from './keys'
import { t } from './i18n'

const DOCS_KEY = 'words-online:docs'
const USER_KEY = 'words-online:user'
const COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#469990', '#f032e6', '#9a6324', '#800000', '#000075']

export type DocType = 'writer' | 'sheet' | 'draw' | 'diagram' | 'slides'
export const DOC_TYPES: DocType[] = ['writer', 'sheet', 'draw', 'diagram', 'slides']

export interface DocEntry {
  id: string
  type: DocType
  // Shared secret for the collaboration room; travels only inside share links.
  key: string
  title: string
  updated: number
  // Permission keys of protected documents (absent: legacy, full edit).
  keys?: LinkKeys
  // What this browser may do, from the keys it holds (absent means 'edit').
  access?: Access
}

export interface User {
  name: string
  color: string
}

export const dbName = (id: string) => `words-online:${id}`
export const commentsDbName = (id: string) => `words-online:${id}:comments`
export const signedLogKey = (id: string, channel: string) => `signed:${id}:${channel}`

export const newDocId = () => randomToken(9)
export const newDocKey = () => randomToken(18)

// crypto.randomUUID is not available on insecure (http) origins.
function randomToken(bytes: number): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function listDocs(): DocEntry[] {
  // Entries written before document types existed are word-processor documents.
  return read<DocEntry[]>(DOCS_KEY, [])
    .map((d) => (DOC_TYPES.includes(d.type) ? d : { ...d, type: 'writer' as const }))
    .sort((a, b) => b.updated - a.updated)
}

export function getDoc(id: string): DocEntry | undefined {
  return listDocs().find((d) => d.id === id)
}

export function saveDoc(entry: Omit<DocEntry, 'updated'>): void {
  const docs = listDocs().filter((d) => d.id !== entry.id)
  docs.push({ ...entry, updated: Date.now() })
  write(DOCS_KEY, docs)
}

export async function deleteDoc(id: string): Promise<void> {
  write(DOCS_KEY, listDocs().filter((d) => d.id !== id))
  await clearDocument(dbName(id))
  await clearDocument(commentsDbName(id))
  await kvDelete(signedLogKey(id, 'yjs'))
  await kvDelete(signedLogKey(id, 'cmt'))
}

export function loadUser(): User {
  const user = read<User | null>(USER_KEY, null)
  if (user) return user
  const created = {
    name: t('Guest {n}', { n: Math.floor(Math.random() * 900 + 100) }),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }
  saveUser(created)
  return created
}

export function saveUser(user: User): void {
  write(USER_KEY, user)
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage may be unavailable (private mode); ignore.
  }
}
