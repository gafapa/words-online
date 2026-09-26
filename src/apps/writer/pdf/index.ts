// Direct PDF export (stub, filled later).
import type { WriterContext } from '../app'

export async function exportPdf(_ctx: WriterContext): Promise<Blob> {
  throw new Error('not yet')
}

export async function printPdf(ctx: WriterContext): Promise<void> {
  const blob = await exportPdf(ctx)
  window.open(URL.createObjectURL(blob), '_blank')
}
