// Home screen: create documents of every type, open files and list the
// documents stored in this browser.

import { ALL_ACCEPT, APPS, appForFile, appInfo, SUITE, type AppInfo } from '../apps/registry'
import { docPath, newDocPath } from '../core/router'
import { isOfflineCapable, whenOfflineReady } from '../core/offline'
import { languageSelect, locale, t } from '../core/i18n'
import * as store from '../core/store'
import { accessibilityButton } from '../ui/accessibility'
import { brandMark } from '../ui/brand'
import { helpMenuItems } from '../ui/menus'
import { openAccountDialog, openFromNextcloud } from '../ui/nextcloud'
import { registerShortcuts, showShortcuts } from '../ui/shortcuts'
import { confirmDialog, el, icon, showContextMenu, toast, uiZoom } from '../ui/widgets'
import { CircleHelp, Cloud } from 'lucide'
import './home.css'

type Filter = store.DocType | 'all'

export function mountHome(root: HTMLElement): void {
  document.title = SUITE
  const user = store.loadUser()
  let filter: Filter = 'all'
  let query = ''

  const nameInput = el('input', { class: 'user-name', value: user.name, title: t('Your name, as others see it') })
  nameInput.setAttribute('aria-label', t('Your name'))
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
      if (!target) return toast(t('This file type is not supported yet'))
      toast(t('Opening…'))
      location.href = await target.module.importFile(file)
    } catch (err) {
      toast(t('Could not open the file: {message}', { message: (err as Error).message }))
    }
  })
  const openButton = el('button', { type: 'button', class: 'home-open', textContent: t('Open file…') })
  fileInput.accept = ALL_ACCEPT
  openButton.addEventListener('click', () => fileInput.click())

  // Nextcloud: open files from it, account settings (needs a connection).
  const cloudOpen = el('button', { type: 'button', class: 'home-open', textContent: t('Open from Nextcloud…') })
  cloudOpen.addEventListener('click', () => void openFromNextcloud())
  const cloudButton = el('button', { type: 'button', class: 'home-cloud', title: t('Nextcloud account') }, icon(Cloud, 18), el('span', { class: 'btn-label', textContent: 'Nextcloud' }))
  cloudButton.setAttribute('aria-label', t('Nextcloud account'))
  cloudButton.addEventListener('click', () => void openAccountDialog())
  const renderOnline = () => {
    cloudOpen.disabled = !navigator.onLine
    cloudOpen.title = navigator.onLine ? t('Open a file from your Nextcloud') : t('You are offline. Nextcloud can be used again when you are connected.')
  }
  window.addEventListener('online', renderOnline)
  window.addEventListener('offline', renderOnline)
  renderOnline()

  const newCards = el(
    'div',
    { class: 'new-cards' },
    ...APPS.map((app) => {
      const card = el(
        'a',
        { class: `new-card${app.load ? '' : ' disabled'}`, href: app.load ? newDocPath(app.type) : '#', title: app.load ? app.newLabel : t('Coming soon') },
        appIcon(app, 'large'),
        el('span', { class: 'new-label', textContent: app.newLabel }),
        app.load ? null : el('span', { class: 'soon', textContent: t('Coming soon') }),
      )
      if (!app.load) card.addEventListener('click', (e) => e.preventDefault())
      return card
    }),
  )

  const search = el('input', { class: 'home-search', type: 'search', placeholder: t('Search documents') })
  search.setAttribute('aria-label', t('Search documents'))
  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase()
    renderList()
  })

  const filters = el('div', { class: 'home-filters', role: 'tablist' })
  const filterOptions: [Filter, string][] = [['all', t('All')], ...APPS.map((a) => [a.type, a.plural] as [Filter, string])]
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
          textContent: query || filter !== 'all' ? t('No matching documents.') : t('No documents yet. Create one above or open a file.'),
        }),
      )
      return
    }
    list.replaceChildren(
      ...docs.map((d) => {
        const app = appInfo(d.type)
        const href = docPath(d.type, d.id, d.key)
        const more = el('button', { type: 'button', class: 'row-more', title: t('More actions'), textContent: '⋮' })
        more.setAttribute('aria-label', t('More actions'))
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
            d.remote ? el('span', { class: 'cloud-tag', textContent: 'Nextcloud', title: d.remote.path }) : null,
          ),
          el('span', { class: 'doc-type', textContent: app.name }),
          el('span', { class: 'doc-date', textContent: formatDate(d.updated), title: new Date(d.updated).toLocaleString(locale) }),
          more,
        )
        const actions = () => [
          { label: t('Open'), run: () => (location.href = href) },
          { label: t('Open in new tab'), run: () => window.open(href, '_blank') },
          '-' as const,
          {
            label: t('Remove from this browser'),
            run: async () => {
              const question = t('Remove “{title}” from this browser? Collaborators keep their copies.', { title: d.title || app.untitled })
              if (!(await confirmDialog(t('Remove from this browser'), question, { confirmLabel: t('Remove'), danger: true }))) return
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
        el('span', { class: 'home-logo' }, brandMark(36)),
        el('h1', { textContent: SUITE }),
        el('span', { class: 'spacer' }),
        offlineControl(),
        cloudButton,
        languageSelect('home-language'),
        helpButton(),
        accessibilityButton(true),
        nameInput,
      ),
      el(
        'section',
        { class: 'home-new' },
        el('div', { class: 'home-inner' }, el('div', { class: 'home-section-title' }, el('h2', { textContent: t('Start something new') }), el('span', { class: 'home-open-buttons' }, openButton, cloudOpen), fileInput), newCards),
      ),
      templatesSection(),
      el(
        'section',
        { class: 'home-recent' },
        el(
          'div',
          { class: 'home-inner' },
          el('div', { class: 'home-section-title' }, el('h2', { textContent: t('Recent documents') }), search),
          filters,
          list,
          el('p', {
            class: 'hint',
            textContent:
              t('Documents are stored in this browser. Share a document to edit it with others in real time; edits travel directly between browsers.'),
          }),
        ),
      ),
    ),
  )
  renderFilters()
  renderList()
  handleLaunchedFiles()
  // The same keys as in the apps: Ctrl+O opens a file, Ctrl+/ and F1 the shortcuts.
  registerShortcuts({ open: () => fileInput.click(), save: null, help: () => void showShortcuts() })
  // Titles and new documents from other tabs.
  window.addEventListener('storage', renderList)
}

// Help menu of the home screen: the apps' Help items (shortcuts, accessibility, connection test, about).
function helpButton(): HTMLButtonElement {
  const button = el('button', { type: 'button', class: 'home-help', title: t('Help') }, icon(CircleHelp, 20))
  button.setAttribute('aria-label', t('Help'))
  button.setAttribute('aria-haspopup', 'menu')
  button.addEventListener('click', () => {
    const rect = button.getBoundingClientRect()
    const z = uiZoom()
    showContextMenu(rect.right - 240 * z, rect.bottom + 4, helpMenuItems(undefined, { shortcuts: () => void showShortcuts() }))
  })
  return button
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
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

// Offline status: the whole suite is precached by the service worker.
function offlineControl(): HTMLElement {
  const wrap = el('span', { class: 'offline-control' })
  if (!isOfflineCapable()) return wrap
  wrap.append(el('span', { class: 'offline-pending', textContent: t('Preparing offline use…') }))
  whenOfflineReady()
    .then(() => wrap.replaceChildren(el('span', { class: 'offline-ready', textContent: t('✓ Available offline'), title: t('All apps work without a connection') })))
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
      if (!target) return toast(t('This file type is not supported yet'))
      toast(t('Opening…'))
      location.href = await target.module.importFile(file)
    } catch (err) {
      toast(t('Could not open the file: {message}', { message: (err as Error).message }))
    }
  })
}
