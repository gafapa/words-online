// UI translations. t('English text', { var }) returns the text in the user's
// language with {var} placeholders filled in.

export function t(text: string, vars?: Record<string, string | number>): string {
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text
}
