// UI translations. t(text, vars) returns the text in the user's
// language with {var} placeholders filled in; English is the key and the fallback.
// The catalog of the language is loaded (top-level await) before any module that
// imports this one runs, so t() can be used anywhere, even at module level.

export type Language = 'en' | 'es' | 'gl'

export const languages: { code: Language; name: string }[] = [
  { code: 'es', name: 'Español' },
  { code: 'gl', name: 'Galego' },
  { code: 'en', name: 'English' },
]

const STORAGE_KEY = 'words-online:language'

function saved(): Language | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'en' || value === 'es' || value === 'gl' ? value : null
  } catch {
    return null
  }
}

// Galician for gl, Spanish for any Spanish locale and the other languages of
// Spain (Catalan, Basque), otherwise English.
export function detectLanguage(): Language {
  const list = navigator.languages?.length ? navigator.languages : [navigator.language || 'en']
  for (const tag of list) {
    const code = tag.toLowerCase().split(/[-_]/)[0]
    if (code === 'gl') return 'gl'
    if (code === 'es' || code === 'ca' || code === 'eu' || code === 'ast' || code === 'an') return 'es'
    if (code === 'en') return 'en'
  }
  return 'en'
}

export const language: Language = saved() ?? detectLanguage()

// Locale for Intl formatting (dates, numbers) and third-party editors.
export const locale = { en: 'en', es: 'es-ES', gl: 'gl-ES' }[language]

const catalog: Record<string, string> =
  language === 'es' ? (await import('./locales/es')).default : language === 'gl' ? (await import('./locales/gl')).default : {}

document.documentElement.lang = language

export function t(text: string, vars?: Record<string, string | number>): string {
  const out = catalog[text] || text
  return vars ? out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : out
}

// Count-dependent text: tn(n, '{n} word', '{n} words'); {n} is filled in.
export function tn(n: number, one: string, other: string, vars?: Record<string, string | number>): string {
  return t(n === 1 ? one : other, { n: n.toLocaleString(locale), ...vars })
}

// Saves the preference (null: follow the browser) and reloads the page.
export function setLanguage(code: Language | null): void {
  try {
    if (code) localStorage.setItem(STORAGE_KEY, code)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Private mode: the choice lasts only for this page.
  }
  location.reload()
}

// Language picker (a <select>) that switches and reloads.
export function languageSelect(className = 'language-select'): HTMLSelectElement {
  const select = document.createElement('select')
  select.className = className
  select.setAttribute('aria-label', t('Language'))
  select.title = t('Language')
  for (const { code, name } of languages) select.append(new Option(name, code, false, code === language))
  select.addEventListener('change', () => setLanguage(select.value as Language))
  return select
}
