// Equations for every app: KaTeX rendering (fonts bundled, works offline),
// MathML output for file converters, and an equation editor dialog built on
// MathLive (loaded on first use: it is large) with a virtual keyboard for tablets.

import katex from 'katex'
import 'katex/dist/katex.min.css'
import { t } from '../core/i18n'

export interface EquationValue {
  latex: string
  // Display equations sit centered on their own line; inline ones flow with the text.
  display: boolean
}

export interface EquationDialogOptions {
  latex?: string
  display?: boolean
  // Offer the inline / display choice (default true).
  displayChoice?: boolean
  title?: string
}

// Renders LaTeX into `target`; invalid input is shown in red with the error as tooltip.
export function renderEquation(target: HTMLElement, latex: string, display = false): void {
  addStyle()
  try {
    katex.render(latex || '\\square', target, { displayMode: display, throwOnError: true, output: 'htmlAndMathml' })
    target.removeAttribute('title')
    target.classList.remove('equation-error')
  } catch (err) {
    target.textContent = latex
    target.title = (err as Error).message
    target.classList.add('equation-error')
  }
}

export function equationHtml(latex: string, display = false): string {
  return katex.renderToString(latex, { displayMode: display, throwOnError: false, output: 'htmlAndMathml' })
}

// MathML (<math> element as a string) with the LaTeX source kept as an annotation.
export function latexToMathML(latex: string, display = false): string {
  const html = katex.renderToString(latex, { displayMode: display, throwOnError: false, output: 'mathml' })
  const start = html.indexOf('<math')
  const end = html.lastIndexOf('</math>')
  return start >= 0 && end > start ? html.slice(start, end + 7) : `<math xmlns="http://www.w3.org/1998/Math/MathML"><mtext>${escape(latex)}</mtext></math>`
}

// Size of the rendered equation in CSS pixels at the given font size, with the
// depth below the baseline (for converters that place it as an object).
export function measureEquation(latex: string, display = false, fontSizePt = 11): { width: number; height: number; depth: number } {
  const box = document.createElement('span')
  box.style.cssText = `position:absolute;left:-10000px;top:0;visibility:hidden;font-size:${fontSizePt}pt;white-space:nowrap`
  document.body.append(box)
  renderEquation(box, latex, display)
  const html = box.querySelector<HTMLElement>('.katex-html') ?? box
  const rect = html.getBoundingClientRect()
  // KaTeX struts span height + depth and sit depth below the baseline.
  let depth = 0
  html.querySelectorAll<HTMLElement>('.strut').forEach((s) => (depth = Math.max(depth, -parseFloat(s.style.verticalAlign) || 0)))
  const em = parseFloat(getComputedStyle(box.querySelector('.katex') ?? box).fontSize) || (fontSizePt * 96) / 72
  box.remove()
  return { width: Math.max(4, rect.width), height: Math.max(8, rect.height), depth: depth * em }
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

// ---------- Editor dialog ----------

// Common constructs, inserted into the math field at the caret (#0 is the selection, #? a placeholder).
const TEMPLATES: [string, string, string][] = [
  ['\\frac{#0}{#?}', '\\frac{a}{b}', 'Fraction'],
  ['#0^{#?}', 'x^{n}', 'Power'],
  ['#0_{#?}', 'x_{i}', 'Subscript'],
  ['\\sqrt{#0}', '\\sqrt{x}', 'Square root'],
  ['\\sqrt[#?]{#0}', '\\sqrt[n]{x}', 'Root'],
  ['\\left(#0\\right)', '(x)', 'Parentheses'],
  ['\\sum_{#?}^{#?}', '\\sum', 'Sum'],
  ['\\int_{#?}^{#?}', '\\int', 'Integral'],
  ['\\lim_{#?\\to#?}', '\\lim', 'Limit'],
  ['\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}', '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', 'Matrix'],
  ['\\vec{#0}', '\\vec{v}', 'Vector'],
  ['\\overline{#0}', '\\overline{x}', 'Bar'],
]
const SYMBOLS = ['\\pi', '\\alpha', '\\beta', '\\theta', '\\lambda', '\\Delta', '\\infty', '\\pm', '\\times', '\\div', '\\cdot', '\\le', '\\ge', '\\ne', '\\approx', '\\to', '\\in', '\\degree']

let styleAdded = false
function addStyle() {
  if (styleAdded) return
  styleAdded = true
  const style = document.createElement('style')
  style.textContent = `
    .eq-overlay { position: fixed; inset: 0; z-index: 1000; background: rgb(0 0 0 / 0.35); display: flex; align-items: flex-start; justify-content: center; overflow: auto; padding: 5vh 16px 40vh; }
    .eq-overlay .eq-dialog { width: min(680px, calc(100vw - 32px)); border-radius: 12px; box-shadow: var(--shadow); background: var(--surface, #fff); color: var(--text, #1f2328); }
    body { --keyboard-zindex: 1100; }
    .eq-overlay .eq-dialog form { padding: 20px 24px; }
    .eq-overlay .eq-dialog h2 { margin: 0 0 14px; font-size: 20px; font-weight: 500; }
    .eq-dialog math-field { display: block; width: 100%; min-height: 64px; font-size: 26px; padding: 8px 10px; border: 1px solid var(--border, #ccc); border-radius: 8px; }
    .eq-dialog math-field:focus-within { outline: 2px solid var(--accent, #1a73e8); outline-offset: -1px; }
    .eq-dialog .eq-fallback-preview { min-height: 48px; padding: 8px; font-size: 20px; text-align: center; }
    .eq-palette { display: flex; flex-wrap: wrap; gap: 4px; margin: 10px 0 4px; }
    .eq-palette button { min-width: 40px; height: 38px; padding: 0 6px; border: 1px solid var(--border, #ccc); border-radius: 6px; background: var(--surface, #fff); color: inherit; font-size: 14px; }
    .eq-palette button:hover { background: var(--hover, #f1f3f4); }
    .eq-palette .katex { font-size: 1em; pointer-events: none; }
    .eq-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 8px; font-size: 14px; }
    .eq-row .spacer { flex: 1; }
    .eq-latex { font-family: 'Courier New', monospace; font-size: 13px; }
    .eq-dialog details { margin-top: 8px; }
    .eq-dialog summary { cursor: pointer; color: var(--muted, #5f6368); font-size: 13px; }
    .equation-error { color: #c5221f; font-family: 'Courier New', monospace; }
  `
  document.head.append(style)
}

interface MathField extends HTMLElement {
  value: string
  mathVirtualKeyboardPolicy: string
  smartFence: boolean
  insert(s: string, options?: Record<string, unknown>): boolean
  executeCommand(command: unknown): boolean
}

interface VirtualKeyboard {
  container: HTMLElement | null
  visible: boolean
  show(options?: { animate?: boolean }): void
  hide(options?: { animate?: boolean }): void
}

async function loadMathLive(): Promise<{ create: () => MathField; keyboard: () => VirtualKeyboard | undefined } | null> {
  try {
    const ml = await import('mathlive')
    // Fonts come from the KaTeX stylesheet (same families, bundled); no sounds.
    ml.MathfieldElement.fontsDirectory = null
    ml.MathfieldElement.soundsDirectory = null
    return {
      create: () => new ml.MathfieldElement() as unknown as MathField,
      keyboard: () => (window as unknown as { mathVirtualKeyboard?: VirtualKeyboard }).mathVirtualKeyboard,
    }
  } catch {
    return null
  }
}

// Opens the equation editor; resolves with the new value, or null when cancelled.
export async function editEquation(options: EquationDialogOptions = {}): Promise<EquationValue | null> {
  addStyle()
  const ml = await loadMathLive()
  const initial = options.latex ?? ''
  let display = options.display ?? false

  // Not a modal <dialog>: MathLive's virtual keyboard (in the page) must stay above it.
  const overlay = document.createElement('div')
  overlay.className = 'eq-overlay'
  const dialog = document.createElement('div')
  dialog.className = 'dlg wide eq-dialog'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  const form = document.createElement('form')
  const title = document.createElement('h2')
  title.textContent = options.title ?? (initial ? t('Edit equation') : t('Insert equation'))
  form.append(title)

  const latexInput = document.createElement('textarea')
  latexInput.className = 'field eq-latex'
  latexInput.rows = 2
  latexInput.spellcheck = false
  latexInput.value = initial
  latexInput.setAttribute('aria-label', t('LaTeX'))

  let field: MathField | null = null
  let preview: HTMLElement | null = null
  const getLatex = () => (field ? field.value : latexInput.value).trim()

  if (ml) {
    field = ml.create()
    field.mathVirtualKeyboardPolicy = 'auto'
    field.smartFence = true
    field.value = initial
    field.setAttribute('aria-label', t('Equation'))
    field.addEventListener('input', () => {
      if (document.activeElement !== latexInput) latexInput.value = field!.value
    })
    latexInput.addEventListener('input', () => (field!.value = latexInput.value))
    form.append(field)
  } else {
    preview = document.createElement('div')
    preview.className = 'eq-fallback-preview'
    const update = () => renderEquation(preview!, latexInput.value, true)
    latexInput.addEventListener('input', update)
    update()
    form.append(preview)
  }

  // Templates and symbols.
  const palette = document.createElement('div')
  palette.className = 'eq-palette'
  const insert = (latex: string) => {
    if (field) {
      field.insert(latex, { selectionMode: 'placeholder', format: 'latex' })
      field.focus()
    } else {
      const clean = latex.replace(/#0|#\?/g, '')
      const at = latexInput.selectionStart ?? latexInput.value.length
      latexInput.setRangeText(clean, at, latexInput.selectionEnd ?? at, 'end')
      latexInput.dispatchEvent(new Event('input'))
      latexInput.focus()
    }
  }
  for (const [latex, sample, label] of TEMPLATES) palette.append(paletteButton(sample, t(label), () => insert(latex)))
  for (const sym of SYMBOLS) palette.append(paletteButton(sym, sym, () => insert(sym)))
  form.append(palette)

  const row = document.createElement('div')
  row.className = 'eq-row'
  if (options.displayChoice !== false) {
    const label = document.createElement('label')
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = display
    box.addEventListener('change', () => (display = box.checked))
    label.append(box, ' ', t('Display equation (own line, centered)'))
    row.append(label)
  }
  row.append(Object.assign(document.createElement('span'), { className: 'spacer' }))
  if (ml) {
    const kb = document.createElement('button')
    kb.type = 'button'
    kb.textContent = `⌨ ${t('Keyboard')}`
    kb.className = 'eq-kb'
    kb.addEventListener('click', () => {
      const keyboard = ml.keyboard()
      if (!keyboard) return
      if (keyboard.visible) keyboard.hide()
      else {
        field?.focus()
        keyboard.show({ animate: true })
      }
    })
    kb.style.cssText = 'border:1px solid var(--border,#ccc);background:var(--surface,#fff);border-radius:6px;padding:6px 10px;color:inherit'
    row.append(kb)
  }
  form.append(row)

  const details = document.createElement('details')
  const summary = document.createElement('summary')
  summary.textContent = t('LaTeX source')
  details.append(summary, latexInput)
  if (!ml) details.open = true
  form.append(details)

  const actions = document.createElement('div')
  actions.className = 'dlg-actions'
  const cancel = Object.assign(document.createElement('button'), { type: 'button', textContent: t('Cancel') })
  const ok = Object.assign(document.createElement('button'), { type: 'submit', textContent: initial ? t('Update') : t('Insert'), className: 'primary' })
  actions.append(cancel, ok)
  form.append(actions)
  dialog.append(form)
  overlay.append(dialog)
  const previousFocus = document.activeElement as HTMLElement | null
  document.body.append(overlay)
  const keyboard = ml?.keyboard()

  return new Promise((resolve) => {
    const close = (accept: boolean) => {
      keyboard?.hide()
      const latex = getLatex()
      overlay.remove()
      window.removeEventListener('keydown', onKey, true)
      previousFocus?.focus?.()
      resolve(accept && latex ? { latex, display } : null)
    }
    // Enter inserts, Escape cancels (captured before the math field handles them).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close(false)
      } else if (e.key === 'Enter' && !e.shiftKey && field && e.composedPath().includes(field)) {
        e.preventDefault()
        e.stopPropagation()
        close(true)
      }
    }
    window.addEventListener('keydown', onKey, true)
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      close(true)
    })
    cancel.addEventListener('click', () => close(false))
    overlay.addEventListener('mousedown', (e) => e.target === overlay && close(false))
    setTimeout(() => (field ?? latexInput).focus())
  })
}

function paletteButton(sample: string, title: string, run: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.title = title
  b.setAttribute('aria-label', title)
  try {
    katex.render(sample, b, { throwOnError: true, output: 'html' })
  } catch {
    b.textContent = sample
  }
  b.addEventListener('mousedown', (e) => e.preventDefault())
  b.addEventListener('click', run)
  return b
}
