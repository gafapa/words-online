// Comment range mark. Comments are anchored with Yjs relative positions (see
// ../comments.ts); this mark only exists in documents handed to or produced by
// the file converters, never in the shared document.

import { Mark } from '@tiptap/core'

export const CommentRange = Mark.create({
  name: 'commentRange',
  inclusive: false,
  // Several comments may cover the same text.
  excludes: '',
  addAttributes: () => ({ id: { default: '' } }),
  parseHTML: () => [],
  renderHTML: ({ HTMLAttributes }) => ['span', { 'data-comment-range': HTMLAttributes.id }, 0],
})
