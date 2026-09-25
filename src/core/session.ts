// A document session: local persistence, presence and the peer-to-peer room.

import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { Awareness, removeAwarenessStates } from 'y-protocols/awareness'
import { RoomProvider } from './network'
import { absoluteUrl, docPath } from './router'
import * as store from './store'

export interface Session {
  type: store.DocType
  doc: Y.Doc
  awareness: Awareness
  room: RoomProvider
  docId: string
  docKey: string
  user: store.User
  shareUrl: () => string
}

export async function openSession(type: store.DocType, docId: string, docKey: string): Promise<Session> {
  const doc = new Y.Doc()
  const persistence = new IndexeddbPersistence(store.dbName(docId), doc)
  const awareness = new Awareness(doc)
  const user = store.loadUser()
  awareness.setLocalStateField('user', { name: user.name, color: user.color })
  await persistence.whenSynced

  const meta = doc.getMap<unknown>('meta')
  const saveEntry = () => store.saveDoc({ id: docId, key: docKey, type, title: String(meta.get('title') ?? '') })
  saveEntry()
  doc.on('update', saveEntry)

  // Optional custom relays for private deployments: ?relays=wss://a,wss://b
  const relays = new URLSearchParams(location.search).get('relays')?.split(',').filter(Boolean)
  const room = new RoomProvider(doc, awareness, { roomId: docId, password: docKey, relays })
  window.addEventListener('beforeunload', () => {
    removeAwarenessStates(awareness, [doc.clientID], 'unload')
    room.destroy()
  })

  return { type, doc, awareness, room, docId, docKey, user, shareUrl: () => absoluteUrl(docPath(type, docId, docKey)) }
}

// Creates a new local document from prepared Yjs content and returns its path.
export async function createLocalDocument(type: store.DocType, title: string, fill: (doc: Y.Doc) => void): Promise<string> {
  const id = store.newDocId()
  const key = store.newDocKey()
  const doc = new Y.Doc()
  fill(doc)
  doc.getMap<unknown>('meta').set('title', title)
  // y-indexeddb stores the full current state when it first syncs.
  const persistence = new IndexeddbPersistence(store.dbName(id), doc)
  await persistence.whenSynced
  await persistence.destroy()
  store.saveDoc({ id, key, type, title })
  return docPath(type, id, key)
}
