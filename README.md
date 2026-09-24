# Words Online

A collaborative rich-text editor for your local network. One machine runs a tiny
Node.js server that serves the app, relays edits over WebSockets and stores
documents on disk. No database, no cloud services: nothing leaves the LAN.

## Features

- Rich-text editing (headings, lists, colors, links, images, code blocks…) with [Quill](https://quilljs.com/).
- Real-time, conflict-free collaboration with [Yjs](https://yjs.dev/) CRDTs.
- Live remote cursors and presence avatars.
- Resilient sync: automatic reconnection with backoff; edits made while offline
  are kept in the browser (IndexedDB) and merged when the connection returns.
- Documents persisted on the server (`data/`), listed for every device on the network.
- Import (`.txt`, `.html`), export (HTML, text) and print / PDF.
- Serverless fallback: when the app is served from a static host, peers can
  connect directly over WebRTC with a manual invite/answer exchange.

## Quick start

```bash
npm install
npm run serve     # builds the app and starts the server on port 8080
```

The server prints the addresses to open from other devices, e.g.
`http://192.168.1.20:8080/`. Click **Share** to get a link (and QR code) to the
current document; anyone on the network who opens it can edit.

### Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | HTTP / WebSocket port. |
| `HOST` | `0.0.0.0` | Interface to listen on. |
| `DATA_DIR` | `./data` | Where documents are stored (`<id>.ydoc` + `<id>.json`). |
| `STATIC_DIR` | `./dist` | Built front-end served by the server. |

To back up documents, copy the `data/` folder.

## Development

```bash
npm run dev:server   # server with auto-restart (port 8080)
npm run dev          # Vite dev server, proxies /ws and /api to the server
npm run build        # type-check and build the front-end into dist/
```

## Architecture

```
 Browser A ──┐                      ┌── data/<id>.ydoc
 Browser B ──┼── WebSocket /ws/<id> ─┤   Node server (relay + persistence)
 Browser C ──┘                      └── dist/ (static app)
```

- Each document is a Yjs doc identified by the `#doc=<id>` URL fragment.
- The wire protocol is the standard y-websocket one (sync + awareness messages).
- The server keeps a document in memory while someone is connected, saves it
  (debounced, atomic writes) on every change and unloads it when the last client leaves.
- Every browser also keeps a local copy, so the editor works offline and syncs
  whatever changed when the server is reachable again.

### Serverless mode (WebRTC)

If no server is reachable (e.g. the app is published on GitHub Pages), the
status shows *Local only* and **Share** opens a direct connection flow:

1. The inviter sends the generated link / QR code.
2. The guest opens it and sends back the answer code.
3. The inviter pastes it and clicks **Connect**.

Only local network candidates are used (no STUN/TURN). Every peer relays
updates to its other peers, so participants form a tree. Each invitation is
single-use. Both transports can be active at the same time.

## Deployment

- **LAN server** (recommended): `npm run serve` on any machine of the network.
- **Static only**: `.github/workflows/pages.yml` publishes `dist/` to GitHub Pages
  on every push to `main` (serverless mode only).

## Limitations

- Anyone who can reach the server can open and edit any document; there is no
  authentication. Run it only on trusted networks.
- In serverless mode, networks that block multicast (mDNS) may prevent
  connections, and collaboration stops when the connecting tabs close.

## Project structure

| File | Purpose |
| --- | --- |
| `server/index.js` | LAN server: static files, WebSocket relay, disk persistence, `/api/docs`. |
| `src/main.ts` | UI wiring: editor, dialogs, file menu, presence, status. |
| `src/ws-provider.ts` | Yjs provider over WebSocket with reconnection and keepalive. |
| `src/network.ts` | Yjs provider over WebRTC data channels (serverless fallback). |
| `src/signaling.ts` | Manual WebRTC signaling: offer/answer creation and compact encoding. |
| `src/protocol.ts` | Message types shared by the transports. |
| `src/store.ts` | Local document index and user identity. |
