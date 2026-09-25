// Equation node: LaTeX source rendered with KaTeX, inline or on its own line
// (display). Double click (or Enter when selected) asks the app to edit it
// through an 'equation-edit' event on the editor element.

import { Node, mergeAttributes } from '@tiptap/core'
import { renderEquation } from '../../../ui/equation'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    equation: { insertEquation: (attrs: { latex: string; display?: boolean }) => ReturnType }
  }
}

export interface EquationEditDetail {
  pos: number
  latex: string
  display: boolean
}

export const Equation = Node.create({
  name: 'equation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({
    latex: {
      default: '',
      parseHTML: (el) => el.getAttribute('data-latex') ?? '',
      renderHTML: (attrs) => ({ 'data-latex': attrs.latex }),
    },
    display: {
      default: false,
      parseHTML: (el) => el.getAttribute('data-display') === 'true',
      renderHTML: (attrs) => (attrs.display ? { 'data-display': 'true' } : {}),
    },
  }),
  parseHTML: () => [{ tag: 'span[data-equation]' }],
  // Plain HTML (copy, .html download) keeps the LaTeX in the usual delimiters.
  renderHTML: ({ node, HTMLAttributes }) => [
    'span',
    mergeAttributes(HTMLAttributes, { 'data-equation': '', class: 'equation' }),
    node.attrs.display ? `\\[${node.attrs.latex}\\]` : `\\(${node.attrs.latex}\\)`,
  ],
  renderText: ({ node }) => (node.attrs.display ? `\\[${node.attrs.latex}\\]` : `\\(${node.attrs.latex}\\)`),
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('span')
      dom.setAttribute('data-equation', '')
      dom.contentEditable = 'false'
      let current = node
      const draw = () => {
        dom.className = current.attrs.display ? 'equation display' : 'equation'
        dom.title = current.attrs.latex
        renderEquation(dom, current.attrs.latex, current.attrs.display)
      }
      draw()
      dom.addEventListener('dblclick', (e) => {
        e.preventDefault()
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (pos === undefined) return
        const detail: EquationEditDetail = { pos, latex: current.attrs.latex, display: current.attrs.display }
        editor.view.dom.dispatchEvent(new CustomEvent('equation-edit', { detail }))
      })
      return {
        dom,
        update: (next) => {
          if (next.type !== current.type) return false
          const changed = next.attrs.latex !== current.attrs.latex || next.attrs.display !== current.attrs.display
          current = next
          if (changed) draw()
          return true
        },
        ignoreMutation: () => true,
      }
    }
  },
  addCommands() {
    return {
      insertEquation:
        ({ latex, display = false }) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { latex, display } }),
    }
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { selection } = this.editor.state
        const node = (selection as { node?: import('@tiptap/pm/model').Node }).node
        if (node?.type.name !== this.name) return false
        const detail: EquationEditDetail = { pos: selection.from, latex: node.attrs.latex, display: node.attrs.display }
        this.editor.view.dom.dispatchEvent(new CustomEvent('equation-edit', { detail }))
        return true
      },
    }
  },
})
