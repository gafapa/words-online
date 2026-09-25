// Hash-based routing, so the suite works on any static host:
//   #app=<type>&doc=<id>&key=<secret>   open a document
//   (empty)                              home screen
// The fragment is never sent to any server, which keeps the key private.

import { DOC_TYPES, getDoc, newDocId, newDocKey, type DocType } from './store'

export type Route = { kind: 'home' } | { kind: 'doc'; type: DocType; id: string; key: string }

export function parseRoute(hash = location.hash): Route {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const id = params.get('doc')
  if (!id) return { kind: 'home' }
  const known = getDoc(id)
  const app = params.get('app') as DocType | null
  const type = app && DOC_TYPES.includes(app) ? app : (known?.type ?? 'writer')
  // A link without a key (old or truncated) reuses the local key or starts a new room.
  const key = params.get('key') || known?.key || newDocKey()
  return { kind: 'doc', type, id, key }
}

// Path (with the current search string, e.g. ?relays=…) for a document.
export function docPath(type: DocType, id: string, key: string): string {
  return `${location.pathname}${location.search}#app=${type}&doc=${id}&key=${key}`
}

export function newDocPath(type: DocType): string {
  return docPath(type, newDocId(), newDocKey())
}

export function homePath(): string {
  return `${location.pathname}${location.search}#`
}

export function absoluteUrl(path: string): string {
  return new URL(path, location.href).href
}
