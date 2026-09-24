// LAN server: serves the built app, relays Yjs updates over WebSockets and
// persists every document to disk. No external services involved.

import http from 'node:http'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

const MSG_SYNC = 0
const MSG_AWARENESS = 1

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT) || 8080
const HOST = process.env.HOST || '0.0.0.0'
const STATIC_DIR = path.resolve(process.env.STATIC_DIR || path.join(ROOT, 'dist'))
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'))
const SAVE_DELAY_MS = 1000
const KEEPALIVE_MS = 15000
const DOC_ID = /^[A-Za-z0-9_-]{1,64}$/

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

// ---------- Rooms ----------

/** @type {Map<string, Promise<Room>>} */
const rooms = new Map()

class Room {
  constructor(id, doc) {
    this.id = id
    this.doc = doc
    this.awareness = new awarenessProtocol.Awareness(doc)
    this.awareness.setLocalState(null) // the server has no presence
    /** @type {Map<import('ws').WebSocket, Set<number>>} */
    this.conns = new Map()
    this.saveTimer = null

    doc.on('update', (update, origin) => {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MSG_SYNC)
      syncProtocol.writeUpdate(encoder, update)
      this.broadcast(encoding.toUint8Array(encoder), origin)
      this.scheduleSave()
    })

    this.awareness.on('update', ({ added, updated, removed }, origin) => {
      const ids = this.conns.get(origin)
      if (ids) {
        added.forEach((id) => ids.add(id))
        updated.forEach((id) => ids.add(id))
        removed.forEach((id) => ids.delete(id))
      }
      const changed = [...added, ...updated, ...removed]
      this.broadcast(encodeAwareness(this.awareness, changed), null)
    })
  }

  static async load(id) {
    const doc = new Y.Doc()
    try {
      Y.applyUpdate(doc, await fs.readFile(docPath(id)))
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
    return new Room(id, doc)
  }

  addConnection(ws) {
    this.conns.set(ws, new Set())

    const sync = encoding.createEncoder()
    encoding.writeVarUint(sync, MSG_SYNC)
    syncProtocol.writeSyncStep1(sync, this.doc)
    send(ws, encoding.toUint8Array(sync))

    const states = [...this.awareness.getStates().keys()]
    if (states.length > 0) send(ws, encodeAwareness(this.awareness, states))

    ws.on('message', (data, isBinary) => {
      if (!isBinary) return
      try {
        this.handleMessage(ws, new Uint8Array(data))
      } catch (err) {
        console.error(`[${this.id}] invalid message:`, err.message)
        ws.close()
      }
    })
    ws.on('close', () => this.removeConnection(ws))
  }

  handleMessage(ws, data) {
    const decoder = decoding.createDecoder(data)
    const type = decoding.readVarUint(decoder)
    if (type === MSG_SYNC) {
      const reply = encoding.createEncoder()
      encoding.writeVarUint(reply, MSG_SYNC)
      syncProtocol.readSyncMessage(decoder, reply, this.doc, ws)
      if (encoding.length(reply) > 1) send(ws, encoding.toUint8Array(reply))
    } else if (type === MSG_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), ws)
    }
  }

  removeConnection(ws) {
    const ids = this.conns.get(ws)
    if (!ids) return
    this.conns.delete(ws)
    awarenessProtocol.removeAwarenessStates(this.awareness, [...ids], null)
    if (this.conns.size === 0) {
      // Nobody is editing: flush to disk and free memory.
      this.save().finally(() => {
        if (this.conns.size === 0) {
          rooms.delete(this.id)
          this.awareness.destroy()
          this.doc.destroy()
        }
      })
    }
  }

  broadcast(data, except) {
    this.conns.forEach((_, ws) => ws !== except && send(ws, data))
  }

  scheduleSave() {
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.save(), SAVE_DELAY_MS)
  }

  async save() {
    clearTimeout(this.saveTimer)
    this.saveTimer = null
    const update = Y.encodeStateAsUpdate(this.doc)
    const meta = { title: this.doc.getMap('meta').get('title') || '', updated: Date.now() }
    await writeAtomic(docPath(this.id), update)
    await writeAtomic(metaPath(this.id), JSON.stringify(meta))
  }
}

function getRoom(id) {
  let room = rooms.get(id)
  if (!room) {
    room = Room.load(id)
    rooms.set(id, room)
    room.catch(() => rooms.delete(id))
  }
  return room
}

function encodeAwareness(awareness, clients) {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MSG_AWARENESS)
  encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, clients))
  return encoding.toUint8Array(encoder)
}

function send(ws, data) {
  if (ws.readyState === ws.OPEN) ws.send(data, (err) => err && ws.close())
}

// ---------- Storage ----------

const docPath = (id) => path.join(DATA_DIR, `${id}.ydoc`)
const metaPath = (id) => path.join(DATA_DIR, `${id}.json`)

async function writeAtomic(file, content) {
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, content)
  await fs.rename(tmp, file)
}

async function listDocs() {
  const files = await fs.readdir(DATA_DIR)
  const docs = await Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .map(async (f) => {
        try {
          const meta = JSON.parse(await fs.readFile(path.join(DATA_DIR, f), 'utf8'))
          return { id: f.slice(0, -5), title: meta.title, updated: meta.updated }
        } catch {
          return null
        }
      }),
  )
  return docs.filter(Boolean).sort((a, b) => b.updated - a.updated)
}

// ---------- HTTP ----------

async function serveStatic(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost')
  let file = path.join(STATIC_DIR, decodeURIComponent(pathname))
  if (!file.startsWith(STATIC_DIR)) return end(res, 403, 'Forbidden')
  try {
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html')
    const body = await fs.readFile(file)
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    res.end(body)
  } catch {
    end(res, 404, 'Not found')
  }
}

function end(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type })
  res.end(body)
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/api/docs') {
    return end(res, 200, JSON.stringify(await listDocs()), MIME['.json'])
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return end(res, 405, 'Method not allowed')
  serveStatic(req, res)
})

// ---------- WebSocket ----------

const wss = new WebSocketServer({ noServer: true, maxPayload: 50 * 1024 * 1024 })

server.on('upgrade', (req, socket, head) => {
  const match = /^\/ws\/([^/?]+)/.exec(req.url || '')
  const id = match && decodeURIComponent(match[1])
  if (!id || !DOC_ID.test(id)) {
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, async (ws) => {
    ws.isAlive = true
    ws.on('pong', () => (ws.isAlive = true))
    try {
      // Buffer messages that arrive while the document is loading from disk.
      const queued = []
      const queue = (data, isBinary) => queued.push([data, isBinary])
      ws.on('message', queue)
      const room = await getRoom(id)
      ws.off('message', queue)
      room.addConnection(ws)
      queued.forEach(([data, isBinary]) => ws.emit('message', data, isBinary))
    } catch (err) {
      console.error(`[${id}] failed to load:`, err)
      ws.close(1011)
    }
  })
})

// Detects dead connections and keeps idle ones (and NAT/proxies) alive.
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate()
    ws.isAlive = false
    ws.ping()
    ws.send('ping')
  })
}, KEEPALIVE_MS)

// ---------- Lifecycle ----------

async function shutdown() {
  console.log('\nSaving documents…')
  const loaded = await Promise.allSettled(rooms.values())
  await Promise.allSettled(loaded.filter((r) => r.status === 'fulfilled').map((r) => r.value.save()))
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await fs.mkdir(DATA_DIR, { recursive: true })
if (!existsSync(path.join(STATIC_DIR, 'index.html'))) {
  console.warn(`Warning: ${STATIC_DIR} has no index.html. Run "npm run build" first.`)
}

server.listen(PORT, HOST, () => {
  console.log(`Words Online server running. Documents stored in ${DATA_DIR}`)
  console.log('Open one of these addresses on any device of the network:')
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4')
  for (const a of addresses) console.log(`  http://${a.address}:${PORT}/`)
})
