import * as Y from 'yjs'
import Quill from 'quill'
import QuillCursors from 'quill-cursors'
import { QuillBinding } from 'y-quill'
import { IndexeddbPersistence } from 'y-indexeddb'
import QRCode from 'qrcode'
import 'quill/dist/quill.snow.css'
import './style.css'
import { PeerNetwork } from './network'
import { acceptAnswer, createAnswer, createOffer } from './signaling'
import * as store from './store'

Quill.register('modules/cursors', QuillCursors)

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

// ---------- Document bootstrap ----------

const params = new URLSearchParams(location.hash.slice(1))
const docId = params.get('doc') || store.newDocId()
const pendingInvite = params.get('invite')
history.replaceState(null, '', `#doc=${docId}`)
// Switching documents is done through the URL; a clean reload keeps state simple.
window.addEventListener('hashchange', () => location.reload())

const doc = new Y.Doc()
const persistence = new IndexeddbPersistence(store.dbName(docId), doc)
const network = new PeerNetwork(doc)
const meta = doc.getMap<string>('meta')

const quill = new Quill('#editor', {
  theme: 'snow',
  placeholder: 'Start writing…',
  modules: {
    cursors: { transformOnTextChange: true },
    history: { userOnly: true },
    toolbar: [
      [{ header: [1, 2, 3, false] }, { font: [] }, { size: ['small', false, 'large', 'huge'] }],
      ['bold', 'italic', 'underline', 'strike'],
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
  new QuillBinding(doc.getText('content'), quill, network.awareness)
  quill.enable()
  syncTitle()
  store.touchDoc(docId, meta.get('title') || '')
  if (pendingInvite) joinWithInvite(pendingInvite)
})

// ---------- Title ----------

const titleInput = $<HTMLInputElement>('doc-title')

function syncTitle() {
  const title = meta.get('title') || ''
  if (document.activeElement !== titleInput) titleInput.value = title
  document.title = `${title || 'Untitled document'} · Words Online`
}
titleInput.addEventListener('input', () => meta.set('title', titleInput.value))
meta.observe(() => {
  syncTitle()
  store.touchDoc(docId, meta.get('title') || '')
})
doc.on('update', () => store.touchDoc(docId, meta.get('title') || ''))

// ---------- User identity & presence ----------

const user = store.loadUser()
const nameInput = $<HTMLInputElement>('user-name')
nameInput.value = user.name
nameInput.style.borderColor = user.color
network.awareness.setLocalStateField('user', user)
nameInput.addEventListener('change', () => {
  user.name = nameInput.value.trim() || user.name
  nameInput.value = user.name
  store.saveUser(user)
  network.awareness.setLocalStateField('user', user)
})

const presenceEl = $('presence')
network.awareness.on('change', () => {
  presenceEl.replaceChildren(
    ...[...network.awareness.getStates().values()]
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
network.onPeersChange((count) => {
  statusEl.textContent = count === 0 ? 'Offline' : `${count} connection${count > 1 ? 's' : ''}`
  statusEl.className = `status ${count === 0 ? 'offline' : 'online'}`
})

// ---------- Invite (offer side) ----------

const dlgInvite = $<HTMLDialogElement>('dlg-invite')
const inviteLink = $<HTMLInputElement>('invite-link')
const answerCode = $<HTMLTextAreaElement>('answer-code')
const inviteStatus = $('invite-status')
let pendingOffer: RTCPeerConnection | null = null
let pendingChannel: RTCDataChannel | null = null

$('btn-invite').addEventListener('click', async () => {
  pendingOffer?.close()
  answerCode.value = ''
  inviteLink.value = 'Generating…'
  inviteStatus.textContent = ''
  dlgInvite.showModal()
  try {
    const offer = await createOffer()
    pendingOffer = offer.pc
    pendingChannel = offer.channel
    const link = `${location.origin}${location.pathname}#doc=${docId}&invite=${offer.code}`
    inviteLink.value = link
    await QRCode.toCanvas($<HTMLCanvasElement>('invite-qr'), link, { width: 220, margin: 1 })
  } catch (err) {
    inviteStatus.textContent = `Could not create the invitation: ${(err as Error).message}`
  }
})

dlgInvite.addEventListener('close', () => {
  // An unanswered offer is useless once the dialog is gone.
  if (pendingOffer && pendingOffer.connectionState === 'new') pendingOffer.close()
  pendingOffer = null
  pendingChannel = null
})

$('btn-copy-invite').addEventListener('click', () => copy(inviteLink))

$('btn-accept-answer').addEventListener('click', async () => {
  if (!pendingOffer || !pendingChannel) return
  const pc = pendingOffer
  const channel = pendingChannel
  inviteStatus.textContent = 'Connecting…'
  try {
    await acceptAnswer(pc, answerCode.value)
    pendingOffer = null
    pendingChannel = null
    await withTimeout(network.addConnection(pc, channel), 15000)
    dlgInvite.close()
    toast('Connected')
  } catch (err) {
    inviteStatus.textContent = `Connection failed: ${(err as Error).message}`
  }
})

// ---------- Join (answer side) ----------

const dlgJoin = $<HTMLDialogElement>('dlg-join')
const inviteCodeInput = $<HTMLTextAreaElement>('invite-code')
const joinInputStep = $('join-input-step')
const joinAnswerStep = $('join-answer-step')
const answerOutput = $<HTMLInputElement>('answer-output')
const joinStatus = $('join-status')

$('btn-join').addEventListener('click', () => {
  inviteCodeInput.value = ''
  joinInputStep.hidden = false
  joinAnswerStep.hidden = true
  dlgJoin.showModal()
})

$('btn-create-answer').addEventListener('click', () => {
  const invite = parseInvite(inviteCodeInput.value)
  if (!invite) return toast('That does not look like an invitation')
  if (invite.doc !== docId) {
    // Joining another document: reload into it and continue there.
    location.hash = `doc=${invite.doc}&invite=${invite.code}`
    return
  }
  joinWithInvite(invite.code)
})

$('btn-copy-answer').addEventListener('click', () => copy(answerOutput))

async function joinWithInvite(code: string) {
  joinInputStep.hidden = true
  joinAnswerStep.hidden = false
  answerOutput.value = 'Generating…'
  joinStatus.textContent = 'Waiting for the other person to connect…'
  if (!dlgJoin.open) dlgJoin.showModal()
  try {
    const answer = await createAnswer(code)
    answerOutput.value = answer.code
    const channel = await answer.channel
    await network.addConnection(answer.pc, channel)
    dlgJoin.close()
    toast('Connected')
  } catch (err) {
    joinStatus.textContent = `Could not join: ${(err as Error).message}`
  }
}

function parseInvite(text: string): { doc: string; code: string } | null {
  const hash = text.trim().split('#')[1]
  if (!hash) return null
  const p = new URLSearchParams(hash)
  const doc = p.get('doc')
  const code = p.get('invite')
  return doc && code ? { doc, code } : null
}

// ---------- File menu ----------

const menu = document.querySelector<HTMLDetailsElement>('details.menu')!
menu.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).tagName === 'BUTTON') menu.open = false
})
document.addEventListener('click', (e) => {
  if (!menu.contains(e.target as Node)) menu.open = false
})

$('btn-new').addEventListener('click', () => (location.hash = `doc=${store.newDocId()}`))
$('btn-print').addEventListener('click', () => window.print())
$('btn-disconnect').addEventListener('click', () => network.disconnectAll())
$('btn-export-txt').addEventListener('click', () => download(quill.getText(), 'text/plain', 'txt'))
$('btn-export-html').addEventListener('click', () => {
  const title = escapeHtml(meta.get('title') || 'Untitled document')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${quill.getSemanticHTML()}</body></html>`
  download(html, 'text/html', 'html')
})

const fileInput = $<HTMLInputElement>('file-input')
$('btn-import').addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0]
  fileInput.value = ''
  if (!file) return
  const text = await file.text()
  if (!confirm('Replace the current content with this file? This affects everybody connected.')) return
  if (/\.html?$/i.test(file.name) || file.type === 'text/html') {
    quill.setContents(quill.clipboard.convert({ html: text }), 'user')
  } else {
    quill.setText(text, 'user')
  }
  if (!meta.get('title')) meta.set('title', file.name.replace(/\.[^.]+$/, ''))
})

const dlgDocs = $<HTMLDialogElement>('dlg-docs')
$('btn-docs').addEventListener('click', () => {
  const list = $('doc-list')
  list.replaceChildren(
    ...store.listDocs().map((d) => {
      const li = document.createElement('li')
      const open = document.createElement('a')
      open.href = `#doc=${d.id}`
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

function download(content: string, mime: string, ext: string) {
  const name = (meta.get('title') || 'document').replace(/[\\/:*?"<>|]+/g, '_')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type: mime }))
  a.download = `${name}.${ext}`
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
  toastTimer = window.setTimeout(() => (el.hidden = true), 2500)
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timed out (are you on the same network?)')), ms)),
  ])
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
