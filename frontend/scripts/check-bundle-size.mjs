#!/usr/bin/env node
// Bundle-size budget check.
//
// Run after `vite build`. Fails (exit 1) if any tracked artifact exceeds its
// budget. Budgets exist so a casual import doesn't quietly add hundreds of kB
// of payload on every page load — performance regressions are easier to catch
// at PR time than to undo later.
//
// To update a budget, change the number here AND describe why in the PR
// description. We grow budgets deliberately, not by attrition.

import { readFileSync, statSync } from 'node:fs'
import { gzipSync }                from 'node:zlib'
import { resolve, dirname, join }  from 'node:path'
import { fileURLToPath }            from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(__dirname, '../../sheets/public/sheets')

// Budgets in KB (1024 bytes). `raw` = on-disk minified size; `gzip` = wire
// size when served with gzip compression — both matter (parse cost vs.
// download cost), so we cap both.
const BUDGETS = [
  // index.js grew ~140 KB raw (~40 KB gzipped) when we vendored
  // socket.io-client to stand up `frappe.realtime` ourselves on the public
  // www/sheets page (Desk's socketio_client.js isn't loaded there).
  // That unblocks multi-user presence on Frappe Cloud today. When the
  // Hocuspocus path replaces the legacy relay entirely, the dep + ~140 KB
  // go with it and this budget can come back down to ~800.
  { file: 'index.js',     raw: 950,  gzip: 260 },
  // index.css crept up well past its 260 KB cap as we pulled in more
  // frappe-ui surfaces (Avatar, Tooltip, Dialog, FormControl, Dropdown).
  // The wire size is still tiny (~41 KB gzip) because CSS compresses
  // brutally well — the parse cost cap (raw) is the one that matters
  // here, and it's still a single-digit-ms parse on warm devices.
  { file: 'index.css',    raw: 500,  gzip:  50 },
  { file: 'echarts.js',   raw: 400,  gzip: 140 },
  { file: 'xlsx.js',      raw: 500,  gzip: 160 },
  { file: 'ChartView.js', raw: 340,  gzip: 110 },
]

let failed = false
const rows = []

for (const b of BUDGETS) {
  const path = join(DIST, b.file)
  let raw, gzip
  try {
    const buf = readFileSync(path)
    raw  = buf.length
    gzip = gzipSync(buf).length
  } catch (err) {
    console.error(`✗ ${b.file}: missing (run \`npm run build\` first)`)
    failed = true
    continue
  }
  const rawKb  = raw  / 1024
  const gzipKb = gzip / 1024
  const rawOver  = rawKb  > b.raw
  const gzipOver = gzipKb > b.gzip
  if (rawOver || gzipOver) failed = true
  rows.push({
    file: b.file,
    raw:  `${rawKb.toFixed(1)} / ${b.raw} KB`,
    rawOver,
    gzip: `${gzipKb.toFixed(1)} / ${b.gzip} KB`,
    gzipOver,
  })
}

const COL = { file: 22, raw: 22, gzip: 22 }
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length))
console.log()
console.log(pad('Artifact', COL.file) + pad('Raw (actual / max)', COL.raw) + pad('Gzip (actual / max)', COL.gzip))
console.log('─'.repeat(COL.file + COL.raw + COL.gzip))
for (const r of rows) {
  const mark = r.rawOver || r.gzipOver ? '✗ ' : '  '
  console.log(
    mark + pad(r.file, COL.file - 2) +
    pad(r.raw + (r.rawOver ? '  OVER' : ''),  COL.raw) +
    pad(r.gzip + (r.gzipOver ? '  OVER' : ''), COL.gzip),
  )
}
console.log()

if (failed) {
  console.error('Bundle-size budget exceeded. Either trim the payload or bump the budget in scripts/check-bundle-size.mjs with a justification in the PR.')
  process.exit(1)
}
console.log('All bundle-size budgets OK.')
