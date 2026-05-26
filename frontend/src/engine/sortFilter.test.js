import { describe, it, expect, beforeEach } from 'vitest'
import { createSortFilter } from './sortFilter.js'

function makeSheet(initial = {}, displayOverrides = {}) {
  const store = { ...initial }
  return {
    getRawData: () => store,
    getCell: id => store[id] ?? '',
    setCell: (id, v) => { store[id] = v },
    // Mirrors the real engine: formula cells return their evaluated value
    // via getDisplayValue. Test passes `displayOverrides` to stub the result
    // of any cell whose raw value would otherwise be a formula string.
    getDisplayValue: id => displayOverrides[id] ?? store[id] ?? '',
  }
}

describe('createSortFilter — ranged + per-sheet filters', () => {
  let sheet, sf
  beforeEach(() => {
    sheet = makeSheet({
      // Row 0 — outside the filter range (data above the range stays visible)
      A1: 'header-above', B1: 'header-above',
      // A2:D5 is the active range  →  row 1 is the header, rows 2-4 are data
      A2: 'Name', B2: 'Score', C2: 'City',   D2: 'Tier',
      A3: 'alice', B3: '10',   C3: 'Pune',   D3: 'gold',
      A4: 'bob',   B4: '20',   C4: 'Mumbai', D4: 'silver',
      A5: 'carl',  B5: '5',    C5: 'Pune',   D5: 'gold',
      // Row 5 (index 5) is outside the range — stays visible
      A6: 'below', B6: 'below', C6: 'below', D6: 'below',
    })
    sf = createSortFilter(sheet)
    sf.setRange({ r0: 1, c0: 0, r1: 4, c1: 3 }, 'Sheet1')
  })

  describe('range management', () => {
    it('hasFilter is true once a range is set', () => {
      expect(sf.hasFilter('Sheet1')).toBe(true)
      expect(sf.hasFilter('Sheet2')).toBe(false)
    })

    it('getRange returns the stored range', () => {
      expect(sf.getRange('Sheet1')).toEqual({ r0: 1, c0: 0, r1: 4, c1: 3 })
    })

    it('clearRange removes the range and its byCol specs', () => {
      sf.setFilter(1, { operator: 'gt', value: '5' }, 'Sheet1')
      sf.clearRange('Sheet1')
      expect(sf.hasFilter('Sheet1')).toBe(false)
      expect(sf.getFilterConfig('Sheet1')).toEqual({})
    })

    it('setRange replaces an existing range and drops out-of-range specs', () => {
      sf.setFilter(3, { operator: 'contains', value: 'gold' }, 'Sheet1')
      sf.setRange({ r0: 1, c0: 0, r1: 4, c1: 1 }, 'Sheet1')   // shrink to A:B
      expect(sf.getFilterConfig('Sheet1')[3]).toBeUndefined()
    })
  })

  describe('per-column specs', () => {
    it('setFilter inside the range stores the spec', () => {
      sf.setFilter(1, { operator: 'gt', value: '5' }, 'Sheet1')
      expect(sf.getFilterConfig('Sheet1')).toEqual({ 1: { operator: 'gt', value: '5' } })
    })

    it('setFilter on a column outside the range is a no-op', () => {
      sf.setFilter(8, { operator: 'contains', value: 'x' }, 'Sheet1')
      expect(sf.getFilterConfig('Sheet1')).toEqual({})
    })

    it('setFilter without a range set is a no-op', () => {
      sf.setFilter(0, { operator: 'contains', value: 'x' }, 'Sheet2')
      expect(sf.getFilterConfig('Sheet2')).toEqual({})
    })
  })

  describe('computeHiddenRows', () => {
    it('only hides rows inside the range', () => {
      sf.setFilter(1, { operator: 'gt', value: '8' }, 'Sheet1')   // keep rows whose B > 8
      const hidden = sf.computeHiddenRows('Sheet1')
      expect(hidden.has(0)).toBe(false)   // header-above
      expect(hidden.has(1)).toBe(false)   // header row of the range
      expect(hidden.has(2)).toBe(false)   // alice (10) — kept
      expect(hidden.has(3)).toBe(false)   // bob (20) — kept
      expect(hidden.has(4)).toBe(true)    // carl (5) — hidden
      expect(hidden.has(5)).toBe(false)   // below — outside range, stays visible
    })

    it('returns an empty set when there is no range', () => {
      sf.clearRange('Sheet1')
      sf.setFilter(1, { operator: 'gt', value: '8' }, 'Sheet1')   // no-op without range
      expect(sf.computeHiddenRows('Sheet1').size).toBe(0)
    })

    it('returns an empty set for a sheet with no filter at all', () => {
      expect(sf.computeHiddenRows('Sheet2').size).toBe(0)
    })

    it('does not leak between sheets', () => {
      sf.setFilter(1, { operator: 'gt', value: '99' }, 'Sheet1')
      expect(sf.computeHiddenRows('Sheet2').size).toBe(0)
    })

    it('end-to-end: "contains 0" on a mixed-number column hides non-zero rows', () => {
      // Reproducing the user-reported scenario: column A has plain-number
      // cells like 4, 8, 12, 20, 306, 606, 1212, 2402. Applying a "contains 0"
      // filter on column A must keep rows whose stringified value contains
      // "0" (20, 306, 606, 2402) and hide the rest (4, 8, 12, 1212).
      const numericSheet = makeSheet({
        A1: 'column 1',   // header
        A2: 4,    A3: 8,    A4: 12,   A5: 20,
        A6: 306,  A7: 606,  A8: 1212, A9: 2402,
      })
      const nsf = createSortFilter(numericSheet)
      nsf.setRange({ r0: 0, c0: 0, r1: 8, c1: 0 }, 'Sheet1')
      nsf.setFilter(0, { operator: 'contains', value: '0' }, 'Sheet1')
      const hidden = nsf.computeHiddenRows('Sheet1')
      expect(hidden.has(1)).toBe(true)    // 4   — hidden
      expect(hidden.has(2)).toBe(true)    // 8   — hidden
      expect(hidden.has(3)).toBe(true)    // 12  — hidden
      expect(hidden.has(4)).toBe(false)   // 20  — visible
      expect(hidden.has(5)).toBe(false)   // 306 — visible
      expect(hidden.has(6)).toBe(false)   // 606 — visible
      expect(hidden.has(7)).toBe(true)    // 1212 — hidden
      expect(hidden.has(8)).toBe(false)   // 2402 — visible
    })

    it('matches against the displayed (evaluated) value, not the raw formula', () => {
      // B3 / B4 store formulas; the engine resolves them to 306 / 6.
      // A "contains 0" filter on B must match B3 (306 contains "0") but not
      // B4 (6 does not). With raw-cell comparison, neither "=A1*B1" nor
      // "=B5-B6" contains "0", so the regression returned both rows hidden.
      const formulaSheet = makeSheet({
        A2: 'Name', B2: 'Score',
        A3: 'alice', B3: '=A1*B1',
        A4: 'bob',   B4: '=B5-B6',
      }, {
        B3: '306',
        B4: '6',
      })
      const fsf = createSortFilter(formulaSheet)
      fsf.setRange({ r0: 1, c0: 0, r1: 3, c1: 1 }, 'Sheet1')
      fsf.setFilter(1, { operator: 'contains', value: '0' }, 'Sheet1')
      const hidden = fsf.computeHiddenRows('Sheet1')
      expect(hidden.has(2)).toBe(false)   // B3 → "306" — kept
      expect(hidden.has(3)).toBe(true)    // B4 → "6"   — hidden
    })
  })

  describe('insert / delete row & column adjustments', () => {
    it('insertRow above the range shifts both bounds down', () => {
      sf.insertRow(0, 'Sheet1')
      expect(sf.getRange('Sheet1')).toEqual({ r0: 2, c0: 0, r1: 5, c1: 3 })
    })

    it('insertRow inside the range extends the bottom bound', () => {
      sf.insertRow(3, 'Sheet1')
      expect(sf.getRange('Sheet1')).toEqual({ r0: 1, c0: 0, r1: 5, c1: 3 })
    })

    it('deleteRow inside the range shrinks the bottom bound', () => {
      sf.deleteRow(3, 'Sheet1')
      expect(sf.getRange('Sheet1')).toEqual({ r0: 1, c0: 0, r1: 3, c1: 3 })
    })

    it('deleting every data row clears the filter', () => {
      sf.deleteRow(2, 'Sheet1'); sf.deleteRow(2, 'Sheet1'); sf.deleteRow(2, 'Sheet1')
      expect(sf.getRange('Sheet1')).toEqual({ r0: 1, c0: 0, r1: 1, c1: 3 })
      sf.deleteRow(1, 'Sheet1')   // remove the header row too
      expect(sf.hasFilter('Sheet1')).toBe(false)
    })

    it('insertCol inside the range shifts byCol keys', () => {
      sf.setFilter(2, { operator: 'contains', value: 'Pune' }, 'Sheet1')
      sf.insertCol(1, 'Sheet1')
      expect(sf.getRange('Sheet1')).toEqual({ r0: 1, c0: 0, r1: 4, c1: 4 })
      expect(sf.getFilterConfig('Sheet1')).toEqual({ 3: { operator: 'contains', value: 'Pune' } })
    })

    it('deleteCol inside the range drops the spec on that column and shifts the rest', () => {
      sf.setFilter(1, { operator: 'gt', value: '5' }, 'Sheet1')
      sf.setFilter(2, { operator: 'contains', value: 'Pune' }, 'Sheet1')
      sf.deleteCol(1, 'Sheet1')
      expect(sf.getRange('Sheet1')).toEqual({ r0: 1, c0: 0, r1: 4, c1: 2 })
      expect(sf.getFilterConfig('Sheet1')).toEqual({ 1: { operator: 'contains', value: 'Pune' } })
    })
  })

  describe('sheet-level operations', () => {
    it('rename moves the filter to the new sheet name', () => {
      sf.setFilter(1, { operator: 'gt', value: '5' }, 'Sheet1')
      sf.renameSheet('Sheet1', 'Data')
      expect(sf.hasFilter('Sheet1')).toBe(false)
      expect(sf.hasFilter('Data')).toBe(true)
      expect(sf.getFilterConfig('Data')).toEqual({ 1: { operator: 'gt', value: '5' } })
    })

    it('duplicate deep-copies the filter to the new sheet', () => {
      sf.setFilter(1, { operator: 'gt', value: '5' }, 'Sheet1')
      sf.duplicateSheet('Sheet1', 'Copy')
      expect(sf.getRange('Copy')).toEqual({ r0: 1, c0: 0, r1: 4, c1: 3 })
      sf.clearRange('Sheet1')
      expect(sf.hasFilter('Copy')).toBe(true)
    })

    it('snapshot / restore round-trips range + byCol', () => {
      sf.setFilter(1, { operator: 'gt', value: '5' }, 'Sheet1')
      const snap = sf.snapshot()
      sf.clearRange('Sheet1')
      sf.restore(snap)
      expect(sf.getRange('Sheet1')).toEqual({ r0: 1, c0: 0, r1: 4, c1: 3 })
      expect(sf.getFilterConfig('Sheet1')).toEqual({ 1: { operator: 'gt', value: '5' } })
    })
  })

  describe('sort within range', () => {
    it('sorts only the rows inside the range, keeping the header and outside rows', () => {
      sf.sort(0, 'asc', 'Sheet1')                     // sort by Name
      expect(sheet.getCell('A2')).toBe('Name')        // header untouched
      expect(sheet.getCell('A3')).toBe('alice')
      expect(sheet.getCell('A4')).toBe('bob')
      expect(sheet.getCell('A5')).toBe('carl')
      expect(sheet.getCell('A6')).toBe('below')       // outside range untouched
    })

    it('refuses to sort a column outside the range', () => {
      sf.sort(99, 'asc', 'Sheet1')                    // no-op
      expect(sheet.getCell('A3')).toBe('alice')
    })
  })
})
