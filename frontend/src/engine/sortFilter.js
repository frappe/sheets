import { colLabel, parseCellId } from '../utils/cells.js'

export function createSortFilter(sheet) {
  const filterConfig = {}

  function _getRows() {
    const data = sheet.getRawData()
    let maxR = 0, maxC = 0
    for (const id of Object.keys(data)) {
      const p = parseCellId(id)
      if (p) { if (p.row > maxR) maxR = p.row; if (p.col > maxC) maxC = p.col }
    }
    const rows = []
    for (let r = 0; r <= maxR; r++) {
      const row = []
      for (let c = 0; c <= maxC; c++) row.push(sheet.getCell(colLabel(c) + (r + 1)))
      rows.push(row)
    }
    return rows
  }

  // Sort data rows (row index 1+), keeping row 0 as the header.
  function sort(colIndex, dir = 'asc') {
    const rows = _getRows()
    if (rows.length <= 1) return

    const maxC = rows.reduce((m, r) => Math.max(m, r.length - 1), 0)
    const dataRows = rows.slice(1)   // rows 1+ are the data

    dataRows.sort((a, b) => {
      const av = a[colIndex] ?? '', bv = b[colIndex] ?? ''
      if (av === '' && bv === '') return 0
      if (av === '') return 1
      if (bv === '') return -1
      const an = parseFloat(av), bn = parseFloat(bv)
      let cmp = (!isNaN(an) && !isNaN(bn)) ? an - bn : String(av).localeCompare(String(bv))
      return dir === 'asc' ? cmp : -cmp
    })

    // Write back sorted data starting at row 2 (1-indexed), row 0 stays untouched.
    for (let i = 0; i < dataRows.length; i++) {
      for (let c = 0; c <= maxC; c++) {
        sheet.setCell(colLabel(c) + (i + 2), dataRows[i][c] ?? '')
      }
    }
  }

  function setFilter(colId, spec) {
    filterConfig[colId] = spec
  }

  function clearFilter(colId) {
    delete filterConfig[colId]
  }

  function clearAll() {
    for (const k of Object.keys(filterConfig)) delete filterConfig[k]
  }

  // Returns a Set of row indices (0-based) that should be hidden.
  // Row 0 is always the header — never hidden.
  function computeHiddenRows() {
    const hidden = new Set()
    const entries = Object.entries(filterConfig)
    if (!entries.length) return hidden

    const rows = _getRows()
    for (let ri = 1; ri < rows.length; ri++) {   // start at 1 — row 0 is header
      for (const [colId, spec] of entries) {
        const cellVal = String(rows[ri]?.[parseInt(colId)] ?? '')
        const specVal = String(spec.value ?? '')
        const op      = spec.operator
        let fails = false
        if      (op === 'contains'  && !cellVal.toLowerCase().includes(specVal.toLowerCase())) fails = true
        else if (op === 'equals'    && cellVal !== specVal)                                    fails = true
        else if (op === 'gt'        && !(parseFloat(cellVal) > parseFloat(specVal)))           fails = true
        else if (op === 'lt'        && !(parseFloat(cellVal) < parseFloat(specVal)))           fails = true
        else if (op === 'empty'     && cellVal !== '')                                         fails = true
        else if (op === 'notempty'  && cellVal === '')                                         fails = true
        if (fails) { hidden.add(ri); break }
      }
    }
    return hidden
  }

  function getFilterConfig() { return filterConfig }

  return { sort, setFilter, clearFilter, clearAll, computeHiddenRows, getFilterConfig }
}
