// Number-format grammar + renderer.
//
// Format string: `type[:variant][:decimals]`
//   currency           → currency, default USD, 2 decimals
//   currency:INR       → currency, INR, default decimals
//   currency:INR:0     → currency, INR, 0 decimals
//   currency:2         → currency, default variant, 2 decimals  ← legacy two-part form
//   number             → number, default (locale) thousands
//   number:in:0        → number, Indian lakhs grouping, 0 decimals
//   number:3           → number, default variant, 3 decimals    ← legacy
//   date               → date, default (locale)
//   date:dmy           → date, DD/MM/YYYY
//   time:hm12          → 3:30 PM
//   datetime:dmy:hm12  → 15/01/2025, 3:30 PM   (variant carries both halves)
//
// The parser disambiguates legacy two-part `type:N` (decimals-only) from
// new `type:variant` by checking whether the second token is digits-only.
// `type:variant:decimals` keeps both pieces explicit.

export function parseNumberFmt(fmt) {
  if (!fmt) return { type: '', variant: '', decimals: null }
  const parts = String(fmt).split(':')
  const type = parts[0]
  let variant = ''
  let decimals = null
  if (parts.length >= 3) {
    variant = parts[1]
    decimals = parts[2] !== '' ? parseInt(parts[2], 10) : null
  } else if (parts.length === 2) {
    const p = parts[1]
    if (/^-?\d+$/.test(p)) decimals = parseInt(p, 10)
    else variant = p
  }
  if (Number.isNaN(decimals)) decimals = null
  return { type, variant, decimals }
}

export function buildNumberFmt(type, variant, decimals) {
  if (!type) return ''
  const hasV = !!variant
  const hasD = decimals != null
  if (hasV && hasD) return `${type}:${variant}:${decimals}`
  if (hasV)        return `${type}:${variant}`
  if (hasD)        return `${type}:${decimals}`
  return type
}

export function applyNumberFmt(value, format) {
  if (!format) return value
  const { type, decimals } = parseNumberFmt(format)
  // Text format leaves the value untouched (no numeric coercion at display).
  // Cells flagged 'text' should also be treated as text in formulas; that's
  // handled by the engine's strict-arithmetic — see toNumStrict.
  if (type === 'text') return value == null ? '' : String(value)
  const n = parseFloat(value)
  if (isNaN(n) && type !== 'date') return value
  if (type === 'number') {
    return decimals == null
      ? n.toLocaleString()
      : n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  }
  if (type === 'currency') {
    const d = decimals ?? 2
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
  }
  if (type === 'percentage') return (n * 100).toFixed(decimals ?? 2) + '%'
  if (type === 'date') {
    const d = parseFloat(value)
    return isNaN(d) ? value : new Date(d).toLocaleDateString()
  }
  return value
}
