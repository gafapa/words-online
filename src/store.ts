// Local, per-browser bookkeeping: document index and user identity.

import { clearDocument } from 'y-indexeddb'

const DOCS_KEY = 'words-online:docs'
const USER_KEY = 'words-online:user'
const COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#469990', '#f032e6', '#9a6324', '#800000', '#000075']

export interface DocEntry {
  id: string
  title: string
  updated: number
}

export interface User {
  name: string
  color: string
}

export const dbName = (id: string) => `words-online:${id}`

// crypto.randomUUID is not available on insecure (http) LAN origins.
export function newDocId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_')
}

export function listDocs(): DocEntry[] {
  return read<DocEntry[]>(DOCS_KEY, []).sort((a, b) => b.updated - a.updated)
}

export function touchDoc(id: string, title: string): void {
  const docs = listDocs().filter((d) => d.id !== id)
  docs.push({ id, title, updated: Date.now() })
  write(DOCS_KEY, docs)
}

export async function deleteDoc(id: string): Promise<void> {
  write(DOCS_KEY, listDocs().filter((d) => d.id !== id))
  await clearDocument(dbName(id))
}

export function loadUser(): User {
  const user = read<User | null>(USER_KEY, null)
  if (user) return user
  const created = {
    name: `Guest ${Math.floor(Math.random() * 900 + 100)}`,
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
