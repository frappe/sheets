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
  { file: 'index.js',     raw: 800,  gzip: 220 },
  { file: 'index.css',    raw: 260,  gzip:  40 },
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
