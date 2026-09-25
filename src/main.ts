// Bootstrap: resolves the document from the URL, opens local storage and the
// peer-to-peer room, then loads the editor on demand.

import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { Awareness, removeAwarenessStates } from 'y-protocols/awareness'
import './style.css'
import { RoomProvider } from './network'
import * as store from './store'
import type { Session } from './ui/chrome'

// URL fragment: #doc=<id>&key=<secret>. The fragment never reaches any server.
const params = new URLSearchParams(location.hash.slice(1))
const docId = params.get('doc') || store.newDocId()
const docKey = params.get('key') || store.getDoc(docId)?.key || store.newDocKey()
// Optional custom relays for private deployments: ?relays=wss://a,wss://b
const relays = new URLSearchParams(location.search).get('relays')?.split(',').filter(Boolean)

const docPath = (id: string, key: string) => `${location.pathname}${location.search}#doc=${id}&key=${key}`
history.replaceState(null, '', docPath(docId, docKey))
// Switching documents is done through the URL; a clean reload keeps state simple.
window.addEventListener('hashchange', () => location.reload())

const doc = new Y.Doc()
const persistence = new IndexeddbPersistence(store.dbName(docId), doc)
const awareness = new Awareness(doc)
const user = store.loadUser()
awareness.setLocalStateField('user', { name: user.name, color: user.color })

await persistence.whenSynced
const meta = doc.getMap<unknown>('meta')
const saveEntry = () => store.saveDoc({ id: docId, key: docKey, title: String(meta.get('title') ?? '') })
saveEntry()
doc.on('update', saveEntry)

const room = new RoomProvider(doc, awareness, { roomId: docId, password: docKey, relays })
window.addEventListener('beforeunload', () => {
  removeAwarenessStates(awareness, [doc.clientID], 'unload')
  room.destroy()
})

const session: Session = {
  doc,
  awareness,
  room,
  docId,
  docKey,
  user,
  shareUrl: () => new URL(docPath(docId, docKey), location.href).href,
}

const { mountWriter } = await import('./writer/app')
mountWriter(session, { docPath })
