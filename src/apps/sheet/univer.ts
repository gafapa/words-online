// Univer setup: open-source presets only (Apache-2.0).

import { createUniver, LocaleType, mergeLocales, type IWorkbookData } from '@univerjs/presets'
import { language } from '../../core/i18n'
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core'
import { UniverSheetsFilterPreset } from '@univerjs/preset-sheets-filter'
import { UniverSheetsSortPreset } from '@univerjs/preset-sheets-sort'
import { UniverSheetsConditionalFormattingPreset } from '@univerjs/preset-sheets-conditional-formatting'
import { UniverSheetsDataValidationPreset } from '@univerjs/preset-sheets-data-validation'
import { UniverSheetsFindReplacePreset } from '@univerjs/preset-sheets-find-replace'
import { UniverSheetsHyperLinkPreset } from '@univerjs/preset-sheets-hyper-link'
import { UniverSheetsNotePreset } from '@univerjs/preset-sheets-note'
import { UniverSheetsDrawingPreset } from '@univerjs/preset-sheets-drawing'
import { UniverSheetsTablePreset } from '@univerjs/preset-sheets-table'
import coreEnUS from '@univerjs/preset-sheets-core/locales/en-US'
import filterEnUS from '@univerjs/preset-sheets-filter/locales/en-US'
import sortEnUS from '@univerjs/preset-sheets-sort/locales/en-US'
import cfEnUS from '@univerjs/preset-sheets-conditional-formatting/locales/en-US'
import dvEnUS from '@univerjs/preset-sheets-data-validation/locales/en-US'
import findEnUS from '@univerjs/preset-sheets-find-replace/locales/en-US'
import linkEnUS from '@univerjs/preset-sheets-hyper-link/locales/en-US'
import noteEnUS from '@univerjs/preset-sheets-note/locales/en-US'
import drawingEnUS from '@univerjs/preset-sheets-drawing/locales/en-US'
import tableEnUS from '@univerjs/preset-sheets-table/locales/en-US'
import '@univerjs/preset-sheets-core/lib/index.css'
import '@univerjs/preset-sheets-filter/lib/index.css'
import '@univerjs/preset-sheets-sort/lib/index.css'
import '@univerjs/preset-sheets-conditional-formatting/lib/index.css'
import '@univerjs/preset-sheets-data-validation/lib/index.css'
import '@univerjs/preset-sheets-find-replace/lib/index.css'
import '@univerjs/preset-sheets-hyper-link/lib/index.css'
import '@univerjs/preset-sheets-note/lib/index.css'
import '@univerjs/preset-sheets-drawing/lib/index.css'
import '@univerjs/preset-sheets-table/lib/index.css'

// Fixed ids: every replica must address the same workbook and sheets.
export const WORKBOOK_ID = 'workbook'

export function emptyWorkbook(): Partial<IWorkbookData> {
  return {
    id: WORKBOOK_ID,
    name: '',
    locale: LocaleType.EN_US,
    styles: {},
    sheetOrder: ['sheet-1'],
    sheets: {
      'sheet-1': { id: 'sheet-1', name: 'Sheet1', rowCount: 1000, columnCount: 26, cellData: {} },
    },
    resources: [],
  }
}

// Univer's interface in Spanish for Spanish and Galician (Univer has no Galician), else English.
async function spanishLocale() {
  const parts = await Promise.all([
    import('@univerjs/preset-sheets-core/locales/es-ES'),
    import('@univerjs/preset-sheets-filter/locales/es-ES'),
    import('@univerjs/preset-sheets-sort/locales/es-ES'),
    import('@univerjs/preset-sheets-conditional-formatting/locales/es-ES'),
    import('@univerjs/preset-sheets-data-validation/locales/es-ES'),
    import('@univerjs/preset-sheets-find-replace/locales/es-ES'),
    import('@univerjs/preset-sheets-hyper-link/locales/es-ES'),
    import('@univerjs/preset-sheets-note/locales/es-ES'),
    import('@univerjs/preset-sheets-drawing/locales/es-ES'),
    import('@univerjs/preset-sheets-table/locales/es-ES'),
  ])
  return mergeLocales(...parts.map((m) => m.default))
}

export async function createSpreadsheet(container: HTMLElement) {
  const english = mergeLocales(coreEnUS, filterEnUS, sortEnUS, cfEnUS, dvEnUS, findEnUS, linkEnUS, noteEnUS, drawingEnUS, tableEnUS)
  const spanish = language === 'en' ? null : await spanishLocale()
  return createUniver({
    locale: spanish ? LocaleType.ES_ES : LocaleType.EN_US,
    locales: spanish ? { [LocaleType.ES_ES]: spanish, [LocaleType.EN_US]: english } : { [LocaleType.EN_US]: english },
    presets: [
      UniverSheetsCorePreset({ container }),
      UniverSheetsFilterPreset(),
      UniverSheetsSortPreset(),
      UniverSheetsConditionalFormattingPreset(),
      UniverSheetsDataValidationPreset(),
      UniverSheetsFindReplacePreset(),
      UniverSheetsHyperLinkPreset(),
      UniverSheetsNotePreset(),
      UniverSheetsDrawingPreset(),
      UniverSheetsTablePreset(),
    ],
  })
}
