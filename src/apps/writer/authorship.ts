// Authorship: who wrote each piece of text. Text carries an `authorship` mark
// with the Yjs client id of the session that typed it; older text without the
// mark falls back to the client id of the Yjs items holding it. Client ids map
// to people through the session's author directory.

import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Session } from '../../core/session'
import { locale, t } from '../../core/i18n'
import { el, showDialog } from '../../ui/widgets'
import type { AuthorDirectory } from './collab'
import { PositionIndex } from './ypos'

const authorshipKey = new PluginKey<DecorationSet>('authorship')
const UNKNOWN_COLOR = '#9aa0a6'

interface Run {
  from: number
  to: number
  client: number
}

// Authorship runs of the whole document, in order.
function runs(editor: Editor, session: Session): Run[] {
  const doc = editor.state.doc
  const fallback: Run[] = []
  new PositionIndex(session.doc.getXmlFragment('body'), editor.schema).authorship((from, to, client) => fallback.push({ from, to, client }))
  fallback.sort((a, b) => a.from - b.from)
  const out: Run[] = []
  let k = 0
  doc.descendants((node, pos) => {
    if (!node.isInline) return true
    const end = pos + node.nodeSize
    const mark = node.marks.find((m) => m.type.name === 'authorship')
    if (mark?.attrs.client) {
      out.push({ from: pos, to: end, client: Number(mark.attrs.client) })
      return false
    }
    while (k < fallback.length && fallback[k].to <= pos) k++
    for (let j = k; j < fallback.length && fallback[j].from < end; j++) {
      const from = Math.max(pos, fallback[j].from)
      const to = Math.min(end, fallback[j].to)
      if (to > from) out.push({ from, to, client: fallback[j].client })
    }
    return false
  })
  return out
}

export class AuthorshipView {
  enabled = false
  private shown = false
  private frame = 0

  constructor(
    private editor: Editor,
    private session: Session,
    private authors: AuthorDirectory,
  ) {
    editor.on('update', () => this.refresh())
    authors.onChange(() => this.refresh())
  }

  plugin(): Plugin {
    return new Plugin<DecorationSet>({
      key: authorshipKey,
      state: {
        init: () => DecorationSet.empty,
        apply: (tr, set) => (tr.getMeta(authorshipKey) as DecorationSet | undefined) ?? set.map(tr.mapping, tr.doc),
      },
      props: { decorations: (state) => authorshipKey.getState(state) },
    })
  }

  toggle(on = !this.enabled): void {
    this.enabled = on
    this.editor.view.dom.classList.toggle('show-authorship', on)
    this.refresh()
  }

  refresh(): void {
    if (!this.enabled && !this.shown) return
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => {
      if (this.editor.isDestroyed) return
      this.shown = this.enabled
      let set = DecorationSet.empty
      if (this.enabled) {
        const decorations = runs(this.editor, this.session).map((r) => {
          const who = this.authors.get(r.client)
          const color = who?.color ?? UNKNOWN_COLOR
          return Decoration.inline(r.from, r.to, {
            class: 'author-run',
            style: `--author-color: ${color}`,
            title: who?.name ?? t('Unknown author'),
          })
        })
        set = DecorationSet.create(this.editor.state.doc, decorations)
      }
      this.editor.view.dispatch(this.editor.state.tr.setMeta(authorshipKey, set).setMeta('addToHistory', false))
    })
  }
}

export interface Contribution {
  name: string
  color: string
  characters: number
  words: number
}

// Characters (without spaces) and words per author. A word counts for whoever
// wrote most of its letters. Suggested deletions are not counted.
export function contributions(editor: Editor, session: Session, authors: AuthorDirectory): Contribution[] {
  const doc: PMNode = editor.state.doc
  const byClient = new Map<number, string>()
  const people = new Map<string, Contribution>()
  const person = (client: number): Contribution => {
    let key = byClient.get(client)
    if (!key) {
      const who = authors.get(client)
      key = who ? `${who.name}\u0000${who.color}` : '\u0000unknown'
      byClient.set(client, key)
      if (!people.has(key)) people.set(key, { name: who?.name ?? t('Unknown author'), color: who?.color ?? UNKNOWN_COLOR, characters: 0, words: 0 })
    }
    return people.get(key)!
  }
  const all = runs(editor, session)
  let r = 0
  doc.descendants((block, blockPos) => {
    if (!block.isTextblock) return true
    // Per-character authors of this paragraph.
    const chars: { ch: string; who: Contribution | null }[] = []
    block.forEach((node, offset) => {
      const pos = blockPos + 1 + offset
      const deleted = node.marks.some((m) => m.type.name === 'deletion')
      const text = node.isText ? node.text! : ' '
      for (let i = 0; i < text.length; i++) {
        const at = pos + i
        while (r < all.length && all[r].to <= at) r++
        const run = r < all.length && all[r].from <= at ? all[r] : null
        chars.push({ ch: deleted ? ' ' : text[i], who: run && !deleted ? person(run.client) : null })
      }
    })
    let word: Map<Contribution, number> | null = null
    const endWord = () => {
      if (!word) return
      let best: Contribution | null = null
      let n = 0
      for (const [p, c] of word) if (c > n) [best, n] = [p, c]
      if (best) best.words++
      word = null
    }
    for (const { ch, who } of chars) {
      if (/\s/.test(ch)) {
        endWord()
        continue
      }
      if (!who) continue
      who.characters++
      word ??= new Map()
      word.set(who, (word.get(who) ?? 0) + 1)
    }
    endWord()
    return false
  })
  return [...people.values()].filter((p) => p.characters > 0).sort((a, b) => b.characters - a.characters)
}

export async function contributionsDialog(editor: Editor, session: Session, authors: AuthorDirectory): Promise<void> {
  const list = contributions(editor, session, authors)
  const total = list.reduce((s, p) => s + p.characters, 0) || 1
  const table = el('table', { class: 'contrib-table' })
  table.append(
    el(
      'tr',
      {},
      el('th', { textContent: t('Author') }),
      el('th', { textContent: t('Words') }),
      el('th', { textContent: t('Characters') }),
      el('th', { textContent: t('Percentage') }),
    ),
  )
  for (const p of list) {
    const pct = (p.characters / total) * 100
    const bar = el('span', { class: 'contrib-bar' })
    bar.style.width = `${pct}%`
    bar.style.background = p.color
    const swatch = el('span', { class: 'contrib-swatch' })
    swatch.style.background = p.color
    table.append(
      el(
        'tr',
        {},
        el('td', {}, swatch, p.name),
        el('td', { textContent: p.words.toLocaleString(locale) }),
        el('td', { textContent: p.characters.toLocaleString(locale) }),
        el('td', { class: 'contrib-share' }, el('span', { class: 'contrib-track' }, bar), `${pct.toFixed(1)}%`),
      ),
    )
  }
  const body = el(
    'div',
    {},
    list.length ? table : el('p', { textContent: t('The document is empty.') }),
    el('p', {
      class: 'contrib-note',
      textContent: t('Counts the text currently in the document by who typed it (characters without spaces). Text from imported files counts as unknown.'),
    }),
  )
  await showDialog(t('Contributions'), body, [{ label: t('Close'), value: 'ok', primary: true }], true)
}
