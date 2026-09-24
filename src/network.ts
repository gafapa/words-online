// Yjs provider over WebRTC data channels. Every peer relays updates it
// receives to its other peers, so any participant can invite new ones and
// the connections form a tree that keeps everybody in sync.

import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

const MSG_SYNC = 0
const MSG_AWARENESS = 1

// Data channels have per-message size limits (~256 KiB in Chromium),
// so large payloads (e.g. the initial sync) are split into chunks.
const CHUNK_SIZE = 16 * 1024
const FRAME_FULL = 0
const FRAME_PART = 1
const FRAME_LAST = 2

export class Peer {
  readonly clientIds = new Set<number>()
  private pending: Uint8Array[] = []

  constructor(
    readonly pc: RTCPeerConnection,
    readonly channel: RTCDataChannel,
    private readonly onMessage: (peer: Peer, data: Uint8Array) => void,
  ) {
    channel.binaryType = 'arraybuffer'
    channel.addEventListener('message', (e) => this.receive(new Uint8Array(e.data as ArrayBuffer)))
  }

  get isOpen(): boolean {
    return this.channel.readyState === 'open'
  }

  send(data: Uint8Array): void {
    if (!this.isOpen) return
    if (data.length <= CHUNK_SIZE) {
      this.channel.send(concat([Uint8Array.of(FRAME_FULL), data]))
      return
    }
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const last = i + CHUNK_SIZE >= data.length
      this.channel.send(concat([Uint8Array.of(last ? FRAME_LAST : FRAME_PART), data.subarray(i, i + CHUNK_SIZE)]))
    }
  }

  close(): void {
    this.channel.close()
    this.pc.close()
  }

  private receive(frame: Uint8Array): void {
    const body = frame.subarray(1)
    if (frame[0] === FRAME_FULL) {
      this.onMessage(this, body)
    } else {
      this.pending.push(body)
      if (frame[0] === FRAME_LAST) {
        const data = concat(this.pending)
        this.pending = []
        this.onMessage(this, data)
      }
    }
  }
}

type NetworkEvents = { peers: (count: number) => void }

export class PeerNetwork {
  readonly peers = new Set<Peer>()
  readonly awareness: awarenessProtocol.Awareness
  private listeners: NetworkEvents['peers'][] = []

  constructor(readonly doc: Y.Doc) {
    this.awareness = new awarenessProtocol.Awareness(doc)
    doc.on('update', this.onDocUpdate)
    this.awareness.on('update', this.onAwarenessUpdate)
    window.addEventListener('beforeunload', () => {
      awarenessProtocol.removeAwarenessStates(this.awareness, [doc.clientID], 'unload')
    })
  }

  onPeersChange(listener: NetworkEvents['peers']): void {
    this.listeners.push(listener)
  }

  // Registers a data channel; resolves once it is open and syncing.
  addConnection(pc: RTCPeerConnection, channel: RTCDataChannel): Promise<Peer> {
    const peer = new Peer(pc, channel, this.onPeerMessage)
    return new Promise((resolve, reject) => {
      const onOpen = () => {
        this.peers.add(peer)
        this.emitPeers()
        this.startSync(peer)
        resolve(peer)
      }
      if (peer.isOpen) onOpen()
      else channel.addEventListener('open', onOpen, { once: true })
      channel.addEventListener('close', () => {
        this.removePeer(peer)
        reject(new Error('Connection closed'))
      })
      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          this.removePeer(peer)
          reject(new Error('Connection failed'))
        }
      })
    })
  }

  disconnectAll(): void {
    this.peers.forEach((p) => p.close())
  }

  destroy(): void {
    this.disconnectAll()
    this.doc.off('update', this.onDocUpdate)
    this.awareness.off('update', this.onAwarenessUpdate)
    this.awareness.destroy()
  }

  private startSync(peer: Peer): void {
    const sync = encoding.createEncoder()
    encoding.writeVarUint(sync, MSG_SYNC)
    syncProtocol.writeSyncStep1(sync, this.doc)
    peer.send(encoding.toUint8Array(sync))

    const states = [...this.awareness.getStates().keys()]
    if (states.length > 0) peer.send(this.encodeAwareness(states))
  }

  private removePeer(peer: Peer): void {
    if (!this.peers.delete(peer)) return
    // Drop presence of everybody that was reachable through this peer.
    const ids = [...peer.clientIds].filter((id) => id !== this.doc.clientID)
    awarenessProtocol.removeAwarenessStates(this.awareness, ids, peer)
    this.emitPeers()
  }

  private onPeerMessage = (peer: Peer, data: Uint8Array): void => {
    const decoder = decoding.createDecoder(data)
    const type = decoding.readVarUint(decoder)
    if (type === MSG_SYNC) {
      const reply = encoding.createEncoder()
      encoding.writeVarUint(reply, MSG_SYNC)
      // The peer is the transaction origin, so the update is relayed to all other peers.
      syncProtocol.readSyncMessage(decoder, reply, this.doc, peer)
      if (encoding.length(reply) > 1) peer.send(encoding.toUint8Array(reply))
    } else if (type === MSG_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), peer)
    }
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MSG_SYNC)
    syncProtocol.writeUpdate(encoder, update)
    this.broadcast(encoding.toUint8Array(encoder), origin)
  }

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    const changed = [...added, ...updated, ...removed]
    if (origin instanceof Peer) {
      added.forEach((id) => origin.clientIds.add(id))
      updated.forEach((id) => origin.clientIds.add(id))
      removed.forEach((id) => origin.clientIds.delete(id))
    }
    this.broadcast(this.encodeAwareness(changed), origin)
  }

  private encodeAwareness(clients: number[]): Uint8Array {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MSG_AWARENESS)
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, clients))
    return encoding.toUint8Array(encoder)
  }

  private broadcast(data: Uint8Array, except: unknown): void {
    this.peers.forEach((peer) => peer !== except && peer.send(data))
  }

  private emitPeers(): void {
    this.listeners.forEach((l) => l(this.peers.size))
  }
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}
