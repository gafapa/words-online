// Template gallery model. Template content is written in Spanish and Galician
// (school documents for Spain / Galicia); the gallery chrome uses t().

import type { DocType } from '../core/store'

export type Lang = 'es' | 'gl'

export interface Template {
  id: string
  app: DocType
  name: Record<Lang, string>
  description: Record<Lang, string>
  // Small SVG preview (markup string).
  thumb: () => string
  // Creates the document as a new local document and returns its path.
  create: (lang: Lang) => Promise<string>
}

// Picks the Spanish or Galician variant.
export const pick = (lang: Lang) => (es: string, gl: string) => (lang === 'gl' ? gl : es)
