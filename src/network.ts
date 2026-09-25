// Yjs provider over WebRTC using Trystero. Public Nostr relays (WebSocket)
// are only used to discover peers and exchange connection offers, encrypted
// with the room key; document data flows directly between browsers.
// Every peer also relays what it receives to its other peers, so the
// document converges even if some pair of peers cannot connect directly.

import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { joinRoom, type MessageAction, type Room } from '@trystero-p2p/nostr'

const APP_ID = 'words-online'
const MSG_SYNC = 0
const MSG_AWARENESS = 1

// Used as Yjs transaction / awareness origin to know where a change came from.
class RemotePeer {
  readonly clientIds = new Set<number>()
  constructor(readonly id: string) {}
}

export interface RoomOptions {
  roomId: string
  password: string
  // Optional custom Nostr relays (defaults to Trystero's public list).
  relays?: string[]
}

export class RoomProvider {
  private readonly room: Room
  private readonly peers = new Map<string, RemotePeer>()
  private readonly action: MessageAction<Uint8Array>
  private listeners: ((count: number) => void)[] = []

  constructor(
    readonly doc: Y.Doc,
    readonly awareness: awarenessProtocol.Awareness,
    options: RoomOptions,
  ) {
    this.room = joinRoom(
      {
        appId: APP_ID,
        password: options.password,
        ...(options.relays?.length ? { relayConfig: { urls: options.relays, redundancy: options.relays.length } } : {}),
      },
      options.roomId,
    )
    this.action = this.room.makeAction<Uint8Array>('yjs', {
      onMessage: (data, { peerId }) => this.onMessage(peerId, toBytes(data)),
    })

    this.room.onPeerJoin = (peerId) => {
      this.peers.set(peerId, new RemotePeer(peerId))
      this.emitPeers()
      const sync = encoding.createEncoder()
      encoding.writeVarUint(sync, MSG_SYNC)
      syncProtocol.writeSyncStep1(sync, doc)
      this.send(encoding.toUint8Array(sync), peerId)
      const states = [...awareness.getStates().keys()]
      if (states.length > 0) this.send(this.encodeAwareness(states), peerId)
    }

    this.room.onPeerLeave = (peerId) => {
      const peer = this.peers.get(peerId)
      if (!peer) return
      this.peers.delete(peerId)
      // Drop presence only for clients no other peer can still vouch for.
      const stillReachable = new Set([...this.peers.values()].flatMap((p) => [...p.clientIds]))
      const gone = [...peer.clientIds].filter((id) => id !== doc.clientID && !stillReachable.has(id))
      awarenessProtocol.removeAwarenessStates(awareness, gone, peer)
      this.emitPeers()
    }

    doc.on('update', this.onDocUpdate)
    awareness.on('update', this.onAwarenessUpdate)
  }

  get peerCount(): number {
    return this.peers.size
  }

  onPeersChange(listener: (count: number) => void): void {
    this.listeners.push(listener)
  }

  async destroy(): Promise<void> {
    this.doc.off('update', this.onDocUpdate)
    this.awareness.off('update', this.onAwarenessUpdate)
    await this.room.leave()
  }

  private onMessage(peerId: string, data: Uint8Array): void {
    let peer = this.peers.get(peerId)
    if (!peer) {
      peer = new RemotePeer(peerId)
      this.peers.set(peerId, peer)
      this.emitPeers()
    }
    const decoder = decoding.createDecoder(data)
    const type = decoding.readVarUint(decoder)
    if (type === MSG_SYNC) {
      const reply = encoding.createEncoder()
      encoding.writeVarUint(reply, MSG_SYNC)
      syncProtocol.readSyncMessage(decoder, reply, this.doc, peer)
      if (encoding.length(reply) > 1) this.send(encoding.toUint8Array(reply), peerId)
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
    if (origin instanceof RemotePeer) {
      added.forEach((id) => origin.clientIds.add(id))
      updated.forEach((id) => origin.clientIds.add(id))
      removed.forEach((id) => origin.clientIds.delete(id))
    }
    this.broadcast(this.encodeAwareness([...added, ...updated, ...removed]), origin)
  }

  private encodeAwareness(clients: number[]): Uint8Array {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MSG_AWARENESS)
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, clients))
    return encoding.toUint8Array(encoder)
  }

  private broadcast(data: Uint8Array, except: unknown): void {
    const targets = [...this.peers.values()].filter((p) => p !== except).map((p) => p.id)
    if (targets.length > 0) this.send(data, targets)
  }

  private send(data: Uint8Array, target: string | string[]): void {
    this.action.send(data, { target }).catch(() => {
      // Peer vanished mid-send; the next sync on reconnect recovers the state.
    })
  }

  private emitPeers(): void {
    this.listeners.forEach((l) => l(this.peers.size))
  }
}

function toBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  throw new Error('Unexpected payload type')
}
