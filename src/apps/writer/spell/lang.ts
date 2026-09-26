// Paragraph language: a `lang` attribute on paragraphs and headings, rendered
// as the HTML lang attribute (used by the checker, screen readers and
// hyphenation) and written to DOCX (w:lang) and ODT (fo:language).

import { Extension } from '@tiptap/core'
import { langFromTag, LANG_TAG } from './settings'
import type { Lang } from './types'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphLanguage: { setParagraphLanguage: (lang: Lang | null) => ReturnType }
  }
}

const TYPES = ['paragraph', 'heading']

export const ParagraphLanguage = Extension.create({
  name: 'paragraphLanguage',
  addGlobalAttributes: () => [
    {
      types: TYPES,
      attributes: {
        lang: {
          default: null,
          parseHTML: (el) => langFromTag(el.getAttribute('lang')),
          renderHTML: (attrs) => (attrs.lang ? { lang: LANG_TAG[attrs.lang as Lang] ?? attrs.lang } : {}),
        },
      },
    },
  ],
  addCommands() {
    return {
      setParagraphLanguage:
        (lang) =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (TYPES.includes(node.type.name) && node.attrs.lang !== lang) tr.setNodeMarkup(pos, undefined, { ...node.attrs, lang })
          })
          if (dispatch) dispatch(tr)
          return true
        },
    }
  },
})
