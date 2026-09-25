# Words Online

A collaborative office suite that runs entirely in the browser, with no server
of its own. One static build hosts every app; documents live in each browser
(IndexedDB) and edits travel directly between browsers over WebRTC. Public
Nostr relays (WebSockets) are only used as a meeting point for browsers to
find each other.

| App | Status |
| --- | --- |
| Word processor (`writer`) | Available |
| Spreadsheet (`sheet`) | Planned |
| Drawing (`draw`) | Planned |
| Diagram (`diagram`) | Planned |

## Word processor

- Print layout with real pages: paper size (A4, A5, Letter, Legal), orientation
  and margins, page breaks, header and footer with page number / page count,
  footnotes at the foot of each page, zoom, and printing / PDF that matches the
  screen.
- Menu bar (File, Edit, View, Insert, Format, Table, Help), classic toolbar,
  context menu, status bar (page X of Y, words, characters) and keyboard shortcuts.
- Paragraph styles (Normal, Title, Subtitle, Headings), fonts, sizes in points,
  bold/italic/underline/strike, sub/superscript, text and highlight colors,
  alignment, line spacing, indentation, bulleted/numbered/check lists, quotes,
  code blocks, links, images (paste, drop, resize), special characters.
- Tables with merged cells, header rows, cell backgrounds and resizable columns.
- Find & replace, word count.
- **Word (.docx) and OpenDocument (.odt)**: open and download with headings,
  styles, lists, tables (merged cells, widths), images, footnotes, header/footer
  fields and page setup. Also opens `.html`, `.txt` and `.md`.
- Real-time collaboration with live cursors, presence and offline editing.

## How collaboration works

1. Click **Share** and send the link (or show the QR code).
2. Whoever opens it joins the document; edits sync in real time.

```
 Browser A ◄──── WebRTC (direct, encrypted) ────► Browser B
     │                                                │
     └──── Nostr relays (public WebSockets) ──────────┘
           only to find each other and exchange connection offers
```

- Links look like `…/#app=writer&doc=<id>&key=<secret>`. The fragment after `#`
  is never sent to any server, and routing works on any static host.
- Signaling goes through [Trystero](https://github.com/dmotz/trystero) over
  several public Nostr relays at once. Offers are encrypted with the document
  key, so only people with the link can connect.
- Document data travels over WebRTC data channels (DTLS-encrypted). Every peer
  relays updates to its other peers, so everyone converges even if one pair of
  browsers cannot connect directly.
- There is no central copy: at least one other participant must be online to
  receive changes; offline edits merge the next time they meet.

To use your own Nostr relays, add them to the URL (share links keep it):
`https://your-host/?relays=wss://relay1.example,wss://relay2.example`

## Architecture

```
src/
  main.ts            Router: home screen or app, loaded with dynamic import()
  core/              Shared, UI-free building blocks
    router.ts        #app=…&doc=…&key=… parsing and links
    session.ts       Y.Doc + IndexedDB + awareness + P2P room for a document
    network.ts       Yjs sync/awareness provider over Trystero (WebRTC + Nostr)
    store.ts         Local document index (id, key, type, title) and user identity
    formats.ts       Format helpers: XML, colors, units, images
  ui/                Shared UI so every app looks the same
    shell.ts         App frame: app bar, menu bar, toolbar row, status bar
    chrome.ts        Title, presence, connection status, share dialog + QR
    widgets.ts       Menus, context menus, popovers, color palette, dialogs, toasts
    base.css
  home/              Home screen: new document buttons, open file, recent documents
  apps/
    registry.ts      App list: name, icon, loader, supported files
    writer/          Word processor
      app.ts         Editor, print layout, zoom, status bar, file actions
      commands.ts    Menus, toolbar, context menu
      dialogs.ts     Page setup, header/footer, footnotes, links, tables…
      pages.ts       Pagination (pages, headers/footers, footnotes)
      find.ts        Find & replace
      editor/        TipTap extensions and custom nodes
      formats/       DOCX / ODT import and export (loaded on demand)
```

Each app and each converter is a separate chunk, loaded only when used.

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

- Public relays are community-run with no guarantees; several are used at once.
- Some restrictive networks can block direct WebRTC connections between
  different networks. No TURN server is configured.
- Pagination moves whole blocks to the next page (paragraphs are not split
  across pages); a block taller than a page overflows.
- Word/ODT: only the default header/footer, a single section, plain-text
  footnotes; text boxes, comments and floating shapes are not imported.
  Legacy `.doc` is not supported.
- Documents created with the earlier Quill-based version are not migrated.
