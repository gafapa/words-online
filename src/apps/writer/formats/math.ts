// Equation conversions for the file formats: MathML (from KaTeX) to Word's
// OMML, and OMML or MathML back to LaTeX. They cover the constructs the
// equation editor produces and what Word and LibreOffice commonly write.

export const OMML_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math'
export const MATHML_NS = 'http://www.w3.org/1998/Math/MathML'

// Unicode symbols and their LaTeX commands.
const SYMBOLS: Record<string, string> = {
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon', ϵ: 'epsilon', ζ: 'zeta', η: 'eta', θ: 'theta', ϑ: 'vartheta',
  ι: 'iota', κ: 'kappa', λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', π: 'pi', ϖ: 'varpi', ρ: 'rho', ϱ: 'varrho', σ: 'sigma',
  ς: 'varsigma', τ: 'tau', υ: 'upsilon', φ: 'phi', ϕ: 'phi', χ: 'chi', ψ: 'psi', ω: 'omega',
  Γ: 'Gamma', Δ: 'Delta', Θ: 'Theta', Λ: 'Lambda', Ξ: 'Xi', Π: 'Pi', Σ: 'Sigma', Υ: 'Upsilon', Φ: 'Phi', Ψ: 'Psi', Ω: 'Omega',
  '≤': 'le', '≥': 'ge', '≠': 'ne', '±': 'pm', '∓': 'mp', '×': 'times', '÷': 'div', '·': 'cdot', '⋅': 'cdot', '∞': 'infty',
  '→': 'to', '←': 'leftarrow', '↔': 'leftrightarrow', '⇒': 'Rightarrow', '⇐': 'Leftarrow', '⇔': 'Leftrightarrow', '↦': 'mapsto',
  '∈': 'in', '∉': 'notin', '∋': 'ni', '⊂': 'subset', '⊃': 'supset', '⊆': 'subseteq', '⊇': 'supseteq', '∪': 'cup', '∩': 'cap',
  '∀': 'forall', '∃': 'exists', '∄': 'nexists', '∂': 'partial', '∇': 'nabla', '≈': 'approx', '≡': 'equiv', '∼': 'sim', '≃': 'simeq',
  '≅': 'cong', '∝': 'propto', '∑': 'sum', '∏': 'prod', '∐': 'coprod', '∫': 'int', '∬': 'iint', '∭': 'iiint', '∮': 'oint',
  '…': 'ldots', '⋯': 'cdots', '⋮': 'vdots', '⋱': 'ddots', '∠': 'angle', '⊥': 'perp', '∥': 'parallel', '∅': 'emptyset',
  '¬': 'neg', '∧': 'wedge', '∨': 'vee', '⊕': 'oplus', '⊗': 'otimes', '∘': 'circ', '°': 'degree', '′': 'prime', 'ℓ': 'ell',
  'ℏ': 'hbar', 'ℜ': 'Re', 'ℑ': 'Im', '⟨': 'langle', '⟩': 'rangle', '⌊': 'lfloor', '⌋': 'rfloor', '⌈': 'lceil', '⌉': 'rceil',
  '≪': 'll', '≫': 'gg', '∖': 'setminus', '√': 'surd', '∗': 'ast', '⋆': 'star', '†': 'dagger', '∣': 'mid',
}
const DOUBLE_STRUCK: Record<string, string> = { ℝ: 'R', ℕ: 'N', ℤ: 'Z', ℚ: 'Q', ℂ: 'C', ℙ: 'P' }
const NARY = new Set(['∑', '∏', '∐', '∫', '∬', '∭', '∮', '⋃', '⋂', '⋁', '⋀', '⨁', '⨂'])
const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'deg', 'dim', 'ker', 'arg', 'mod'])
const INVISIBLE = /[⁡⁢⁣⁤​]/g
// Combining accent characters (OMML) ↔ LaTeX accents.
const ACCENTS: Record<string, string> = {
  '̂': 'hat', '^': 'hat', ˆ: 'hat', '̃': 'tilde', '~': 'tilde', '˜': 'tilde', '̇': 'dot', '˙': 'dot', '̈': 'ddot', '¨': 'ddot',
  '⃗': 'vec', '→': 'vec', '̅': 'bar', '̄': 'bar', '¯': 'bar', ˉ: 'bar', '̌': 'check', ˇ: 'check', '̆': 'breve', '˘': 'breve',
  '́': 'acute', '´': 'acute', '̀': 'grave', '`': 'grave',
}
const ACCENT_CHARS: Record<string, string> = { hat: '̂', tilde: '̃', dot: '̇', ddot: '̈', vec: '⃗', bar: '̅', check: '̌', breve: '̆', acute: '́', grave: '̀' }

const kids = (el: Element) => [...el.children]
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

// ---------- MathML → OMML ----------

export function mathmlToOmml(math: Element): string {
  return `<m:oMath>${seq(kids(math))}</m:oMath>`
}

function run(text: string, style?: string): string {
  text = text.replace(INVISIBLE, '')
  if (!text) return ''
  const rPr = style ? `<m:rPr>${style}</m:rPr>` : ''
  return `<m:r>${rPr}<m:t xml:space="preserve">${esc(text)}</m:t></m:r>`
}

const VARIANTS: Record<string, string> = {
  normal: '<m:sty m:val="p"/>',
  bold: '<m:sty m:val="b"/>',
  italic: '<m:sty m:val="i"/>',
  'bold-italic': '<m:sty m:val="bi"/>',
  'double-struck': '<m:scr m:val="double-struck"/><m:sty m:val="p"/>',
  script: '<m:scr m:val="script"/>',
  fraktur: '<m:scr m:val="fraktur"/>',
  'sans-serif': '<m:scr m:val="sans-serif"/><m:sty m:val="p"/>',
  monospace: '<m:scr m:val="monospace"/><m:sty m:val="p"/>',
}

function baseChar(el: Element | undefined): string | null {
  if (!el) return null
  if (el.localName === 'mo') return (el.textContent ?? '').trim()
  if ((el.localName === 'mrow' || el.localName === 'mstyle') && el.children.length === 1) return baseChar(el.children[0])
  return null
}

function isFence(el: Element | undefined): boolean {
  return !!el && el.localName === 'mo' && (el.getAttribute('fence') === 'true' || (el.getAttribute('stretchy') === 'true' && /^[()[\]{}|‖⟨⟩⌊⌋⌈⌉]?$/.test((el.textContent ?? '').trim())))
}

// A sequence of elements; large operators take the element after them as their operand.
function seq(nodes: Element[]): string {
  let out = ''
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    const name = n.localName
    const limits = ['msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover'].includes(name)
    const op = limits ? baseChar(n.children[0]) : name === 'mo' ? baseChar(n) : null
    if (op && NARY.has(op)) {
      let sub = ''
      let sup = ''
      if (name === 'msub' || name === 'munder') sub = conv(n.children[1])
      else if (name === 'msup' || name === 'mover') sup = conv(n.children[1])
      else if (name === 'msubsup' || name === 'munderover') {
        sub = conv(n.children[1])
        sup = conv(n.children[2])
      }
      const under = name.startsWith('mu') || (name === 'mo' && !op.startsWith('∫') && !'∬∭∮'.includes(op))
      const operand = i + 1 < nodes.length ? conv(nodes[++i]) : ''
      out +=
        `<m:nary><m:naryPr><m:chr m:val="${op}"/><m:limLoc m:val="${under ? 'undOvr' : 'subSup'}"/>` +
        `${sub ? '' : '<m:subHide m:val="1"/>'}${sup ? '' : '<m:supHide m:val="1"/>'}</m:naryPr>` +
        `<m:sub>${sub}</m:sub><m:sup>${sup}</m:sup><m:e>${operand}</m:e></m:nary>`
      continue
    }
    out += conv(n)
  }
  return out
}

function conv(el: Element | undefined): string {
  if (!el) return ''
  const c = kids(el)
  switch (el.localName) {
    case 'math':
    case 'mstyle':
    case 'mpadded':
    case 'merror':
    case 'mtd':
      return seq(c)
    case 'semantics':
      return c.length ? conv(c[0]) : ''
    case 'annotation':
    case 'annotation-xml':
    case 'mphantom':
      return ''
    case 'mrow': {
      if (c.length >= 2 && isFence(c[0]) && isFence(c[c.length - 1])) {
        const beg = (c[0].textContent ?? '').trim()
        const end = (c[c.length - 1].textContent ?? '').trim()
        return `<m:d><m:dPr><m:begChr m:val="${esc(beg)}"/><m:endChr m:val="${esc(end)}"/></m:dPr><m:e>${seq(c.slice(1, -1))}</m:e></m:d>`
      }
      return seq(c)
    }
    case 'mi': {
      const text = el.textContent ?? ''
      const variant = el.getAttribute('mathvariant') ?? (text.length > 1 ? 'normal' : null)
      return run(text, variant ? VARIANTS[variant] : undefined)
    }
    case 'mn':
      return run(el.textContent ?? '')
    case 'mo':
      return run((el.textContent ?? '').trim())
    case 'mtext':
      return run(el.textContent ?? '', '<m:sty m:val="p"/>')
    case 'ms':
      return run(`"${el.textContent ?? ''}"`, '<m:sty m:val="p"/>')
    case 'mspace': {
      const width = parseFloat(el.getAttribute('width') ?? '0')
      return width >= 0.9 ? run(' ') : width > 0.2 ? run(' ') : ''
    }
    case 'msup':
      return `<m:sSup><m:e>${conv(c[0])}</m:e><m:sup>${conv(c[1])}</m:sup></m:sSup>`
    case 'msub':
      return `<m:sSub><m:e>${conv(c[0])}</m:e><m:sub>${conv(c[1])}</m:sub></m:sSub>`
    case 'msubsup':
      return `<m:sSubSup><m:e>${conv(c[0])}</m:e><m:sub>${conv(c[1])}</m:sub><m:sup>${conv(c[2])}</m:sup></m:sSubSup>`
    case 'mfrac': {
      const thickness = el.getAttribute('linethickness')
      const noBar = thickness !== null && parseFloat(thickness) === 0
      return `<m:f>${noBar ? '<m:fPr><m:type m:val="noBar"/></m:fPr>' : ''}<m:num>${conv(c[0])}</m:num><m:den>${conv(c[1])}</m:den></m:f>`
    }
    case 'msqrt':
      return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${seq(c)}</m:e></m:rad>`
    case 'mroot':
      return `<m:rad><m:deg>${conv(c[1])}</m:deg><m:e>${conv(c[0])}</m:e></m:rad>`
    case 'mover': {
      const mark = baseChar(c[1])
      if (mark && (mark === '‾' || mark === '¯') && el.getAttribute('accent') !== 'true') return `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>${conv(c[0])}</m:e></m:bar>`
      if (mark === '⏞') return `<m:groupChr><m:groupChrPr><m:chr m:val="⏞"/><m:pos m:val="top"/><m:vertJc m:val="bot"/></m:groupChrPr><m:e>${conv(c[0])}</m:e></m:groupChr>`
      const accent = mark ? ACCENTS[mark] : undefined
      if (accent && (el.getAttribute('accent') === 'true' || mark!.length === 1)) {
        if (accent === 'bar' && mark === '‾') return `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>${conv(c[0])}</m:e></m:bar>`
        return `<m:acc><m:accPr><m:chr m:val="${ACCENT_CHARS[accent]}"/></m:accPr><m:e>${conv(c[0])}</m:e></m:acc>`
      }
      return `<m:limUpp><m:e>${conv(c[0])}</m:e><m:lim>${conv(c[1])}</m:lim></m:limUpp>`
    }
    case 'munder': {
      const mark = baseChar(c[1])
      if (mark === '_' || mark === '‾' || mark === '̲') return `<m:bar><m:barPr><m:pos m:val="bot"/></m:barPr><m:e>${conv(c[0])}</m:e></m:bar>`
      if (mark === '⏟') return `<m:groupChr><m:e>${conv(c[0])}</m:e></m:groupChr>`
      return `<m:limLow><m:e>${conv(c[0])}</m:e><m:lim>${conv(c[1])}</m:lim></m:limLow>`
    }
    case 'munderover':
      return `<m:limUpp><m:e><m:limLow><m:e>${conv(c[0])}</m:e><m:lim>${conv(c[1])}</m:lim></m:limLow></m:e><m:lim>${conv(c[2])}</m:lim></m:limUpp>`
    case 'mtable':
      return `<m:m>${c
        .filter((r) => r.localName === 'mtr' || r.localName === 'mlabeledtr')
        .map((r) => `<m:mr>${kids(r).map((cell) => `<m:e>${conv(cell)}</m:e>`).join('')}</m:mr>`)
        .join('')}</m:m>`
    case 'menclose':
      return `<m:borderBox><m:e>${seq(c)}</m:e></m:borderBox>`
    case 'mfenced': {
      const open = el.getAttribute('open') ?? '('
      const close = el.getAttribute('close') ?? ')'
      return `<m:d><m:dPr><m:begChr m:val="${esc(open)}"/><m:endChr m:val="${esc(close)}"/></m:dPr>${c.map((x) => `<m:e>${conv(x)}</m:e>`).join('')}</m:d>`
    }
    default:
      return c.length ? seq(c) : run(el.textContent ?? '')
  }
}

// ---------- To LaTeX ----------

const group = (s: string) => (s.trim().length === 1 ? s.trim() : `{${s.trim()}}`)

function textToLatex(text: string, upright: boolean): string {
  text = text.replace(INVISIBLE, '')
  if (upright && /^[A-Za-z]{2,}$/.test(text)) return FUNCTIONS.has(text) ? `\\${text} ` : `\\mathrm{${text}}`
  let out = ''
  for (const ch of text) {
    if (SYMBOLS[ch]) out += `\\${SYMBOLS[ch]} `
    else if (DOUBLE_STRUCK[ch]) out += `\\mathbb{${DOUBLE_STRUCK[ch]}}`
    else if ('{}#%&$_'.includes(ch)) out += `\\${ch}`
    else if (ch === '\\') out += '\\backslash '
    else if (ch === ' ') out += '\\quad '
    else if (ch === '−') out += '-'
    else if (ch === ' ' || ch === ' ') out += '\\,'
    else out += ch
  }
  return out
}

function delimiter(ch: string): string {
  if (!ch) return '.'
  if (ch === '{') return '\\{'
  if (ch === '}') return '\\}'
  if (ch === '‖') return '\\|'
  return SYMBOLS[ch] ? `\\${SYMBOLS[ch]}` : ch
}

function narySymbol(ch: string): string {
  return SYMBOLS[ch] ? `\\${SYMBOLS[ch]}` : { '⋃': '\\bigcup', '⋂': '\\bigcap', '⋁': '\\bigvee', '⋀': '\\bigwedge', '⨁': '\\bigoplus', '⨂': '\\bigotimes' }[ch] ?? ch
}

// Word's OMML (m:oMath or m:oMathPara) to LaTeX.
export function ommlToLatex(el: Element): string {
  return tidy(omml(el))
}

function tidy(latex: string): string {
  return latex.replace(/ +/g, ' ').replace(/ ([}^_)\]])/g, '$1').trim()
}

function ochild(el: Element, name: string): Element | null {
  return kids(el).find((c) => c.localName === name) ?? null
}

function oval(el: Element | null, prName: string, name: string): string | null {
  const pr = el ? ochild(el, prName) : null
  const v = pr ? ochild(pr, name) : null
  return v ? (v.getAttributeNS(OMML_NS, 'val') ?? v.getAttribute('m:val') ?? '') : null
}

function oseq(el: Element | null): string {
  return el ? kids(el).map(omml).join('') : ''
}

function omml(el: Element): string {
  const name = el.localName
  const part = (n: string) => oseq(ochild(el, n))
  switch (name) {
    case 'oMathPara':
      return kids(el)
        .filter((c) => c.localName === 'oMath')
        .map(omml)
        .join(' \\\\ ')
    case 'oMath':
    case 'e':
    case 'num':
    case 'den':
    case 'sub':
    case 'sup':
    case 'deg':
    case 'lim':
    case 'fName':
      return oseq(el)
    case 'r': {
      const text = kids(el)
        .filter((c) => c.localName === 't')
        .map((c) => c.textContent ?? '')
        .join('')
      const rPr = ochild(el, 'rPr')
      const upright = !!rPr && (ochild(rPr, 'nor') !== null || oval(el, 'rPr', 'sty') === 'p')
      const scr = oval(el, 'rPr', 'scr')
      if (scr === 'double-struck' && /^[A-Za-z]+$/.test(text)) return `\\mathbb{${text}}`
      const sty = oval(el, 'rPr', 'sty')
      if (sty === 'b' && /^[A-Za-z0-9]+$/.test(text)) return `\\mathbf{${text}}`
      if (rPr && ochild(rPr, 'nor') && /\s/.test(text)) return `\\text{${text}}`
      return textToLatex(text, upright)
    }
    case 'f': {
      const type = oval(el, 'fPr', 'type')
      if (type === 'noBar') return `\\genfrac{}{}{0pt}{}{${part('num')}}{${part('den')}}`
      if (type === 'lin') return `${group(part('num'))}/${group(part('den'))}`
      return `\\frac{${part('num')}}{${part('den')}}`
    }
    case 'sSup':
      return `${group(part('e'))}^${group(part('sup'))}`
    case 'sSub':
      return `${group(part('e'))}_${group(part('sub'))}`
    case 'sSubSup':
      return `${group(part('e'))}_${group(part('sub'))}^${group(part('sup'))}`
    case 'sPre':
      return `{}_${group(part('sub'))}^${group(part('sup'))}${group(part('e'))}`
    case 'rad': {
      const deg = part('deg')
      return deg && oval(el, 'radPr', 'degHide') !== '1' ? `\\sqrt[${deg}]{${part('e')}}` : `\\sqrt{${part('e')}}`
    }
    case 'nary': {
      const chr = oval(el, 'naryPr', 'chr') || '∫'
      const sub = oval(el, 'naryPr', 'subHide') === '1' ? '' : part('sub')
      const sup = oval(el, 'naryPr', 'supHide') === '1' ? '' : part('sup')
      return `${narySymbol(chr)}${sub ? `_${group(sub)}` : ''}${sup ? `^${group(sup)}` : ''} ${part('e')}`
    }
    case 'd': {
      const beg = oval(el, 'dPr', 'begChr') ?? '('
      const end = oval(el, 'dPr', 'endChr') ?? ')'
      const sep = oval(el, 'dPr', 'sepChr') ?? '|'
      const inner = kids(el)
        .filter((c) => c.localName === 'e')
        .map(omml)
        .join(` ${delimiter(sep)} `)
      return `\\left${delimiter(beg)} ${inner} \\right${delimiter(end)}`
    }
    case 'func': {
      const fname = part('fName').trim()
      const known = /^[a-z]+$/.test(fname) && FUNCTIONS.has(fname) ? `\\${fname}` : fname
      return `${known} ${group(part('e'))}`
    }
    case 'limLow': {
      const base = part('e').trim()
      if (/^\\(lim|max|min|sup|inf)$/.test(base) || /^\\mathrm\{(lim|max|min)\}$/.test(base)) return `${base.replace(/\\mathrm\{(\w+)\}/, '\\$1')}_${group(part('lim'))}`
      return `\\underset{${part('lim')}}{${base}}`
    }
    case 'limUpp':
      return `\\overset{${part('lim')}}{${part('e')}}`
    case 'acc': {
      const chr = oval(el, 'accPr', 'chr') ?? '̂'
      return `\\${ACCENTS[chr] ?? 'hat'}{${part('e')}}`
    }
    case 'bar':
      return oval(el, 'barPr', 'pos') === 'top' ? `\\overline{${part('e')}}` : `\\underline{${part('e')}}`
    case 'groupChr': {
      const chr = oval(el, 'groupChrPr', 'chr') ?? '⏟'
      const top = oval(el, 'groupChrPr', 'pos') === 'top'
      if (chr === '⏞') return `\\overbrace{${part('e')}}`
      if (chr === '⏟') return `\\underbrace{${part('e')}}`
      return top ? `\\overset{${textToLatex(chr, false)}}{${part('e')}}` : `\\underset{${textToLatex(chr, false)}}{${part('e')}}`
    }
    case 'borderBox':
      return `\\boxed{${part('e')}}`
    case 'box':
    case 'phant':
      return part('e')
    case 'm': {
      const rows = kids(el)
        .filter((c) => c.localName === 'mr')
        .map((r) =>
          kids(r)
            .filter((c) => c.localName === 'e')
            .map(omml)
            .join(' & '),
        )
      return `\\begin{matrix}${rows.join(' \\\\ ')}\\end{matrix}`
    }
    case 'eqArr':
      return `\\begin{aligned}${kids(el)
        .filter((c) => c.localName === 'e')
        .map(omml)
        .join(' \\\\ ')}\\end{aligned}`
    case 'ctrlPr':
    case 'rPr':
    case 'oMathParaPr':
    default:
      return name.endsWith('Pr') ? '' : oseq(el)
  }
}

// MathML to LaTeX: the TeX annotation when there is one, else a conversion.
export function mathmlToLatex(math: Element): string {
  const tex = [...math.getElementsByTagNameNS('*', 'annotation')].find((a) => /tex/i.test(a.getAttribute('encoding') ?? ''))
  if (tex?.textContent?.trim()) return tex.textContent.trim()
  return tidy(ml(math))
}

function mlseq(nodes: Element[]): string {
  return nodes.map(ml).join('')
}

function ml(el: Element | undefined): string {
  if (!el) return ''
  const c = kids(el)
  switch (el.localName) {
    case 'math':
    case 'mstyle':
    case 'mpadded':
    case 'merror':
    case 'mtd':
      return mlseq(c)
    case 'semantics':
      return c.length ? ml(c[0]) : ''
    case 'annotation':
    case 'annotation-xml':
    case 'mphantom':
      return ''
    case 'mrow': {
      if (c.length >= 2 && isFence(c[0]) && isFence(c[c.length - 1])) {
        return `\\left${delimiter((c[0].textContent ?? '').trim())} ${mlseq(c.slice(1, -1))} \\right${delimiter((c[c.length - 1].textContent ?? '').trim())}`
      }
      return mlseq(c)
    }
    case 'mi': {
      const text = el.textContent ?? ''
      const variant = el.getAttribute('mathvariant')
      if (variant === 'double-struck') return `\\mathbb{${text}}`
      if (variant === 'bold') return `\\mathbf{${text}}`
      return textToLatex(text, variant === 'normal' || text.length > 1)
    }
    case 'mn':
    case 'mo':
      return textToLatex((el.textContent ?? '').trim(), false)
    case 'mtext':
      return (el.textContent ?? '').trim() ? `\\text{${el.textContent}}` : ''
    case 'mspace':
      return parseFloat(el.getAttribute('width') ?? '0') >= 0.9 ? '\\quad ' : '\\,'
    case 'msup':
      return `${group(ml(c[0]))}^${group(ml(c[1]))}`
    case 'msub':
      return `${group(ml(c[0]))}_${group(ml(c[1]))}`
    case 'msubsup':
      return `${group(ml(c[0]))}_${group(ml(c[1]))}^${group(ml(c[2]))}`
    case 'mfrac': {
      const t = el.getAttribute('linethickness')
      return t !== null && parseFloat(t) === 0 ? `\\genfrac{}{}{0pt}{}{${ml(c[0])}}{${ml(c[1])}}` : `\\frac{${ml(c[0])}}{${ml(c[1])}}`
    }
    case 'msqrt':
      return `\\sqrt{${mlseq(c)}}`
    case 'mroot':
      return `\\sqrt[${ml(c[1])}]{${ml(c[0])}}`
    case 'mover': {
      const mark = baseChar(c[1])
      const accent = mark ? ACCENTS[mark] : undefined
      if (mark === '‾' || mark === '¯') return `\\overline{${ml(c[0])}}`
      if (mark === '⏞') return `\\overbrace{${ml(c[0])}}`
      if (accent) return `\\${accent}{${ml(c[0])}}`
      const base = baseChar(c[0])
      if (base && NARY.has(base)) return `${narySymbol(base)}^${group(ml(c[1]))}`
      return `\\overset{${ml(c[1])}}{${ml(c[0])}}`
    }
    case 'munder': {
      const mark = baseChar(c[1])
      if (mark === '_' || mark === '‾' || mark === '̲') return `\\underline{${ml(c[0])}}`
      if (mark === '⏟') return `\\underbrace{${ml(c[0])}}`
      const base = baseChar(c[0]) ?? (c[0]?.localName === 'mi' ? c[0].textContent : null)
      if (base && (NARY.has(base) || FUNCTIONS.has(base))) return `${NARY.has(base) ? narySymbol(base) : `\\${base}`}_${group(ml(c[1]))}`
      return `\\underset{${ml(c[1])}}{${ml(c[0])}}`
    }
    case 'munderover': {
      const base = baseChar(c[0])
      if (base && NARY.has(base)) return `${narySymbol(base)}_${group(ml(c[1]))}^${group(ml(c[2]))}`
      return `\\underset{${ml(c[1])}}{\\overset{${ml(c[2])}}{${ml(c[0])}}}`
    }
    case 'mtable':
      return `\\begin{matrix}${c
        .filter((r) => r.localName === 'mtr' || r.localName === 'mlabeledtr')
        .map((r) => kids(r).map(ml).join(' & '))
        .join(' \\\\ ')}\\end{matrix}`
    case 'menclose':
      return `\\boxed{${mlseq(c)}}`
    case 'mfenced': {
      const open = el.getAttribute('open') ?? '('
      const close = el.getAttribute('close') ?? ')'
      const sep = el.getAttribute('separators') ?? ','
      return `\\left${delimiter(open)} ${c.map(ml).join(sep.trim()[0] ?? ',')} \\right${delimiter(close)}`
    }
    default:
      return c.length ? mlseq(c) : textToLatex(el.textContent ?? '', false)
  }
}
