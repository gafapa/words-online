// Downloads the pinned draw.io web app (Apache-2.0) and extracts the static
// files into public/drawio, so it is served from the same origin as the suite.
// Runs automatically before dev/build; skips work when already present.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

const VERSION = '31.5.2'
const SHA256 = 'abd58ad15baef57f43acb79a56350ba8900a8b6fabe94391d8906148fe64e264'
const URL = `https://github.com/jgraph/drawio/releases/download/v${VERSION}/draw.war`

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'public', 'drawio')
const stamp = join(target, '.version')
// Server-side or cloud-integration files that a static, offline copy never needs.
const SKIP = [/^META-INF\//, /^WEB-INF\//, /\.map$/, /^(dropbox|github|gitlab|onedrive3|teams|monday-app-association)\./, /^connect\//, /^js\/(dropbox|onedrive)\//]

if (existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === VERSION) {
  console.log(`draw.io ${VERSION} already present`)
  process.exit(0)
}

const cache = join(root, 'node_modules', '.cache', `draw-${VERSION}.war`)
let data
if (existsSync(cache)) {
  data = readFileSync(cache)
} else {
  console.log(`Downloading draw.io ${VERSION}…`)
  const res = await fetch(URL)
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`)
  data = Buffer.from(await res.arrayBuffer())
  mkdirSync(dirname(cache), { recursive: true })
  writeFileSync(cache, data)
}

const hash = createHash('sha256').update(data).digest('hex')
if (hash !== SHA256) throw new Error(`Checksum mismatch for draw.war: ${hash}`)

rmSync(target, { recursive: true, force: true })
const zip = await JSZip.loadAsync(data)
let count = 0
for (const [name, entry] of Object.entries(zip.files)) {
  if (entry.dir || SKIP.some((re) => re.test(name))) continue
  const out = join(target, name)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, await entry.async('nodebuffer'))
  count++
}
writeFileSync(stamp, VERSION)
console.log(`Extracted ${count} draw.io files into public/drawio`)
