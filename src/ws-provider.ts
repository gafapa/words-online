// Yjs provider over a WebSocket connection to the LAN relay server.
// Reconnects automatically with exponential backoff; local edits made while
// offline are kept in the document and merged on reconnect.

import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { MSG_AWARENESS, MSG_SYNC } from './protocol'

const MIN_RETRY_MS = 500
const MAX_RETRY_MS = 10000
// Without traffic for this long the connection is considered dead.
const IDLE_TIMEOUT_MS = 35000

export type ServerStatus = 'connecting' | 'connected' | 'disconnected'

export class WebSocketProvider {
  status: ServerStatus = 'disconnected'
  synced = false
  private ws: WebSocket | null = null
  private retries = 0
  private retryTimer = 0
  private idleTimer = 0
  private destroyed = false
  private listeners: ((status: ServerStatus) => void)[] = []

  constructor(
    readonly url: string,
    readonly doc: Y.Doc,
    readonly awareness: awarenessProtocol.Awareness,
  ) {
    doc.on('update', this.onDocUpdate)
    awareness.on('update', this.onAwarenessUpdate)
    window.addEventListener('online', this.reconnectNow)
    document.addEventListener('visibilitychange', this.reconnectNow)
    this.connect()
  }

  onStatus(listener: (status: ServerStatus) => void): void {
    this.listeners.push(listener)
  }

  destroy(): void {
    this.destroyed = true
    clearTimeout(this.retryTimer)
    clearTimeout(this.idleTimer)
    this.doc.off('update', this.onDocUpdate)
    this.awareness.off('update', this.onAwarenessUpdate)
    window.removeEventListener('online', this.reconnectNow)
    document.removeEventListener('visibilitychange', this.reconnectNow)
    this.ws?.close()
  }

  private connect(): void {
    if (this.destroyed || this.ws) return
    this.setStatus('connecting')
    const ws = new WebSocket(this.url)
    ws.binaryType = 'arraybuffer'
    this.ws = ws

    ws.onopen = () => {
      this.retries = 0
      this.setStatus('connected')
      this.resetIdleTimer()
      const sync = encoding.createEncoder()
      encoding.writeVarUint(sync, MSG_SYNC)
      syncProtocol.writeSyncStep1(sync, this.doc)
      this.send(encoding.toUint8Array(sync))
      if (this.awareness.getLocalState() !== null) {
        this.send(this.encodeAwareness([this.doc.clientID]))
      }
    }

    ws.onmessage = (e) => {
      this.resetIdleTimer()
      if (typeof e.data === 'string') return // keepalive
      this.handleMessage(new Uint8Array(e.data as ArrayBuffer))
    }

    ws.onclose = () => {
      this.ws = null
      this.synced = false
      clearTimeout(this.idleTimer)
      // Presence received through the server is stale now.
      const remote = [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID)
      awarenessProtocol.removeAwarenessStates(this.awareness, remote, this)
      this.setStatus('disconnected')
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return
    const delay = Math.min(MAX_RETRY_MS, MIN_RETRY_MS * 2 ** this.retries++)
    this.retryTimer = window.setTimeout(() => this.connect(), delay)
  }

  private reconnectNow = (): void => {
    if (document.visibilityState === 'hidden' || this.ws) return
    clearTimeout(this.retryTimer)
    this.retries = 0
    this.connect()
  }

  private resetIdleTimer(): void {
    clearTimeout(this.idleTimer)
    this.idleTimer = window.setTimeout(() => this.ws?.close(), IDLE_TIMEOUT_MS)
  }

  private handleMessage(data: Uint8Array): void {
    const decoder = decoding.createDecoder(data)
    const type = decoding.readVarUint(decoder)
    if (type === MSG_SYNC) {
      const reply = encoding.createEncoder()
      encoding.writeVarUint(reply, MSG_SYNC)
      const syncType = syncProtocol.readSyncMessage(decoder, reply, this.doc, this)
      if (syncType === syncProtocol.messageYjsSyncStep2) this.synced = true
      if (encoding.length(reply) > 1) this.send(encoding.toUint8Array(reply))
    } else if (type === MSG_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), this)
    }
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this) return
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MSG_SYNC)
    syncProtocol.writeUpdate(encoder, update)
    this.send(encoding.toUint8Array(encoder))
  }

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (origin === this) return
    this.send(this.encodeAwareness([...added, ...updated, ...removed]))
  }

  private encodeAwareness(clients: number[]): Uint8Array {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MSG_AWARENESS)
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, clients))
    return encoding.toUint8Array(encoder)
  }

  private send(data: Uint8Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data as Uint8Array<ArrayBuffer>)
  }

  private setStatus(status: ServerStatus): void {
    this.status = status
    this.listeners.forEach((l) => l(status))
  }
}
