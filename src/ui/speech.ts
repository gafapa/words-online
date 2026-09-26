// Read aloud (speechSynthesis, word highlighting through the CSS Custom
// Highlight API so editors' DOM is never touched) and dictation (Web Speech
// API recognition, inserted at the caret of the last focused text field).

import { t } from '../core/i18n'

export type SpeechLang = 'es' | 'gl' | 'en' | 'fr' | 'de'
export type ReadLang = 'auto' | SpeechLang

// ---------- Language detection ----------

// Frequent words that tell the languages apart (shared ones left out).
const MARKERS: Record<SpeechLang, Set<string>> = {
  es: new Set('el la los las y del al una es por muy también ya hay fue lo pero sus han ha este esta'.split(' ')),
  gl: new Set('o os as e do da dos das ao aos unha é non moi tamén xa hai foi polo pola nun nunha na nas cando isto iso'.split(' ')),
  en: new Set('the and of to is in that it for with on was are this be not by at from have you'.split(' ')),
  fr: new Set('le les et des du est pas pour qui dans avec sur ce cette sont au aux ne nous vous il elle être'.split(' ')),
  de: new Set('der die das und ist nicht mit ein eine zu den dem von sich auf für auch ich wir sie'.split(' ')),
}

export function detectLang(text: string): SpeechLang {
  const score = { es: 0, gl: 0, en: 0, fr: 0, de: 0 }
  for (const word of text.toLowerCase().split(/[^\p{L}]+/u).slice(0, 400)) {
    for (const lang of ['es', 'gl', 'en', 'fr', 'de'] as const) if (MARKERS[lang].has(word)) score[lang]++
  }
  const best = (Object.keys(score) as (keyof typeof score)[]).sort((a, b) => score[b] - score[a])[0]
  if (score[best] > 0) return best
  const page = (document.documentElement.lang || navigator.language).slice(0, 2)
  return page in MARKERS ? (page as SpeechLang) : 'en'
}

// ---------- Voices ----------

export const canSpeak = (): boolean => 'speechSynthesis' in window

export function listVoices(): SpeechSynthesisVoice[] {
  return canSpeak() ? speechSynthesis.getVoices() : []
}

export function onVoicesChanged(cb: () => void): void {
  if (canSpeak()) speechSynthesis.addEventListener('voiceschanged', cb)
}

interface VoiceChoice {
  voice?: SpeechSynthesisVoice
  lang: string
  notice?: string
}

// Regional default of each language, as a BCP 47 tag.
export const SPEECH_TAGS: Record<SpeechLang, string> = { es: 'es-ES', gl: 'gl-ES', en: 'en-US', fr: 'fr-FR', de: 'de-DE' }

function chooseVoice(lang: SpeechLang, voiceURI: string): VoiceChoice {
  const voices = listVoices()
  const chosen = voiceURI && voices.find((v) => v.voiceURI === voiceURI)
  if (chosen) return { voice: chosen, lang: chosen.lang }
  const find = (code: SpeechLang) => {
    const matching = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(code))
    // Prefer the regional default (es-ES, gl-ES, fr-FR…) and voices that work offline.
    const rank = (v: SpeechSynthesisVoice) => (v.lang.toLowerCase().replace('_', '-') === SPEECH_TAGS[code].toLowerCase() ? 2 : 0) + (v.localService ? 1 : 0) + (v.default ? 0.5 : 0)
    return matching.sort((a, b) => rank(b) - rank(a))[0]
  }
  const voice = find(lang)
  if (voice) return { voice, lang: voice.lang }
  if (lang === 'gl') {
    const spanish = find('es')
    return { voice: spanish, lang: spanish?.lang ?? 'es-ES', notice: t('No Galician voice is installed: reading with a Spanish voice.') }
  }
  return { lang: SPEECH_TAGS[lang] }
}

// ---------- Text sources ----------

interface Segment {
  node: Text
  textStart: number // offset in the combined text
  nodeStart: number // offset in the node
  length: number
}

export interface Source {
  text: string
  segments: Segment[] // empty when the text cannot be highlighted (inputs)
}

const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, pre, div'

// Text of a DOM range, remembering where each piece comes from.
export function sourceFromRange(range: Range): Source {
  const rootNode = range.commonAncestorContainer
  const root = rootNode.nodeType === Node.TEXT_NODE ? rootNode.parentNode! : rootNode
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let text = ''
  const segments: Segment[] = []
  let lastBlock: Element | null = null
  for (let node = walker.currentNode.nodeType === Node.TEXT_NODE ? (walker.currentNode as Text) : (walker.nextNode() as Text | null); node; node = walker.nextNode() as Text | null) {
    if (!range.intersectsNode(node)) continue
    const parent = node.parentElement
    if (!parent || parent.closest('[contenteditable="false"], script, style, [aria-hidden="true"], .a11y-panel')) continue
    const start = node === range.startContainer ? range.startOffset : 0
    const end = node === range.endContainer ? range.endOffset : node.length
    if (end <= start) continue
    const block = parent.closest(BLOCKS)
    if (lastBlock && block !== lastBlock && !/\s$/.test(text)) text += '\n'
    lastBlock = block
    segments.push({ node, textStart: text.length, nodeStart: start, length: end - start })
    text += node.data.slice(start, end)
  }
  return { text, segments }
}

function rangeAt(source: Source, from: number, to: number): Range | null {
  const find = (index: number) => source.segments.find((s) => index >= s.textStart && index <= s.textStart + s.length)
  const a = find(from)
  const b = find(to) ?? a
  if (!a || !b) return null
  const range = document.createRange()
  range.setStart(a.node, a.nodeStart + (from - a.textStart))
  range.setEnd(b.node, b.nodeStart + Math.min(to - b.textStart, b.length))
  return range
}

// ---------- Reading ----------

type Listener = (state: { reading: boolean; message?: string }) => void
const listeners = new Set<Listener>()
export const onSpeechState = (cb: Listener): void => void listeners.add(cb)
const emit = (reading: boolean, message?: string) => listeners.forEach((cb) => cb({ reading, message }))

let session = 0
let reading = false
export const isReading = (): boolean => reading

const highlights = (): Map<string, unknown> | null => (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights ?? null
const HighlightCtor = (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight

function highlight(range: Range | null): void {
  const registry = highlights()
  if (!registry || !HighlightCtor) return
  if (!range) return void registry.delete('a11y-read')
  registry.set('a11y-read', new HighlightCtor(range))
  const box = range.getBoundingClientRect()
  if (box.height && (box.top < 60 || box.bottom > window.innerHeight - 40)) {
    const still = document.documentElement.dataset.a11yMotion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches
    range.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' })
  }
}

// Splits long text into sentence-sized chunks: long utterances get cut off in some browsers.
function chunks(text: string): { start: number; text: string }[] {
  const out: { start: number; text: string }[] = []
  const re = /[^.!?¡¿…\n]*(?:[.!?…]+|\n|$)/gu
  let current = { start: 0, text: '' }
  for (let m = re.exec(text); m && m[0]; m = re.exec(text)) {
    if (current.text && current.text.length + m[0].length > 220) {
      out.push(current)
      current = { start: m.index, text: '' }
    }
    if (!current.text) current.start = m.index
    current.text += m[0]
  }
  if (current.text.trim()) out.push(current)
  return out.filter((c) => c.text.trim())
}

export function speak(source: Source, options: { lang: ReadLang; voiceURI: string; rate: number }): void {
  stopReading()
  if (!canSpeak()) return emit(false, t('Read aloud is not available in this browser.'))
  const text = source.text.trim()
  if (!text) return emit(false, t('There is no text to read. Select some text or place the cursor in a paragraph.'))
  const lang = options.lang === 'auto' ? detectLang(source.text) : options.lang
  const choice = chooseVoice(lang, options.voiceURI)
  const id = ++session
  const parts = chunks(source.text)
  reading = true
  emit(true, choice.notice ?? t('Reading… ({voice})', { voice: choice.voice?.name ?? choice.lang }))
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part.text)
    u.lang = choice.lang
    if (choice.voice) u.voice = choice.voice
    u.rate = options.rate
    u.onboundary = (e) => {
      if (id !== session || e.name !== 'word') return
      const from = part.start + e.charIndex
      const length = e.charLength || /^[\p{L}\p{N}'’-]+/u.exec(source.text.slice(from))?.[0].length || 1
      highlight(rangeAt(source, from, from + length))
    }
    if (i === parts.length - 1) u.onend = () => id === session && finish()
    u.onerror = (e) => {
      if (id !== session || e.error === 'canceled' || e.error === 'interrupted') return
      finish(t('Read aloud stopped: {error}', { error: e.error }))
    }
    speechSynthesis.speak(u)
  })
}

function finish(message?: string) {
  session++
  reading = false
  highlight(null)
  emit(false, message ?? '')
}

export function stopReading(): void {
  if (!canSpeak()) return
  const was = reading
  session++
  reading = false
  speechSynthesis.cancel()
  highlight(null)
  if (was) emit(false, t('Stopped reading.'))
}

// ---------- Dictation ----------

interface Recognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

const RecognitionCtor = (): (new () => Recognition) | undefined =>
  (window as unknown as Record<string, new () => Recognition>).SpeechRecognition ??
  (window as unknown as Record<string, new () => Recognition>).webkitSpeechRecognition

export function dictationStatus(): 'ok' | 'unsupported' | 'offline' {
  if (!RecognitionCtor()) return 'unsupported'
  return navigator.onLine ? 'ok' : 'offline'
}

export function dictationStatusText(): string {
  const status = dictationStatus()
  if (status === 'unsupported') return t('Dictation is not available in this browser (it works in Chrome and Edge).')
  if (status === 'offline') return t('Dictation needs an internet connection: the browser sends the audio to its speech service.')
  return ''
}

export interface DictationHandlers {
  onText: (text: string) => void
  onInterim: (text: string) => void
  onState: (active: boolean, message?: string) => void
}

let recognition: Recognition | null = null
let dictating = false
export const isDictating = (): boolean => dictating

export function startDictation(lang: string, handlers: DictationHandlers): void {
  stopDictation()
  const Ctor = RecognitionCtor()
  if (!Ctor || !navigator.onLine) return handlers.onState(false, dictationStatusText())
  const rec = new Ctor()
  recognition = rec
  dictating = true
  rec.lang = lang
  rec.continuous = true
  rec.interimResults = true
  rec.onresult = (e) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i]
      if (result.isFinal) handlers.onText(result[0].transcript)
      else interim += result[0].transcript
    }
    handlers.onInterim(interim)
  }
  rec.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return
    const messages: Record<string, string> = {
      'not-allowed': t('Microphone access was denied.'),
      'service-not-allowed': t('Microphone access was denied.'),
      network: t('Dictation needs an internet connection: the browser sends the audio to its speech service.'),
      'language-not-supported': t('This language is not supported for dictation.'),
      'audio-capture': t('No microphone was found.'),
    }
    dictating = false
    recognition = null
    handlers.onState(false, messages[e.error] ?? t('Dictation stopped: {error}', { error: e.error }))
  }
  // Recognition ends by itself after a silence; keep listening until stopped.
  rec.onend = () => {
    if (recognition === rec && dictating) {
      try {
        rec.start()
        return
      } catch {
        // Fall through: report as stopped.
      }
    }
    if (recognition === rec) {
      recognition = null
      dictating = false
      handlers.onState(false)
    }
  }
  try {
    rec.start()
    handlers.onState(true, t('Listening… speak now.'))
  } catch (err) {
    dictating = false
    recognition = null
    handlers.onState(false, String((err as Error).message))
  }
}

export function stopDictation(): void {
  const rec = recognition
  dictating = false
  if (rec) {
    rec.stop()
    recognition = null
  }
}
