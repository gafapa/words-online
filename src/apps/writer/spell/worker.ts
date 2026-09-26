// Spelling and grammar worker: dictionaries, rules, Harper and LanguageTool
// run here so typing never waits for them.

import { Checker, type HarperLike } from './checker'
import type { CheckOptions, Lang, Paragraph } from './types'

export type WorkerRequest =
  | { type: 'config'; dictionaries: Record<Lang, string> }
  | { type: 'personal'; lang: Lang; words: string[] }
  | { type: 'check'; id: number; paragraphs: Paragraph[]; options: CheckOptions }
  | { type: 'suggest'; id: number; word: string; lang: Lang }
  | { type: 'disable-rule'; rule: string }

export type WorkerEvent =
  | { type: 'result'; id: number; results: { issues: import('./types').Issue[]; pending: boolean }[] }
  | { type: 'suggestions'; id: number; list: string[] }
  | { type: 'ready'; lang: Lang }
  | { type: 'dictionary-error'; lang: Lang }
  | { type: 'harper'; ready: boolean }
  | { type: 'languagetool'; ok: boolean }

let urls: Record<Lang, string> | null = null

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const text = await res.text()
  // A static host may answer a missing file with the app's index.html.
  if (/^\s*</.test(text)) throw new Error(`Not a dictionary: ${url}`)
  return text
}

async function loadHarper(): Promise<HarperLike> {
  const [{ LocalLinter }, { slimBinary }] = await Promise.all([import('harper.js'), import('harper.js/slimBinary')])
  const linter = new LocalLinter({ binary: slimBinary })
  await linter.setup()
  // Spelling, spaces, capitals and repeated words are checked by our own rules.
  await linter.setLintConfig({ SpellCheck: false, SentenceCapitalization: false, Spaces: false, RepeatedWords: false, LongSentences: false })
  return linter as unknown as HarperLike
}

const checker = new Checker(
  async (lang) => {
    if (!urls) throw new Error('No dictionaries')
    const [aff, dic] = await Promise.all([fetchText(`${urls[lang]}.aff.txt`), fetchText(`${urls[lang]}.dic.txt`)])
    return { aff, dic }
  },
  loadHarper,
)

const post = (event: WorkerEvent) => (self as unknown as Worker).postMessage(event)

function prepare(paragraphs: Paragraph[], options: CheckOptions) {
  for (const lang of new Set(paragraphs.map((p) => p.lang))) {
    if (options.spelling && checker.state(lang) === 'none') {
      checker.ensure(lang).then((h) => post(h ? { type: 'ready', lang } : { type: 'dictionary-error', lang }))
    }
  }
  if (options.grammar && checker.harperState === 'none' && paragraphs.some((p) => p.lang === 'en')) {
    checker.ensureHarper().then((h) => post({ type: 'harper', ready: !!h }))
  }
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  if (msg.type === 'config') urls = msg.dictionaries
  else if (msg.type === 'personal') checker.setPersonal(msg.lang, msg.words)
  else if (msg.type === 'disable-rule') checker.disabledRules.add(msg.rule)
  else if (msg.type === 'suggest') {
    await checker.ensure(msg.lang)
    post({ type: 'suggestions', id: msg.id, list: checker.suggest(msg.word, msg.lang) })
  } else if (msg.type === 'check') {
    prepare(msg.paragraphs, msg.options)
    const hadLt = !!msg.options.languageTool
    const results = await checker.check(msg.paragraphs, msg.options)
    post({ type: 'result', id: msg.id, results })
    if (hadLt) post({ type: 'languagetool', ok: !checker.languageToolFailed })
  }
}
