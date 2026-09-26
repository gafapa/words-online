// Spelling and grammar in the word processor's interface: Tools menu, context
// menu, status bar and settings dialogs.

import { languages, t } from '../../../core/i18n'
import { el, showContextMenu, showDialog, toast, type MenuEntry, type MenuItem } from '../../../ui/widgets'
import type { FoundIssue, SpellController } from './plugin'
import { LANGS, type Lang } from './types'
import { personalWords } from './settings'
import './spell.css'

export const langName = (lang: Lang): string => languages.find((l) => l.code === lang)?.name ?? lang

// Explanation of an issue in the interface language (Harper and LanguageTool
// give their own messages).
export function describe(found: FoundIssue): string {
  const { issue } = found
  const v = { word: found.text, mark: issue.vars?.mark ?? '', fix: issue.replacements[0] ?? '' }
  if (issue.message) return issue.message
  switch (issue.rule) {
    case 'spelling': return t('“{word}” is not in the dictionary', v)
    case 'repeated-word': return t('Repeated word: “{word}”', v)
    case 'double-space': return t('Two or more spaces between words')
    case 'space-before-punctuation': return t('No space is needed before “{mark}”', v)
    case 'missing-space-after-punctuation': return t('Add a space after “{mark}”', v)
    case 'sentence-capital': return t('Sentences start with a capital letter')
    case 'es-a-ver-haber': return t('Confusion between “a ver” (to see) and “haber” (to have)')
    case 'es-echo-hecho': return t('Confusion between “echo” (from echar) and “hecho” (from hacer)')
    case 'es-halla-haya': return t('Use “haya” (from haber), not “halla” (from hallar)')
    case 'es-sino-si-no': return t('“sino” (but rather) and “si no” (if not) are different')
    case 'es-ahi-hay': return t('Confusion between “ahí” (there), “hay” (there is) and “ay” (ouch)')
    case 'es-a-ha': return t('The verb “haber” is written with h: “ha”, “he”')
    case 'es-tubo-tuvo': return t('“tuvo” (from tener) and “tubo” (a pipe) are different')
    case 'es-por-que': return t('In questions, “why” is written “por qué”')
    case 'es-dequeismo': return t('This verb takes “que” without “de”')
    case 'es-joined': return t('Write it as: “{fix}”', v)
    case 'es-preterite-s': return t('The past tense for “tú” has no final “s”')
    case 'es-question-exclamation': return t('Question and exclamation marks go in pairs: “{mark}” is missing', v)
    case 'gl-castelanismo': return t('Castilianism: in Galician, use “{fix}”', v)
    case 'gl-pero-mais': return t('Style: in formal Galician, “mais” is often preferred to “pero”')
    case 'fr-nbsp': return t('French typography: use a no-break space with “{mark}”', v)
    case 'fr-pleonasm': return t('Pleonasm: the extra words repeat the meaning')
    case 'de-das-dass': return t('After this verb, “dass” introduces the clause')
    case 'de-seit-seid': return t('“seit” (since) and “seid” (you are) are different')
    case 'de-als-wie': return t('After a comparative, use “als”')
    case 'de-fixed': return t('Standard spelling: “{fix}”', v)
    default: return t('Commonly confused words: check the suggestion')
  }
}

export function kindLabel(found: FoundIssue): string {
  return found.issue.kind === 'spelling' ? t('Spelling') : found.issue.kind === 'style' ? t('Style') : t('Grammar')
}

// Visible form of a replacement (spaces and deletions are hard to see).
export function showReplacement(text: string): string {
  if (!text) return t('(delete)')
  return text.replace(/ /g, '⍽').replace(/ /g, '⍽').replace(/^ $/, '␣')
}

export function openSpellDialog(spell: SpellController): void {
  void import('./dialog').then((d) => d.spellingDialog(spell))
}

export function toolsMenu(spell: SpellController): { label: string; items: MenuEntry[] } {
  const editable = () => spell.editor.isEditable
  return {
    label: t('Tools'),
    items: [
      { label: t('Spelling and grammar…'), shortcut: 'F7', run: () => openSpellDialog(spell) },
      '-',
      { label: t('Check spelling as you type'), run: () => spell.update({ spelling: !spell.settings.spelling }), active: () => spell.settings.spelling },
      { label: t('Check grammar as you type'), run: () => spell.update({ grammar: !spell.settings.grammar }), active: () => spell.settings.grammar },
      '-',
      {
        label: t('Language'),
        submenu: [
          ...LANGS.map((lang): MenuItem => ({ label: langName(lang), run: () => spell.setDocLang(lang), active: () => spell.docLang() === lang, enabled: editable })),
          '-',
          {
            label: t('Selected paragraphs'),
            submenu: [
              ...LANGS.map((lang): MenuItem => ({ label: langName(lang), run: () => setParagraphLang(spell, lang), enabled: editable })),
              '-',
              { label: t('Same as the document'), run: () => setParagraphLang(spell, null), enabled: editable },
            ],
          },
        ],
      },
      {
        label: t('Grammar'),
        submenu: [
          { label: t('Optional style suggestions'), run: () => spell.update({ optionalStyle: !spell.settings.optionalStyle }), active: () => spell.settings.optionalStyle },
          { label: t('Use a LanguageTool server…'), run: () => void languageToolDialog(spell), active: () => spell.settings.useLanguageTool },
        ],
      },
      { label: t('Personal dictionary…'), run: () => void personalDictionaryDialog(spell) },
    ],
  }
}

function setParagraphLang(spell: SpellController, lang: Lang | null) {
  spell.editor.chain().focus().setParagraphLanguage(lang).run()
}

// Context menu entries for an issue; empty when there is none at the position.
export async function contextMenuFor(spell: SpellController, pos: number, x: number, y: number, rest: MenuEntry[]): Promise<boolean> {
  if (!spell.enabled) return false
  const found = spell.issueAt(pos)
  if (!found) return false
  const editable = spell.editor.isEditable
  const suggestions = (await spell.suggestions(found)).slice(0, 5)
  const items: MenuEntry[] = []
  const classes: (string | null)[] = []
  const push = (item: MenuEntry, cls: string | null = null) => {
    items.push(item)
    if (item !== '-') classes.push(cls)
  }
  if (found.issue.rule !== 'spelling') push({ label: describe(found), enabled: () => false }, 'spell-note')
  for (const s of suggestions) push({ label: showReplacement(s), run: () => spell.replace(found, s), enabled: () => editable }, 'spell-suggestion')
  if (!suggestions.length) push({ label: t('(no suggestions)'), enabled: () => false })
  push('-')
  push({ label: t('Ignore'), run: () => spell.ignoreOnce(found) })
  if (found.issue.rule === 'spelling') {
    push({ label: t('Ignore all'), run: () => spell.ignoreAll(found) })
    push({ label: t('Add to dictionary'), run: () => spell.addToDictionary(found.text, found.lang) })
  } else push({ label: t('Ignore this kind of issue'), run: () => spell.ignoreAll(found) })
  push({ label: t('Spelling and grammar…'), shortcut: 'F7', run: () => openSpellDialog(spell) })
  showContextMenu(x, y, [...items, '-', ...rest])
  // Suggestions in bold, the explanation wrapped.
  const rows = document.querySelectorAll<HTMLElement>('.context-menu > .menu-row')
  classes.forEach((cls, i) => cls && rows[i]?.classList.add(cls))
  return true
}

// Status bar: document language and what the checker is doing.
export function mountStatus(spell: SpellController, statusbar: HTMLElement): void {
  const button = el('button', { type: 'button', class: 'status-lang hide-narrow' })
  const spacer = statusbar.querySelector('.spacer')
  statusbar.insertBefore(button, spacer)
  const render = () => {
    const lang = langName(spell.docLang())
    const loading = spell.loading.size > 0
    button.textContent = !spell.enabled ? lang : loading ? t('{language} · loading dictionary…', { language: lang }) : lang
    button.title = t('Document language (Tools → Language)')
  }
  button.addEventListener('click', () => {
    const rect = button.getBoundingClientRect()
    showContextMenu(rect.left, rect.top, LANGS.map((lang) => ({ label: langName(lang), run: () => spell.setDocLang(lang), active: () => spell.docLang() === lang, enabled: () => spell.editor.isEditable })))
  })
  spell.onChange(render)
  render()
}

export async function languageToolDialog(spell: SpellController): Promise<void> {
  const s = spell.settings
  const url = el('input', { class: 'field', type: 'url', value: s.languageToolUrl, placeholder: 'https://languagetool.example.edu' })
  const use = el('input', { type: 'checkbox', checked: s.useLanguageTool })
  const status = el('p', { class: 'spell-status' })
  if (s.useLanguageTool && spell.languageToolOk === false) status.textContent = t('The last check with this server failed; local checks were used.')
  const body = el(
    'div',
    {},
    el('p', {
      textContent: t('LanguageTool is an open-source grammar checker that can be installed on a server. When it is used, it adds its checks to the offline ones.'),
    }),
    el('label', { class: 'field-label' }, t('Server address'), url),
    el('label', { class: 'spell-check-row' }, use, t('Use a LanguageTool server')),
    el('p', {
      class: 'spell-privacy',
      textContent: t(
        'Privacy: while this is on, the text of the documents you check is sent to this server. Use a server you trust, ideally one run by your school. When it is off, nothing leaves this browser.',
      ),
    }),
    status,
  )
  const result = await showDialog(t('LanguageTool server'), body, [
    { label: t('Cancel'), value: 'cancel' },
    { label: t('Save'), value: 'ok', primary: true },
  ])
  if (result !== 'ok') return
  const address = url.value.trim()
  if (use.checked && !/^https?:\/\/\S+$/i.test(address)) {
    toast(t('Enter the address of the server (https://…)'))
    return
  }
  spell.update({ languageToolUrl: address, useLanguageTool: use.checked && !!address })
}

export async function personalDictionaryDialog(spell: SpellController): Promise<void> {
  const select = el('select', { class: 'field' })
  for (const lang of LANGS) select.append(new Option(langName(lang), lang, false, lang === spell.docLang()))
  const list = el('ul', { class: 'spell-words' })
  const render = () => {
    const lang = select.value as Lang
    const words = personalWords(lang)
    list.replaceChildren()
    if (!words.length) list.append(el('li', { textContent: t('No words yet. Use “Add to dictionary” on an underlined word.') }))
    for (const word of words) {
      const remove = el('button', { type: 'button', textContent: '✕', title: t('Remove') })
      remove.setAttribute('aria-label', t('Remove “{word}”', { word }))
      remove.addEventListener('click', () => {
        spell.removeFromDictionary(word, lang)
        render()
      })
      list.append(el('li', {}, el('span', { textContent: word }), remove))
    }
  }
  select.addEventListener('change', render)
  render()
  const body = el('div', {}, el('p', { textContent: t('Words you added are accepted in every document of this browser.') }), el('label', { class: 'field-label' }, t('Language'), select), list)
  await showDialog(t('Personal dictionary'), body, [{ label: t('Close'), value: 'ok', primary: true }])
}
