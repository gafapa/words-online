// Search index worker: reads each document's Yjs updates straight from its
// y-indexeddb database and extracts the plain text (library-extract.ts).
//   in:  { jobs: { id, type }[] }
//   out: { id, text } per document (text null when it could not be read), then { done: true }

import * as Y from 'yjs'
import { extractText } from './library-extract'
import type { DocType } from './store'

interface Job {
  id: string
  type: DocType
}

function readUpdates(name: string): Promise<Uint8Array[]> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name)
    // A database that does not exist yet is created empty: nothing to read.
    req.onupgradeneeded = () => req.transaction?.abort()
    req.onerror = () => reject(req.error)
    req.onsuccess = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('updates')) {
        db.close()
        return resolve([])
      }
      const get = db.transaction('updates', 'readonly').objectStore('updates').getAll()
      get.onsuccess = () => {
        db.close()
        resolve(get.result as Uint8Array[])
      }
      get.onerror = () => {
        db.close()
        reject(get.error)
      }
    }
  })
}

self.onmessage = async (event: MessageEvent<{ jobs: Job[] }>) => {
  for (const job of event.data.jobs) {
    let text: string | null = null
    try {
      const doc = new Y.Doc()
      const updates = await readUpdates(`words-online:${job.id}`)
      doc.transact(() => {
        for (const u of updates) Y.applyUpdate(doc, u)
      })
      text = extractText(job.type, doc)
      doc.destroy()
    } catch {
      text = null
    }
    self.postMessage({ id: job.id, text })
  }
  self.postMessage({ done: true })
}
