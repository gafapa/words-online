// Common frame for every app: app bar (logo, title, menu bar, presence,
// share, user), toolbar row, main area and status bar.

import type { AppInfo } from '../apps/registry'
import { t } from '../core/i18n'
import { homePath } from '../core/router'
import { accessibilityButton } from './accessibility'

export interface Shell {
  menubar: HTMLElement
  toolbar: HTMLElement
  main: HTMLElement
  statusbar: HTMLElement
}

export function renderShell(app: AppInfo, root: HTMLElement): Shell {
  root.innerHTML = `
    <div class="app app-${app.type}">
      <header class="appbar">
        <div class="appbar-main">
          <a class="app-logo" href="${homePath()}" title="All documents" style="background:${app.color}">${app.letter}</a>
          <div class="title-block">
            <div class="title-row">
              <input id="doc-title" class="doc-title" aria-label="Title" spellcheck="false" />
              <span id="access-badge" class="access-badge" hidden></span>
              <span id="save-state" class="save-state"></span>
            </div>
            <nav id="menubar" class="menubar" aria-label="Menu"></nav>
          </div>
          <div class="appbar-actions">
            <span id="presence" class="presence" title="People in this document"></span>
            <span id="peer-status" class="status offline">Connecting…</span>
            <button id="btn-handin" class="handin-btn" title="${t('Download your work to hand it in')}">${t('Hand in')}</button>
            <button id="btn-share" class="primary share-btn">Share</button>
            <input id="user-name" class="user-name" aria-label="Your name" title="Your name, as others see it" />
          </div>
        </div>
        <div id="toolbar" class="toolbar" role="toolbar" aria-label="Formatting"></div>
      </header>
      <main id="app-main" class="app-main"></main>
      <footer id="statusbar" class="statusbar"></footer>
    </div>`
  root.querySelector('.appbar-actions')!.prepend(accessibilityButton())
  return {
    menubar: root.querySelector('#menubar')!,
    toolbar: root.querySelector('#toolbar')!,
    main: root.querySelector('#app-main')!,
    statusbar: root.querySelector('#statusbar')!,
  }
}
