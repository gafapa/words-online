// Home screen: create documents of every type, open files and list the
// documents stored in this browser.

import { ALL_ACCEPT, APPS, appForFile, appInfo, type AppInfo } from '../apps/registry'
import { docPath, newDocPath } from '../core/router'
import { isOfflineCapable, whenOfflineReady } from '../core/offline'
import { t } from '../core/i18n'
import * as store from '../core/store'
import { accessibilityButton } from '../ui/accessibility'
import { el, showContextMenu, toast } from '../ui/widgets'
import './home.css'

type Filter = store.DocType | 'all'

export function mountHome(root: HTMLElement): void {
  document.title = 'Words Online'
  const user = store.loadUser()
  let filter: Filter = 'all'
  let query = ''

  const nameInput = el('input', { class: 'user-name', value: user.name, title: 'Your name, as others see it' })
  nameInput.setAttribute('aria-label', 'Your name')
  nameInput.style.borderColor = user.color
  nameInput.addEventListener('change', () => {
    user.name = nameInput.value.trim() || user.name
    nameInput.value = user.name
    store.saveUser(user)
  })

  const fileInput = el('input', { type: 'file', hidden: true })
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file) return
    try {
      const target = await appForFile(file)
      if (!target) return toast('This file type is not supported yet')
      toast('Opening…')
      location.href = await target.module.importFile(file)
    } catch (err) {
      toast(`Could not open the file: ${(err as Error).message}`)
    }
  })
  const openButton = el('button', { type: 'button', class: 'home-open', textContent: 'Open file…' })
  fileInput.accept = ALL_ACCEPT
  openButton.addEventListener('click', () => fileInput.click())

  const newCards = el(
    'div',
    { class: 'new-cards' },
    ...APPS.map((app) => {
      const card = el(
        'a',
        { class: `new-card${app.load ? '' : ' disabled'}`, href: app.load ? newDocPath(app.type) : '#', title: app.load ? app.newLabel : 'Coming soon' },
        appIcon(app, 'large'),
        el('span', { class: 'new-label', textContent: app.newLabel }),
        app.load ? null : el('span', { class: 'soon', textContent: 'Coming soon' }),
      )
      if (!app.load) card.addEventListener('click', (e) => e.preventDefault())
      return card
    }),
  )

  const search = el('input', { class: 'home-search', type: 'search', placeholder: 'Search documents' })
  search.setAttribute('aria-label', 'Search documents')
  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase()
    renderList()
  })

  const filters = el('div', { class: 'home-filters', role: 'tablist' })
  const filterOptions: [Filter, string][] = [['all', 'All'], ...APPS.map((a) => [a.type, `${a.name}s`] as [Filter, string])]
  const renderFilters = () =>
    filters.replaceChildren(
      ...filterOptions.map(([value, label]) => {
        const b = el('button', { type: 'button', class: `chip${filter === value ? ' active' : ''}`, textContent: label })
        b.setAttribute('role', 'tab')
        b.setAttribute('aria-selected', String(filter === value))
        b.addEventListener('click', () => {
          filter = value
          renderFilters()
          renderList()
        })
        return b
      }),
    )

  const list = el('div', { class: 'doc-table', role: 'list' })
  const renderList = () => {
    const docs = store
      .listDocs()
      .filter((d) => filter === 'all' || d.type === filter)
      .filter((d) => !query || (d.title || appInfo(d.type).untitled).toLowerCase().includes(query))
    if (!docs.length) {
      list.replaceChildren(
        el('p', {
          class: 'empty',
          textContent: query || filter !== 'all' ? 'No matching documents.' : 'No documents yet. Create one above or open a file.',
        }),
      )
      return
    }
    list.replaceChildren(
      ...docs.map((d) => {
        const app = appInfo(d.type)
        const href = docPath(d.type, d.id, d.key)
        const more = el('button', { type: 'button', class: 'row-more', title: 'More actions', textContent: '⋮' })
        more.setAttribute('aria-label', 'More actions')
        const row = el(
          'a',
          { class: 'doc-row', href, role: 'listitem' },
          appIcon(app, 'small'),
          el(
            'span',
            { class: 'doc-name', textContent: d.title || app.untitled },
            d.access === 'view' || d.access === 'comment'
              ? el('span', { class: 'access-tag', textContent: d.access === 'view' ? t('View only') : t('Can comment') })
              : null,
          ),
          el('span', { class: 'doc-type', textContent: app.name }),
          el('span', { class: 'doc-date', textContent: formatDate(d.updated), title: new Date(d.updated).toLocaleString() }),
          more,
        )
        const actions = () => [
          { label: 'Open', run: () => (location.href = href) },
          { label: 'Open in new tab', run: () => window.open(href, '_blank') },
          '-' as const,
          {
            label: 'Remove from this browser',
            run: async () => {
              if (!confirm(`Remove "${d.title || app.untitled}" from this browser? Collaborators keep their copies.`)) return
              await store.deleteDoc(d.id)
              renderList()
            },
          },
        ]
        more.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          const rect = more.getBoundingClientRect()
          showContextMenu(rect.left - 180, rect.bottom, actions())
        })
        row.addEventListener('contextmenu', (e) => {
          e.preventDefault()
          showContextMenu(e.clientX, e.clientY, actions())
        })
        return row
      }),
    )
  }

  root.replaceChildren(
    el(
      'div',
      { class: 'home' },
      el(
        'header',
        { class: 'home-bar' },
        el('span', { class: 'home-logo', textContent: 'W' }),
        el('h1', { textContent: 'Words Online' }),
        el('span', { class: 'spacer' }),
        offlineControl(),
        accessibilityButton(true),
        nameInput,
      ),
      el(
        'section',
        { class: 'home-new' },
        el('div', { class: 'home-inner' }, el('div', { class: 'home-section-title' }, el('h2', { textContent: 'Start something new' }), openButton, fileInput), newCards),
      ),
      templatesSection(),
      el(
        'section',
        { class: 'home-recent' },
        el(
          'div',
          { class: 'home-inner' },
          el('div', { class: 'home-section-title' }, el('h2', { textContent: 'Recent documents' }), search),
          filters,
          list,
          el('p', {
            class: 'hint',
            textContent:
              'Documents are stored in this browser. Share a document to edit it with others in real time; edits travel directly between browsers.',
          }),
        ),
      ),
    ),
  )
  renderFilters()
  renderList()
  handleLaunchedFiles()
  // Titles and new documents from other tabs.
  window.addEventListener('storage', renderList)
}

// Template gallery, loaded as a separate chunk (src/templates).
function templatesSection(): HTMLElement {
  const inner = el('div', { class: 'home-inner' })
  import('../templates/gallery')
    .then(({ mountTemplates }) => mountTemplates(inner))
    .catch(() => inner.replaceChildren())
  return el('section', { class: 'home-templates' }, inner)
}

function appIcon(app: AppInfo, size: 'small' | 'large'): HTMLElement {
  const icon = el('span', { class: `app-icon ${size}`, textContent: app.letter })
  icon.style.background = app.color
  return icon
}

function formatDate(time: number): string {
  const date = new Date(time)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

// Offline status: the whole suite is precached by the service worker.
function offlineControl(): HTMLElement {
  const wrap = el('span', { class: 'offline-control' })
  if (!isOfflineCapable()) return wrap
  wrap.append(el('span', { class: 'offline-pending', textContent: 'Preparing offline use…' }))
  whenOfflineReady()
    .then(() => wrap.replaceChildren(el('span', { class: 'offline-ready', textContent: '✓ Available offline', title: 'All apps work without a connection' })))
    .catch(() => wrap.replaceChildren())
  return wrap
}

// Files opened with the installed app from the operating system ("Open with").
function handleLaunchedFiles(): void {
  const launchQueue = (window as unknown as { launchQueue?: { setConsumer(cb: (params: { files: FileSystemFileHandle[] }) => void): void } }).launchQueue
  launchQueue?.setConsumer(async ({ files }) => {
    const handle = files?.[0]
    if (!handle) return
    try {
      const file = await handle.getFile()
      const target = await appForFile(file)
      if (!target) return toast('This file type is not supported yet')
      toast('Opening…')
      location.href = await target.module.importFile(file)
    } catch (err) {
      toast(`Could not open the file: ${(err as Error).message}`)
    }
  })
}
