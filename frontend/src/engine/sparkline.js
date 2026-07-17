// Sparkline model + geometry — the pure core behind in-cell mini charts.
//
// A sparkline is a formula, not a stored object: `=SPARKLINE(A1:A10, "column")`
// evaluates to a spec `{ __spark, type, data, color }`. The sheet engine shows
// no text for a spec (the cell renders a chart instead), and the canvas painter
// asks `sparkGeometry` for the drawing primitives. Because it's just a formula,
// it inherits recompute-on-change, row/col shifting, persistence, and undo for
// free — there's no separate registry to keep in sync.
//
// This module has no canvas/DOM dependency so the geometry is unit-testable.

export const SPARK_TYPES = new Set(['line', 'column'])

// A hex (#rgb…#rrggbbaa) or bare CSS colour keyword — enough to reject a stray
// #REF! / label that would otherwise reach the canvas as an invalid style
// (which canvas silently ignores, painting in a leftover colour).
const COLOR_RE = /^(#[0-9a-f]{3,8}|[a-z]+)$/i

// Normalise a type argument to a supported chart type (default 'line').
export function sparkType(v) {
  const t = String(v ?? '').toLowerCase()
  return SPARK_TYPES.has(t) ? t : 'line'
}

// Build a spec from a (possibly mixed) data array plus options. Empty cells and
// non-numeric values are dropped (treated as gaps, like Google Sheets) so a
// blank or a stray label in the range doesn't read as a spurious 0.
export function sparkSpec(data, type, color) {
  const nums = (data || [])
    .filter(v => !(v == null || (typeof v === 'string' && v.trim() === '')))
    .map(v => Number(v))
    .filter(Number.isFinite)
  const c = typeof color === 'string' ? color.trim() : ''
  return {
    __spark: true,
    type: sparkType(type),
    data: nums,
    color: COLOR_RE.test(c) ? c : null,
  }
}

export function isSparkSpec(v) {
  return !!(v && typeof v === 'object' && v.__spark === true)
}

// Given a spec and the cell's pixel box, return the primitives to draw:
//   { kind:'line', points:[{x,y},…] }
//   { kind:'bars', bars:[{x,y,w,h,neg},…] }   (column/bar)
// or null when there's nothing to draw (no numeric data, or a box too small).
// Coordinates are relative to the cell's top-left, inset by `pad`.
export function sparkGeometry(spec, w, h, pad = 3) {
  const data = spec?.data || []
  const pw = w - pad * 2
  const ph = h - pad * 2
  if (!data.length || pw <= 0 || ph <= 0) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = (max - min) || 1
  // Map a value to a y inside the padded box, higher value = higher (smaller y).
  const yOf = (v) => pad + (ph - ((v - min) / span) * ph)

  if (spec.type === 'column') {
    const n = data.length
    const gap = n > 20 ? 0 : 1                       // drop gaps when very dense
    const bw = Math.max(1, (pw - gap * (n - 1)) / n)
    // Bars grow from zero when the range straddles it, else from the low edge.
    const baseY = yOf(min < 0 && max > 0 ? 0 : min)
    const bars = data.map((v, i) => {
      const bx = pad + i * (bw + gap)
      const vy = yOf(v)
      return { x: bx, y: Math.min(vy, baseY), w: bw, h: Math.max(1, Math.abs(vy - baseY)), neg: v < 0 }
    })
    return { kind: 'bars', bars }
  }

  const n = data.length
  const step = n > 1 ? pw / (n - 1) : 0
  const points = data.map((v, i) => ({ x: pad + i * step, y: yOf(v) }))
  return { kind: 'line', points }
}
