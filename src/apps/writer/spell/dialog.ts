// "Spelling and grammar" dialog (F7): walks through the issues one by one from
// the cursor, like Word or LibreOffice. It is not modal, so the text can still
// be edited while it is open.

import { TextSelection } from '@tiptap/pm/state'
import { t } from '../../../core/i18n'
import { el } from '../../../ui/widgets'
import type { FoundIssue, SpellController } from './plugin'
import { LANGS, type Lang } from './types'
import { describe, kindLabel, langName, showReplacement } from './ui'

let open: HTMLDialogElement | null = null

export function spellingDialog(spell: SpellController): void {
  if (open) {
    open.querySelector<HTMLElement>('select, button')?.focus()
    return
  }
  const editor = spell.editor
  const editable = () => editor.isEditable
  const dialog = el('dialog', { class: 'spell-dialog' })
  dialog.setAttribute('aria-labelledby', 'spell-dialog-title')
  open = dialog

  const lang = el('select', { class: 'spell-lang', title: t('Document language') })
  for (const l of LANGS) lang.append(new Option(langName(l), l, false, l === spell.docLang()))
  lang.addEventListener('change', () => spell.setDocLang(lang.value as Lang))
  const close = el('button', { type: 'button', class: 'spell-close', textContent: '✕', title: t('Close') })
  close.setAttribute('aria-label', t('Close'))
  const kind = el('div', { class: 'spell-kind' })
  const message = el('div', { class: 'spell-message' })
  const context = el('div', { class: 'spell-context' })
  const change = el('input', { class: 'field' })
  const list = el('select', { size: 5 })
  list.setAttribute('aria-label', t('Suggestions'))
  const status = el('div', { class: 'spell-status', role: 'status' })
  const button = (label: string, action: () => void, primary = false) => {
    const b = el('button', { type: 'button', textContent: label, class: primary ? 'primary' : '' })
    b.addEventListener('click', action)
    return b
  }
  const bChange = button(t('Change'), () => apply(false), true)
  const bChangeAll = button(t('Change all'), () => apply(true))
  const bIgnore = button(t('Ignore'), () => act((f) => spell.ignoreOnce(f)))
  const bIgnoreAll = button(t('Ignore all'), () => act((f) => spell.ignoreAll(f)))
  const bAdd = button(t('Add to dictionary'), () => act((f) => spell.addToDictionary(f.text, f.lang)))
  const bNext = button(t('Next'), () => next(current ? current.to : cursor()))
  dialog.append(
    el('h2', { id: 'spell-dialog-title' }, t('Spelling and grammar'), lang, close),
    kind,
    message,
    context,
    el('div', { class: 'spell-row' }, el('div', {}, el('label', { class: 'field-label' }, t('Change to'), change), list), el('div', { class: 'spell-buttons' }, bChange, bChangeAll, bIgnore, bIgnoreAll, bAdd, bNext)),
    status,
  )
  document.body.append(dialog)
  dialog.show()

  let current: FoundIssue | null = null
  // Where the walk started; it wraps around the end of the document once.
  const start = editor.state.selection.from
  let wrapped = false
  const cursor = () => editor.state.selection.from

  const finish = () => {
    open = null
    unsubscribe()
    dialog.remove()
    editor.commands.focus()
  }
  close.addEventListener('click', finish)
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      finish()
    } else if (e.key === 'Enter' && e.target === change) {
      e.preventDefault()
      apply(false)
    }
  })
  list.addEventListener('change', () => (change.value = list.value))
  list.addEventListener('dblclick', () => apply(false))

  let visited = 0
  function show(found: FoundIssue | null) {
    current = found
    if (found) visited++
    const has = !!found
    for (const b of [bChange, bChangeAll, bIgnore, bIgnoreAll, bNext]) b.disabled = !has
    bAdd.disabled = !has || found!.issue.rule !== 'spelling'
    bIgnoreAll.textContent = found && found.issue.rule !== 'spelling' ? t('Ignore rule') : t('Ignore all')
    list.replaceChildren()
    change.value = ''
    if (!found) {
      kind.textContent = ''
      message.textContent = ''
      context.replaceChildren()
      return
    }
    if (!editable()) for (const b of [bChange, bChangeAll]) b.disabled = true
    kind.textContent = kindLabel(found)
    kind.className = `spell-kind ${found.issue.kind}`
    message.textContent = describe(found)
    // The sentence around the issue.
    const $pos = editor.state.doc.resolve(found.from)
    const blockStart = $pos.start()
    const text = $pos.parent.textBetween(0, $pos.parent.content.size, '\n', ' ')
    const a = found.from - blockStart
    const b = found.to - blockStart
    const before = text.slice(Math.max(0, a - 120), a)
    const after = text.slice(b, b + 120)
    const mark = el('mark', { class: found.issue.kind, textContent: text.slice(a, b) })
    context.replaceChildren((a > 120 ? '…' : '') + before, mark, after + (b + 120 < text.length ? '…' : ''))
    // Select it in the document so it can be seen.
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, found.from, found.to)).scrollIntoView())
    status.textContent = ''
    void spell.suggestions(found).then((suggestions) => {
      if (current !== found) return
      for (const s of suggestions.slice(0, 8)) list.append(new Option(showReplacement(s), s))
      if (!suggestions.length) list.append(Object.assign(new Option(t('(no suggestions)'), ''), { disabled: true }))
      else {
        list.selectedIndex = 0
        change.value = suggestions[0]
      }
      bChangeAll.disabled = !editable() || !suggestions.length && !change.value
    })
  }

  function next(from: number) {
    const issues = spell.issues()
    let found = issues.find((i) => i.from >= from && !(current && i.from === current.from && i.to === current.to))
    if (found && wrapped && found.from >= start) found = undefined
    if (!found && !wrapped) {
      wrapped = true
      found = issues.find((i) => i.from < start)
    }
    if (found) return show(found)
    show(null)
    if (spell.busy) {
      status.textContent = t('Checking…')
      setTimeout(() => open === dialog && !current && next(from), 400)
    } else status.textContent = visited ? t('The check is complete.') : t('No spelling or grammar issues found.')
  }

  function act(fn: (found: FoundIssue) => void) {
    const found = current
    if (!found) return
    fn(found)
    next(found.to)
  }

  function apply(all: boolean) {
    const found = current
    if (!found || !editable()) return
    const value = change.value
    if (all) spell.replaceAll(found, value)
    else spell.replace(found, value)
    const pos = editor.state.selection.to
    next(Math.max(pos, found.from))
  }

  const unsubscribe = spell.onChange(() => {
    // New results may bring issues after an empty walk.
    if (!current && open === dialog && status.textContent === t('Checking…')) next(cursor())
  })
  next(cursor())
}
