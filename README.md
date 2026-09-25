# Words Online

A collaborative office suite that runs entirely in the browser, with no server
of its own. One static build hosts every app; documents live in each browser
(IndexedDB) and edits travel directly between browsers over WebRTC. Public
Nostr relays (WebSockets) are only used as a meeting point for browsers to
find each other.

| App | Status |
| --- | --- |
| Word processor (`writer`) | Available |
| Spreadsheet (`sheet`) | Available |
| Drawing (`draw`) | Available |
| Diagram (`diagram`) | Available |

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

## Spreadsheet

- Built on [Univer](https://github.com/dream-num/univer) (Apache-2.0, open-source presets only):
  multiple sheets, formulas (hundreds of functions), number formats, styles,
  borders, merged cells, freeze panes, filters, sorting, conditional formatting,
  data validation, tables, hyperlinks, notes, images and find & replace.
- Real-time collaboration without a server (see below), with collaborators'
  selections shown in their color.
- Open and download **Excel (.xlsx)**, **OpenDocument (.ods)** and **CSV**;
  print / PDF of the current sheet.

### How spreadsheet sync works

Univer describes every change as a replayable *mutation*. The shared state is a
base snapshot plus an append-only log of mutations in a `Y.Array`; Yjs gives all
replicas the same log order, so replaying it always yields the same workbook.

- Local changes apply immediately and are appended to the log.
- If a concurrent change lands before local ones, edits of different cells are
  applied directly (order does not matter); anything else triggers a rebuild in
  the shared order, so replicas never diverge.
- Each entry records which changes its author had seen. An edit made without
  knowing about a concurrent row/column insertion or deletion is shifted before
  replaying, so it lands on the cell its author meant.
- Checkpoints (snapshot + covered entries) every 300 changes keep loading fast.

## Drawing

- Built on [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT): shapes,
  arrows that bind to shapes, freehand, text, images, frames, libraries, hand-drawn
  or clean style, light/dark theme.
- Collaborators' pointers and selections, live.
- Open and download `.excalidraw`; download PNG and SVG.
- Sync: each element is a value in a shared `Y.Map` (deleted elements stay as
  tombstones); local edits are detected with Excalidraw's per-element version and
  remote edits never enter the local undo history. Fonts are served locally.

## Diagrams

- Our own editor built on [maxGraph](https://github.com/maxGraph/maxGraph)
  (Apache-2.0, the TypeScript successor of mxGraph, the engine behind draw.io),
  about 170 KB gzipped and loaded only when a diagram is opened.
- **draw.io compatible**: opens and downloads `.drawio` files (compressed or
  not, multiple pages, user objects) with the same style strings, so diagrams
  move between both editors. Pasting draw.io XML also works.
- Shapes and markers ported from draw.io (general, flowchart, UML, entity
  relation, basic, arrows and connectors) in a searchable shape panel; click
  to insert or drag onto the canvas or into a container.
- **More shapes**: draw.io's other shape libraries (AWS, Azure, Google Cloud,
  IBM, Cisco, Kubernetes, network, BPMN, ArchiMate, C4, SysML, UML 2.5, floor
  plans, mockups, electrical, P&ID, racks, and more: 62 entries, about 14,000
  shapes) can be enabled from *View → More shapes…* or the button under the
  shape panel. They are generated at build time from the pinned draw.io release
  (`scripts/build-diagram-libs.mjs`) and downloaded only when used: a library
  when it is enabled, the stencils and shape code of a diagram when it is
  opened (so files using them render as in draw.io). Everything used once is
  cached and keeps working offline.
- **Hand-drawn style** (draw.io's `sketch=1`, drawn with rough.js with the same
  per-shape seed, fill styles such as hachure or zigzag) and a hand-drawn font,
  both available offline.
- Connection points, orthogonal/elbow/curved/entity-relation connectors, guides,
  rotation, grouping, containers, alignment and distribution, automatic layouts
  (tree, hierarchical, circle, organic), multiple pages, in-place label editing.
- Format panel (fill, gradient, line, pattern, opacity, shadow, text, arrows,
  position and size, raw style editing), context menu, keyboard shortcuts,
  copy/paste between diagrams (and images or text from other apps), zoom and pan.
- Download SVG and PNG (the selection or the whole page) and print / PDF.
- Collaborators' selections are highlighted, their pointers shown, and the page
  tabs show who is on each page.
- Sync is state-based: Yjs holds pages → cells → fields, so concurrent edits merge
  per field (one person moves a shape while another recolors it). Remote edits
  never enter the local undo history.

## Accessibility

The **Accessibility** button (app bar and home screen, or `Alt+Shift+A`) opens a
panel with per-user preferences. They are saved in this browser and apply to the
whole suite; nothing changes in the documents themselves.

- **Reading fonts**: OpenDyslexic or Atkinson Hyperlegible for the interface
  and, optionally, for document text in the word processor. The document text
  option is *display only*: saved fonts, downloads and printing are unchanged
  (page breaks on screen may move while it is on). Fonts are self-hosted and work
  offline.
- **Text size** of the suite's interface (100–200 %), **line and letter spacing**
  for reading documents (display only).
- **Themes**: light, dark, follow the system, high contrast dark and high
  contrast light (all text at least 7:1, verified). Document pages, sheets,
  drawings and diagram canvases keep their own colors so their content stays
  readable.
- **Reduce motion**, **large mouse pointer**, **thick focus outline**.
- **Reading ruler** or **focus mask** that follows the pointer and, in text
  editors, the text cursor.
- **Read aloud** (`Alt+Shift+R`): reads the selection, or the paragraph with the
  cursor, or the whole document, with the browser's voices. The language
  (Spanish, Galician, English) is detected from the text; when no Galician voice
  is installed it reads with a Spanish one and says so. The word being read is
  highlighted without touching the document.
- **Dictation** (`Alt+Shift+D`): writes what you say at the text cursor of the
  word processor, a diagram label, a spreadsheet cell being edited or any text
  field. It uses the browser's speech recognition (Chrome, Edge), which needs an
  internet connection; the panel says when it is unavailable or offline.
- **Keyboard**: a *Skip to content* link, `F10` (or `Alt+Shift+M`) focuses the
  menu bar; arrow keys, `Enter` and `Escape` work in menus, submenus and toolbar
  pop-ups, and focus returns to the document. Dialogs, menus and toolbar buttons
  carry ARIA roles and names.

## Offline and installable

Words Online is a Progressive Web App: install it from the browser (address bar
or menu → *Install*) and it works without a connection for individual work.

- A service worker precaches the suite and every app, so after the first visit
  everything works offline; the home screen shows when it is ready.
- Documents always live in the browser (IndexedDB), so creating, editing,
  opening and downloading files needs no network. Collaboration resumes by itself
  when peers are reachable again, and offline edits merge automatically.
- When installed, the app registers as a handler for `.docx`, `.odt`, `.xlsx`,
  `.ods`, `.csv`, `.drawio` and `.excalidraw` files ("Open with").
- Updates are picked up automatically on the next visit.

## How collaboration works

1. Click **Share**, pick a link (*Can edit*, *Can comment*, *Can view* or
   *Makes a copy*) and send it (or show the QR code).
2. Whoever opens it joins the document; edits sync in real time.

```
 Browser A ◄──── WebRTC (direct, encrypted) ────► Browser B
     │                                                │
     └──── Nostr relays (public WebSockets) ──────────┘
           only to find each other and exchange connection offers
```

- Links look like `…/#app=writer&doc=<id>&key=<secret>&edit=<edit key>`. The
  fragment after `#` is never sent to any server, and routing works on any
  static host.
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

### Permissions (edit, comment, view)

Permissions are enforced with signatures, not only in the interface
(`src/core/keys.ts`, `src/core/network.ts`):

- Every new document has an Ed25519 *edit key* (WebCrypto); the *comment key*
  is derived from it. The edit link carries the edit key; the comment link the
  comment key plus the public edit key; the view link only the two public
  keys. All links also carry the room key, needed to connect.
- Editors sign every change they send. Peers apply document changes only when
  they are signed with the edit key, and comments (a separate shared document,
  `session.commentsDoc`) only when signed with the comment key. State sent to a
  newcomer is signed too, so nothing unsigned is ever accepted.
- Viewers and commenters forward signed changes verbatim and keep them in a
  signed log (IndexedDB), so they can pass the document on even when no editor
  is online. Editors regularly send a signed checkpoint that keeps that log short.
- Access comes from the keys a link holds: editing a view link's URL cannot
  turn it into an edit link, and a change forced from the browser's developer
  tools stays in that browser. A link whose keys do not match the document is
  refused.
- The home screen marks documents you can only view or comment on.
- Documents created before permission links (links without keys) keep working
  as before: every link can edit. Make a copy to get permission links.
- Permission links need a secure origin (https or localhost). On plain http
  new documents are created without keys.

### Copies and template links

- **File → Make a copy** creates a private copy in this browser (new keys, full
  edit, no history or comments) titled "Copy of …".
- The *Makes a copy* share link (`…&copy=1`) gives everyone who opens it their
  own copy, e.g. a worksheet for each student. The page waits until the content
  arrives from someone who has the document open (the teacher's browser, or
  anyone who viewed it before), explains the wait if it takes long, then opens
  the copy.

### Hand in

The **Hand in** button (next to Share) downloads, in one click, a ZIP named
`<your name> - <title>.zip` with the document in its original formats and a
`README.txt` (title, author, date): `.odt` + `.docx` (documents), `.ods` +
`.xlsx` (spreadsheets), `.excalidraw` + `.png` (drawings), `.drawio` + PNG and
SVG of every page (diagrams). It then offers *Print / Save as PDF*.

### Version history

- Versions are stored in the document (`versions` array), so every
  collaborator sees them. Editors save one automatically at most every 10
  minutes while editing, and named ones with **File → Save version…**.
- **File → Version history…** lists them (time, author, name). Anyone can open a
  version as a new copy; editors can restore one for everyone (the current
  state is saved first).
- Named versions are kept; automatic ones are thinned out (the latest ten, then
  one per day).
- An `authors` map in the document records who edited (name and color per
  Yjs client).

## Architecture

```
src/
  main.ts            Router: home screen or app, loaded with dynamic import()
  core/              Shared, UI-free building blocks
    offline.ts       Service worker registration
    router.ts        #app=…&doc=…&key=… parsing and links
    session.ts       Y.Doc + IndexedDB + awareness + P2P room for a document, access level
    keys.ts          Permission keys in links, Ed25519 signing
    network.ts       Yjs sync/awareness provider over Trystero (WebRTC + Nostr), signed sync
    store.ts         Local document index (id, key, type, title, access) and user identity
    copy.ts          Copies of documents, template links
    versions.ts      Version history, generic restore
    handin.ts        Hand in (ZIP), printing
    idb.ts           Small IndexedDB key-value store (signed logs)
    formats.ts       Format helpers: XML, colors, units, images
  ui/                Shared UI so every app looks the same
    shell.ts         App frame: app bar, menu bar, toolbar row, status bar
    chrome.ts        Title, presence, connection status, share dialog + QR, hand in
    versions.ts      Make a copy / Save version / Version history (File menu items)
    widgets.ts       Menus, context menus, popovers, color palette, dialogs, toasts
    base.css
  home/              Home screen: new document buttons, open file, recent documents
  apps/
    registry.ts      App list: name, icon, loader, supported files
    draw/            Drawing (Excalidraw + Yjs element sync)
    diagram/         Diagrams (maxGraph)
      app.ts         Editor in the shell: menus, toolbar, keyboard, clipboard, pages, files
      graph.ts       maxGraph set up like draw.io; cells <-> plain records
      model.ts       Plain diagram model shared by the editor, sync and converters
      sync.ts        Pages/cells/fields in Yjs <-> graph model
      presence.ts    Remote selections and pointers
      sidebar.ts     Shape panel; palette.ts holds the libraries
      libraries.ts   draw.io's libraries on demand: "More shapes", stencils, shape code
      format.ts      Format panel
      export.ts      SVG / PNG rendering
      shapes/        draw.io shapes, markers, perimeters, stencils and stylesheet;
                     compat.ts runs draw.io's shape code (mxGraph API) on maxGraph
      formats/       .drawio import and export (loaded on demand)
    sheet/           Spreadsheet
      app.ts         Univer in the shell: menus, file actions, presence, printing
      univer.ts      Univer presets and locales
      sync.ts        Mutation log over Yjs, rebuilds and checkpoints
      transform.ts   Shifts concurrent edits through row/column changes
      print.ts       Print layout of the current sheet
      formats/       XLSX / ODS / CSV import and export (loaded on demand)
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

`npm run dev` and `npm run build` first run `npm run prepare:assets`, which
copies Excalidraw's fonts into `public/excalidraw` and builds draw.io's shape
libraries into `public/diagram-libs` (both generated, not committed). The
libraries come from the draw.io release pinned in `scripts/drawio.json`
(downloaded once into `node_modules/.cache`, checked against its SHA-256);
`DRAWIO_WAR_DIR=<unpacked draw.war>` uses a local copy instead, and `FORCE=1`
rebuilds.

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
- Documents created with the earlier Quill-based version are not migrated, nor
  diagrams made with the earlier embedded draw.io version.
- Diagrams: draw.io's shape libraries are included except the few that need
  its editor (layout containers of *Advanced*); shapes whose code is not
  available render as rectangles but are kept in the file. Shape-specific
  editing handles (e.g. dragging a BPMN or mockup parameter) are not available
  for library shapes. Library images are not embedded in SVG/PNG downloads.
  No Visio import; math and custom web fonts are not rendered.
- Credits: the "More shapes" libraries are draw.io's (JGraph Ltd / draw.io AG):
  the code and palettes are Apache-2.0; the stencils and icons carry an extra
  restriction (they may not be used in, or distributed for, Atlassian products
  or its marketplace; diagrams made with them are not affected). The generated
  `diagram-libs/` folder keeps that `LICENSE` and a `NOTICE`.
- Spreadsheet: the app bundle is large (~2 MB gzipped, loaded only when a sheet
  is opened). Univer's paid features (charts, pivot tables, native printing,
  official collaboration server) are not used. The mutation log is never
  pruned, so very long-lived sheets keep growing in storage (checkpoints keep
  loading fast).
