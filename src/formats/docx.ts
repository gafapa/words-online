// Word (.docx) export from a Quill Delta, and import through mammoth.

import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  TextRun,
  type IRunOptions,
  type ParagraphChild,
} from 'docx'
import type { Op } from 'quill'
import { deltaToLines, FONT_SIZE_PT, HEADING_SIZE_PT, loadImage, type InlineAttrs, type Line } from './model'

const TWIPS_PER_INDENT = 720 // 0.5 inch per indent level

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
]

const ALIGN = { center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED }

export async function exportDocx(ops: Op[], title: string): Promise<Blob> {
  const lines = deltaToLines(ops)
  const paragraphs: Paragraph[] = []
  // Each separate ordered list restarts numbering through a new instance.
  let listInstance = 0
  let previousOrdered = false

  for (const line of lines) {
    const ordered = line.attrs.list === 'ordered'
    if (ordered && !previousOrdered) listInstance++
    previousOrdered = ordered
    paragraphs.push(await buildParagraph(line, listInstance))
  }

  const doc = new Document({
    title,
    creator: 'Words Online',
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: FONT_SIZE_PT.normal * 2 } },
        // Plain black headings instead of the library's blue defaults.
        ...Object.fromEntries(
          [1, 2, 3, 4, 5, 6].map((n) => [
            `heading${n}`,
            {
              run: { bold: true, color: '000000', size: (HEADING_SIZE_PT[n] ?? FONT_SIZE_PT.normal) * 2 },
              paragraph: { spacing: { before: 240, after: 120 }, keepNext: true },
            },
          ]),
        ),
      },
    },
    numbering: {
      config: [
        {
          reference: 'ordered',
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level % 3],
            text: `%${level + 1}.`,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: TWIPS_PER_INDENT * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{ children: paragraphs.length ? paragraphs : [new Paragraph('')] }],
  })
  return Packer.toBlob(doc)
}

async function buildParagraph(line: Line, listInstance: number): Promise<Paragraph> {
  const { attrs } = line
  const level = attrs.indent ?? 0
  const children: ParagraphChild[] = []

  if (attrs.list === 'checked' || attrs.list === 'unchecked') {
    children.push(new TextRun(attrs.list === 'checked' ? '☒ ' : '☐ '))
  }

  for (const run of line.runs) {
    if ('image' in run) {
      const img = await loadImage(run.image)
      if (img) {
        children.push(
          new ImageRun({
            type: img.type,
            data: img.data,
            transformation: { width: img.width, height: img.height },
          }),
        )
      }
      continue
    }
    const text = new TextRun(runOptions(run.text, run.attrs, attrs.codeBlock))
    children.push(run.attrs.link ? new ExternalHyperlink({ link: run.attrs.link, children: [text] }) : text)
  }

  const isList = attrs.list === 'ordered' || attrs.list === 'bullet'
  return new Paragraph({
    children,
    heading: attrs.header ? HEADINGS[attrs.header - 1] : undefined,
    alignment: attrs.align ? ALIGN[attrs.align] : undefined,
    numbering: attrs.list === 'ordered' ? { reference: 'ordered', level, instance: listInstance } : undefined,
    bullet: attrs.list === 'bullet' ? { level } : undefined,
    indent: !isList && level ? { left: TWIPS_PER_INDENT * level } : attrs.blockquote ? { left: 360 } : undefined,
    border: attrs.blockquote
      ? { left: { style: BorderStyle.SINGLE, size: 18, color: 'CCCCCC', space: 8 } }
      : undefined,
    shading: attrs.codeBlock ? { type: ShadingType.CLEAR, fill: 'F0F0F0', color: 'auto' } : undefined,
    spacing: attrs.codeBlock ? { after: 0 } : undefined,
  })
}

function runOptions(text: string, a: InlineAttrs, codeBlock?: boolean): IRunOptions {
  const mono = codeBlock || a.code || a.font === 'monospace'
  return {
    text,
    bold: a.bold,
    italics: a.italic,
    underline: a.underline || a.link ? {} : undefined,
    strike: a.strike,
    color: a.color?.slice(1) ?? (a.link ? '0563C1' : undefined),
    shading: a.background
      ? { type: ShadingType.CLEAR, fill: a.background.slice(1), color: 'auto' }
      : a.code
        ? { type: ShadingType.CLEAR, fill: 'F0F0F0', color: 'auto' }
        : undefined,
    size: a.size ? FONT_SIZE_PT[a.size] * 2 : undefined,
    font: mono ? 'Courier New' : a.font === 'serif' ? 'Times New Roman' : undefined,
    superScript: a.script === 'super',
    subScript: a.script === 'sub',
  }
}
