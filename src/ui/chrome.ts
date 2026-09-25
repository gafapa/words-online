// App chrome shared by every document type: title, presence avatars,
// connection status, share dialog and user name.

import type * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import QRCode from 'qrcode'
import type { RoomProvider } from '../network'
import * as store from '../store'
import { el, showDialog, toast } from './widgets'

export interface Session {
  doc: Y.Doc
  awareness: Awareness
  room: RoomProvider
  docId: string
  docKey: string
  user: store.User
  shareUrl: () => string
}

export function setupChrome(session: Session, untitled: string): void {
  const { doc, awareness, room, user } = session
  const meta = doc.getMap<unknown>('meta')

  // Title (shared with collaborators).
  const titleInput = document.getElementById('doc-title') as HTMLInputElement
  titleInput.placeholder = untitled
  const syncTitle = () => {
    const title = String(meta.get('title') ?? '')
    if (document.activeElement !== titleInput) titleInput.value = title
    document.title = `${title || untitled} · Words Online`
  }
  titleInput.addEventListener('input', () => meta.set('title', titleInput.value))
  titleInput.addEventListener('keydown', (e) => e.key === 'Enter' && titleInput.blur())
  meta.observe(syncTitle)
  syncTitle()

  // Local name and color.
  const nameInput = document.getElementById('user-name') as HTMLInputElement
  nameInput.value = user.name
  nameInput.style.borderColor = user.color
  nameInput.addEventListener('change', () => {
    user.name = nameInput.value.trim() || user.name
    nameInput.value = user.name
    store.saveUser(user)
    awareness.setLocalStateField('user', { ...awareness.getLocalState()?.user, name: user.name, color: user.color })
  })

  // Presence avatars.
  const presence = document.getElementById('presence')!
  const renderPresence = () => {
    presence.replaceChildren(
      ...[...awareness.getStates().entries()]
        .filter(([, s]) => s.user)
        .map(([id, s]) => {
          const dot = el('span', { class: 'avatar', textContent: String(s.user.name || '?').charAt(0).toUpperCase() })
          dot.style.background = s.user.color
          dot.title = id === doc.clientID ? `${s.user.name} (you)` : s.user.name
          return dot
        }),
    )
  }
  awareness.on('change', renderPresence)
  renderPresence()

  // Connection status.
  const status = document.getElementById('peer-status')!
  const renderStatus = () => {
    const peers = room.peerCount
    if (!navigator.onLine && peers === 0) {
      status.textContent = 'Offline'
      status.className = 'status offline'
      status.title = 'Changes are saved in this browser and synced when others are reachable'
    } else if (peers === 0) {
      status.textContent = 'Only you'
      status.className = 'status offline'
      status.title = 'Share the link to edit together'
    } else {
      status.textContent = `${peers + 1} editing`
      status.className = 'status online'
      status.title = 'Editing together in real time'
    }
  }
  room.onPeersChange(renderStatus)
  window.addEventListener('online', renderStatus)
  window.addEventListener('offline', renderStatus)
  renderStatus()

  document.getElementById('btn-share')!.addEventListener('click', () => openShareDialog(session.shareUrl()))
}

export async function openShareDialog(url: string): Promise<void> {
  const input = el('input', { value: url, readOnly: true, class: 'field mono' })
  const copyBtn = el('button', { type: 'button', textContent: 'Copy link' })
  copyBtn.addEventListener('click', () => copyText(input))
  const canvas = el('canvas', { class: 'qr' })
  const body = el(
    'div',
    {},
    el('p', { textContent: 'Anyone who opens this link can edit the document with you in real time.' }),
    el('div', { class: 'code-row' }, input, copyBtn),
    canvas,
    el('p', {
      class: 'hint',
      textContent:
        "The link contains the document's secret key. Edits travel directly between browsers; public relays are only used to find each other.",
    }),
  )
  const shown = showDialog('Share', body, [{ label: 'Done', value: 'ok', primary: true }])
  await QRCode.toCanvas(canvas, url, { width: 200, margin: 1 })
  await shown
}

export async function copyText(input: HTMLInputElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(input.value)
  } catch {
    // The Clipboard API is unavailable on plain http origins.
    input.select()
    document.execCommand('copy')
  }
  toast('Copied')
}
