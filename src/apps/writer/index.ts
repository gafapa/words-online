// Entry point of the word processor, loaded on demand by the app registry.

import type { Session } from '../../core/session'
import { importFileAsDocument, mountWriter, OPEN_ACCEPT } from './app'
import './writer.css'

export const accept = OPEN_ACCEPT

export function mount(session: Session): void {
  mountWriter(session, document.getElementById('root')!)
}

export const importFile = importFileAsDocument
