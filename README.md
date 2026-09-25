# Words Online

A collaborative rich-text editor that runs entirely in the browser, with no
server of its own. Documents live in each browser (IndexedDB) and edits travel
directly between browsers over WebRTC. Public Nostr relays (WebSockets) are
only used as a meeting point for browsers to find each other.

## Features

- Rich-text editing (headings, fonts, sizes, colors, lists, alignment, links, images, code…) with [Quill](https://quilljs.com/).
- Tables: insert from a size grid, add/delete rows and columns, inline formatting inside cells.
- Real-time, conflict-free collaboration with [Yjs](https://yjs.dev/) CRDTs, live cursors and presence.
- Share by link or QR code: no accounts, no manual code exchange.
- Offline-first: every document is saved locally and merges automatically when peers reconnect.
- **Word (.docx) and OpenDocument (.odt)**: open and download, preserving headings,
  bold/italic/underline/strike, sub/superscript, colors, highlight, font size,
  alignment, indentation, nested lists, links, quotes, code blocks, images and tables.
- Also opens `.html`, `.txt` and `.md`; downloads HTML and text; print / save as PDF.
- Fully static build: host it anywhere (GitHub Pages, any static host, a local folder served over HTTP).

## How collaboration works

1. Click **Share** and send the link (or show the QR code).
2. Whoever opens it joins the document; edits sync in real time.

```
 Browser A ◄──── WebRTC (direct, encrypted) ────► Browser B
     │                                                │
     └──── Nostr relays (public WebSockets) ──────────┘
           only to find each other and exchange connection offers
```

- The link looks like `…/#doc=<id>&key=<secret>`. The fragment after `#` is
  never sent to any server.
- Signaling goes through [Trystero](https://github.com/dmotz/trystero) over
  several public Nostr relays at once (redundancy). Offers are encrypted with
  the document key, so only people with the link can connect.
- Document data never goes through the relays: it travels over WebRTC data
  channels (DTLS-encrypted). On the same network the traffic stays local.
- Every peer relays updates to its other peers, so everyone converges even if
  one pair of browsers cannot connect directly.
- There is no central copy: the document exists in the browsers that opened it.
  At least one other participant must be online to receive changes; offline
  edits merge the next time they meet.

### Custom relays

To use your own Nostr relays (e.g. on an isolated network), add them to the URL:

```
https://your-host/?relays=wss://relay1.example,wss://relay2.example
```

Share links keep this parameter.

## Development

```bash
npm install
npm run dev       # dev server, reachable on the LAN
npm run build     # type-check and build into dist/
npm run preview   # serve the production build
```

## Deployment

`.github/workflows/pages.yml` builds and publishes `dist/` to GitHub Pages on
every push to `main` (enable *Settings → Pages → Source: GitHub Actions*).
The build uses relative paths, so any static host or subfolder works.

## Limitations

- Public relays are community-run with no guarantees; several are used at once
  to reduce the impact of any one being down.
- Some restrictive networks (strict corporate firewalls, symmetric NAT) can
  block direct WebRTC connections between different networks. No TURN server
  is configured.
- Table cells hold a single paragraph (Quill tables): on import, multi-paragraph
  cells are joined, merged cells are split into empty cells and nested tables
  are flattened into text. Cell alignment, borders and widths are not kept.
- Word/ODT import ignores headers/footers, footnotes, comments and page layout.
  Legacy `.doc` is not supported.

## Project structure

| File | Purpose |
| --- | --- |
| `src/main.ts` | UI wiring: editor, share dialog, file menu, presence, status. |
| `src/network.ts` | Yjs sync/awareness provider over Trystero (WebRTC + Nostr signaling). |
| `src/table-ui.ts` | Toolbar popover to insert tables and edit rows/columns. |
| `src/store.ts` | Local document index (ids, keys, titles) and user identity. |
| `src/formats/model.ts` | Normalized document model shared by importers/exporters (Delta ↔ lines). |
| `src/formats/docx.ts`, `docx-import.ts` | Word export (via `docx`) and import (WordprocessingML parser). |
| `src/formats/odt.ts`, `odt-import.ts` | OpenDocument export and import. |
| `src/formats/index.ts` | Open/download entry points; converters are loaded on demand. |
