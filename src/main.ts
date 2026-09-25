import * as Y from 'yjs'
import Quill from 'quill'
import QuillCursors from 'quill-cursors'
import { QuillBinding } from 'y-quill'
import { IndexeddbPersistence } from 'y-indexeddb'
import { Awareness, removeAwarenessStates } from 'y-protocols/awareness'
import QRCode from 'qrcode'
import 'quill/dist/quill.snow.css'
import './style.css'
import { RoomProvider } from './network'
import { exportFile, importFile, OPEN_ACCEPT, type ExportFormat } from './formats'
import * as store from './store'

Quill.register('modules/cursors', QuillCursors)

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

// ---------- Document bootstrap ----------

// URL fragment: #doc=<id>&key=<secret>. The fragment never reaches any server.
const params = new URLSearchParams(location.hash.slice(1))
const docId = params.get('doc') || store.newDocId()
const docKey = params.get('key') || store.getDoc(docId)?.key || store.newDocKey()
history.replaceState(null, '', docUrl(docId, docKey))
// Switching documents is done through the URL; a clean reload keeps state simple.
window.addEventListener('hashchange', () => location.reload())

// Optional custom relays for private deployments: ?relays=wss://a,wss://b
const relays = new URLSearchParams(location.search).get('relays')?.split(',').filter(Boolean)

const doc = new Y.Doc()
const persistence = new IndexeddbPersistence(store.dbName(docId), doc)
const awareness = new Awareness(doc)
const meta = doc.getMap<string>('meta')
let room: RoomProvider | null = null

const quill = new Quill('#editor', {
  theme: 'snow',
  placeholder: 'Start writing…',
  modules: {
    cursors: { transformOnTextChange: true },
    history: { userOnly: true },
    toolbar: [
      [{ header: [1, 2, 3, false] }, { font: [] }, { size: ['small', false, 'large', 'huge'] }],
      ['bold', 'italic', 'underline', 'strike', { script: 'sub' }, { script: 'super' }],
      [{ color: [] }, { background: [] }],
      [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }, { indent: '-1' }, { indent: '+1' }],
      [{ align: [] }],
      ['blockquote', 'code-block', 'link', 'image'],
      ['clean'],
    ],
  },
})
quill.disable()

persistence.whenSynced.then(() => {
  new QuillBinding(doc.getText('content'), quill, awareness)
  quill.enable()
  syncTitle()
  saveEntry()
  room = new RoomProvider(doc, awareness, { roomId: docId, password: docKey, relays })
  room.onPeersChange(renderStatus)
  renderStatus()
})

window.addEventListener('beforeunload', () => {
  removeAwarenessStates(awareness, [doc.clientID], 'unload')
  room?.destroy()
})

function docUrl(id: string, key: string): string {
  return `${location.pathname}${location.search}#doc=${id}&key=${key}`
}

function saveEntry() {
  store.saveDoc({ id: docId, key: docKey, title: meta.get('title') || '' })
}

// ---------- Title ----------

const titleInput = $<HTMLInputElement>('doc-title')

function syncTitle() {
  const title = meta.get('title') || ''
  if (document.activeElement !== titleInput) titleInput.value = title
  document.title = `${title || 'Untitled document'} · Words Online`
}
titleInput.addEventListener('input', () => meta.set('title', titleInput.value))
meta.observe(syncTitle)
doc.on('update', saveEntry)

// ---------- User identity, presence & status ----------

const user = store.loadUser()
const nameInput = $<HTMLInputElement>('user-name')
nameInput.value = user.name
nameInput.style.borderColor = user.color
awareness.setLocalStateField('user', user)
nameInput.addEventListener('change', () => {
  user.name = nameInput.value.trim() || user.name
  nameInput.value = user.name
  store.saveUser(user)
  awareness.setLocalStateField('user', user)
})

const presenceEl = $('presence')
awareness.on('change', () => {
  presenceEl.replaceChildren(
    ...[...awareness.getStates().values()]
      .filter((s) => s.user)
      .map((s) => {
        const dot = document.createElement('span')
        dot.className = 'avatar'
        dot.style.background = s.user.color
        dot.textContent = (s.user.name || '?').charAt(0).toUpperCase()
        dot.title = s.user.name
        return dot
      }),
  )
})

const statusEl = $('peer-status')
function renderStatus() {
  const peers = room?.peerCount ?? 0
  if (!navigator.onLine && peers === 0) {
    statusEl.textContent = 'Offline'
    statusEl.className = 'status offline'
    statusEl.title = 'Changes are saved in this browser and synced when others are reachable'
  } else if (peers === 0) {
    statusEl.textContent = 'Only you'
    statusEl.className = 'status offline'
    statusEl.title = 'Waiting for someone to open the shared link'
  } else {
    statusEl.textContent = `${peers + 1} connected`
    statusEl.className = 'status online'
    statusEl.title = 'Editing together in real time'
  }
}
window.addEventListener('online', renderStatus)
window.addEventListener('offline', renderStatus)

// ---------- Share ----------

const dlgShare = $<HTMLDialogElement>('dlg-share')
const shareLink = $<HTMLInputElement>('share-link')

$('btn-share').addEventListener('click', async () => {
  shareLink.value = new URL(docUrl(docId, docKey), location.href).href
  dlgShare.showModal()
  await QRCode.toCanvas($<HTMLCanvasElement>('share-qr'), shareLink.value, { width: 220, margin: 1 })
})
$('btn-copy-share').addEventListener('click', () => copy(shareLink))

// ---------- File menu ----------

const menu = document.querySelector<HTMLDetailsElement>('details.menu')!
menu.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).tagName === 'BUTTON') menu.open = false
})
document.addEventListener('click', (e) => {
  if (!menu.contains(e.target as Node)) menu.open = false
})

$('btn-new').addEventListener('click', () => (location.hash = `doc=${store.newDocId()}&key=${store.newDocKey()}`))
$('btn-print').addEventListener('click', () => window.print())

document.querySelectorAll<HTMLButtonElement>('[data-export]').forEach((button) => {
  button.addEventListener('click', async () => {
    const format = button.dataset.export as ExportFormat
    const title = meta.get('title') || 'Untitled document'
    try {
      const blob = await exportFile(format, quill.getContents().ops, quill.getSemanticHTML(), quill.getText(), title)
      download(blob, `${title.replace(/[\\/:*?"<>|]+/g, '_')}.${format}`)
    } catch (err) {
      toast(`Export failed: ${(err as Error).message}`)
    }
  })
})

// Opening a file creates a new document, so the current one is never overwritten.
const fileInput = $<HTMLInputElement>('file-input')
fileInput.accept = OPEN_ACCEPT
$('btn-open-file').addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0]
  fileInput.value = ''
  if (!file) return
  try {
    const imported = await importFile(file)
    const ops =
      'ops' in imported
        ? imported.ops
        : 'html' in imported
          ? quill.clipboard.convert({ html: imported.html }).ops
          : [{ insert: imported.text.endsWith('\n') ? imported.text : `${imported.text}\n` }]
    const id = store.newDocId()
    const key = store.newDocKey()
    const title = file.name.replace(/\.[^.]+$/, '')
    const newDoc = new Y.Doc()
    newDoc.getText('content').applyDelta(ops)
    newDoc.getMap('meta').set('title', title)
    // y-indexeddb stores the full current state when it first syncs.
    const saved = new IndexeddbPersistence(store.dbName(id), newDoc)
    await saved.whenSynced
    await saved.destroy()
    store.saveDoc({ id, key, title })
    location.hash = `doc=${id}&key=${key}`
  } catch (err) {
    toast(`Could not open the file: ${(err as Error).message}`)
  }
})

const dlgDocs = $<HTMLDialogElement>('dlg-docs')
$('btn-docs').addEventListener('click', () => {
  $('doc-list').replaceChildren(
    ...store.listDocs().map((d) => {
      const li = document.createElement('li')
      const open = document.createElement('a')
      open.href = docUrl(d.id, d.key)
      open.textContent = d.title || 'Untitled document'
      if (d.id === docId) open.classList.add('current')
      const date = document.createElement('small')
      date.textContent = new Date(d.updated).toLocaleString()
      const del = document.createElement('button')
      del.type = 'button'
      del.textContent = 'Delete'
      del.disabled = d.id === docId
      del.addEventListener('click', async () => {
        if (!confirm(`Delete "${open.textContent}" from this browser?`)) return
        await store.deleteDoc(d.id)
        li.remove()
      })
      li.append(open, date, del)
      return li
    }),
  )
  dlgDocs.showModal()
})

// ---------- Helpers ----------

function download(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

async function copy(input: HTMLInputElement) {
  try {
    await navigator.clipboard.writeText(input.value)
  } catch {
    // Clipboard API is unavailable on plain http origins.
    input.select()
    document.execCommand('copy')
  }
  toast('Copied')
}

let toastTimer = 0
function toast(message: string) {
  const el = $('toast')
  el.textContent = message
  el.hidden = false
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (el.hidden = true), 3000)
}
