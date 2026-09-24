# Words Online

A collaborative rich-text editor that runs entirely in the browser. There is no
backend: documents live in each browser (IndexedDB) and edits travel directly
between devices on the same local network over WebRTC.

## Features

- Rich-text editing (headings, lists, colors, links, images, code blocks…) with [Quill](https://quilljs.com/).
- Real-time, conflict-free collaboration with [Yjs](https://yjs.dev/) CRDTs.
- Live remote cursors and presence avatars.
- Offline-first: every document is saved locally and merges automatically on reconnect.
- Multiple documents per browser, import (`.txt`, `.html`), export (HTML, text) and print / PDF.
- Fully static build: host it anywhere (GitHub Pages, any static server on the LAN, etc.).

## How collaboration works without a server

WebRTC needs the two browsers to exchange a connection description ("signaling")
once. Instead of a signaling server, the exchange is done by hand:

1. **Invite**: the person who has the document clicks **Invite** and sends the
   generated link (or shows the QR code) to the other person.
2. **Join**: the other person opens the link; the app shows an **answer code**
   that they send back (chat, email, anything).
3. **Connect**: the inviter pastes the answer code and clicks **Connect**.

After that, data flows directly between both devices. Only local network
candidates are used (no STUN/TURN servers), so no traffic leaves the LAN.

Every participant can invite others. Each peer relays updates to the rest of its
connections, so participants form a tree and everybody stays in sync (e.g. A
invites B, B invites C: A and C see each other's edits through B).

Each invitation is single-use: create a new one for each person.

## Development

```bash
npm install
npm run dev       # serves on the LAN (vite --host)
npm run build     # static output in dist/
npm run preview   # serve the production build on the LAN
```

All devices must open the app from the **same URL** (same origin), because the
invitation link points to it.

## Deployment

`.github/workflows/pages.yml` builds and publishes `dist/` to GitHub Pages on
every push to `main` (enable *Settings → Pages → Source: GitHub Actions*).
The build uses relative paths, so any static host or subfolder works.

## Limitations

- Browsers hide local IPs behind mDNS (`*.local`) names; networks that block
  multicast (some corporate or guest Wi-Fi) may prevent the connection.
- Collaboration only happens while the connected tabs are open. If the
  person in the middle of a chain leaves, the others need a new invitation.
- Deleting a document only removes it from the current browser.

## Project structure

| File | Purpose |
| --- | --- |
| `src/main.ts` | UI wiring: editor, dialogs, file menu, presence. |
| `src/network.ts` | Yjs sync/awareness provider over WebRTC data channels, with relaying and chunking. |
| `src/signaling.ts` | Serverless signaling: offer/answer creation and compact encoding. |
| `src/store.ts` | Local document index and user identity. |
