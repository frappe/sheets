import { describe, it, expect, beforeEach } from 'vitest'
import { createClipboard } from './clipboard.js'

function makeSheet(initial = {}) {
  const store = { ...initial }
  return {
    getRawData:     () => store,
    getCell:        id => store[id] ?? '',
    setCell:        (id, v) => { store[id] = v },
    getCurrentSheet: () => 'Sheet1',
    getDisplayValue: id => store[id] ?? '',
    _store: () => store,
  }
}

describe('clipboard — copy/paste a pivot', () => {
  let sheet
  const pivotBlob = { sourceSheet: 'Src', sourceRange: 'A1:B9', rows: ['R'], cols: [], values: [{ field: 'V', agg: 'sum' }] }

  beforeEach(() => { sheet = makeSheet({ A1: 'H1', A2: 'a', B2: 1 }) })

  it('captures the pivot blob when the copied range overlaps a pivot', () => {
    const cb = createClipboard({ sheet, getPivotAt: () => pivotBlob })
    cb.copy({ r0: 0, c0: 0, r1: 2, c1: 1 })
    expect(cb.getPivotBlob()).toEqual(pivotBlob)
  })

  it('a full paste mints a new pivot at the anchor instead of writing cells', () => {
    const calls = []
    const cb = createClipboard({
      sheet,
      getPivotAt: () => pivotBlob,
      createPivotFromPaste: (blob, anchorId, sn) => { calls.push({ blob, anchorId, sn }) },
    })
    cb.copy({ r0: 0, c0: 0, r1: 2, c1: 1 })
    cb.paste('H1', null, 'all')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ blob: pivotBlob, anchorId: 'H1' })
    expect(sheet.getCell('H1')).toBe('')   // no static cells written
  })

  it('paste-special (values) ignores the blob and pastes dead cells', () => {
    const calls = []
    const cb = createClipboard({
      sheet,
      getPivotAt: () => pivotBlob,
      createPivotFromPaste: (...a) => { calls.push(a) },
    })
    cb.copy({ r0: 0, c0: 0, r1: 2, c1: 1 })
    cb.paste('H1', null, 'values')
    expect(calls).toHaveLength(0)          // not treated as a pivot
    expect(sheet.getCell('H1')).toBe('H1') // static value pasted
  })

  it('clears the captured blob on clear()', () => {
    const cb = createClipboard({ sheet, getPivotAt: () => pivotBlob })
    cb.copy({ r0: 0, c0: 0, r1: 2, c1: 1 })
    cb.clear()
    expect(cb.getPivotBlob()).toBeNull()
  })
})

describe('clipboard — destination-aware paste', () => {
  let sheet, cb
  beforeEach(() => {
    sheet = makeSheet({ A1: 'X' })
    cb = createClipboard({ sheet })
  })

  it('1×1 source pasted into a multi-cell selection fills every dest cell', () => {
    cb.copy({ r0: 0, c0: 0, r1: 0, c1: 0 })
    cb.paste('B1', null, 'all', { r0: 0, c0: 1, r1: 0, c1: 3 })       // B1:D1
    expect(sheet.getCell('B1')).toBe('X')
    expect(sheet.getCell('C1')).toBe('X')
    expect(sheet.getCell('D1')).toBe('X')
  })

  it('1×1 source into a multi-row + multi-col selection tiles fully', () => {
    cb.copy({ r0: 0, c0: 0, r1: 0, c1: 0 })
    cb.paste('B2', null, 'all', { r0: 1, c0: 1, r1: 2, c1: 2 })       // B2:C3
    expect(sheet.getCell('B2')).toBe('X')
    expect(sheet.getCell('C2')).toBe('X')
    expect(sheet.getCell('B3')).toBe('X')
    expect(sheet.getCell('C3')).toBe('X')
  })

  it('multi-cell source tiles into a destination that is an integer multiple', () => {
    sheet = makeSheet({ A1: '1', B1: '2' })
    cb = createClipboard({ sheet })
    cb.copy({ r0: 0, c0: 0, r1: 0, c1: 1 })                            // A1:B1 = [1, 2]
    cb.paste('A2', null, 'all', { r0: 1, c0: 0, r1: 1, c1: 3 })        // A2:D2
    expect(sheet.getCell('A2')).toBe('1')
    expect(sheet.getCell('B2')).toBe('2')
    expect(sheet.getCell('C2')).toBe('1')
    expect(sheet.getCell('D2')).toBe('2')
  })

  it('non-tileable destination falls back to anchor paste', () => {
    sheet = makeSheet({ A1: '1', B1: '2' })
    cb = createClipboard({ sheet })
    cb.copy({ r0: 0, c0: 0, r1: 0, c1: 1 })                            // 2 cols
    cb.paste('A2', null, 'all', { r0: 1, c0: 0, r1: 1, c1: 2 })        // 3 cols → not divisible
    expect(sheet.getCell('A2')).toBe('1')
    expect(sheet.getCell('B2')).toBe('2')
    expect(sheet.getCell('C2')).toBe('')                                // untouched
  })

  it('single-cell destination behaves the same as no destSel', () => {
    cb.copy({ r0: 0, c0: 0, r1: 0, c1: 0 })
    cb.paste('B1', null, 'all', { r0: 0, c0: 1, r1: 0, c1: 1 })
    expect(sheet.getCell('B1')).toBe('X')
    expect(sheet.getCell('C1')).toBe('')
  })

  it('pasteFromText tiles a single token across a multi-cell destination', () => {
    cb.pasteFromText('hello', 'B1', null, { r0: 0, c0: 1, r1: 0, c1: 3 })
    expect(sheet.getCell('B1')).toBe('hello')
    expect(sheet.getCell('C1')).toBe('hello')
    expect(sheet.getCell('D1')).toBe('hello')
  })

  it('pasteFromText with a single token but single-cell dest writes one cell', () => {
    cb.pasteFromText('hi', 'B1', null, { r0: 0, c0: 1, r1: 0, c1: 1 })
    expect(sheet.getCell('B1')).toBe('hi')
    expect(sheet.getCell('C1')).toBe('')
  })
})

describe('clipboard — cut clears the source but not overlapping dest cells', () => {
  it('cut C2:C7 then paste at C3:C8 shifts the column down by one row', () => {
    // Repro for the "all values vanish, only the last survives" bug: the
    // cut-clear pass used to wipe the whole source range, including cells
    // that had just received the pasted content.
    const sheet = makeSheet({ C2: '1', C3: '2', C4: '3', C5: '4', C6: '5', C7: '6' })
    const cb = createClipboard({ sheet })
    cb.cut({ r0: 1, c0: 2, r1: 6, c1: 2 })                    // C2:C7
    cb.paste('C3', null, 'all', { r0: 2, c0: 2, r1: 7, c1: 2 }) // C3:C8
    expect(sheet.getCell('C2')).toBe('')                       // source-only cell vacated
    expect(sheet.getCell('C3')).toBe('1')
    expect(sheet.getCell('C4')).toBe('2')
    expect(sheet.getCell('C5')).toBe('3')
    expect(sheet.getCell('C6')).toBe('4')
    expect(sheet.getCell('C7')).toBe('5')
    expect(sheet.getCell('C8')).toBe('6')
  })

  it('cut still fully vacates the source when there is no overlap', () => {
    const sheet = makeSheet({ A1: '1', A2: '2' })
    const cb = createClipboard({ sheet })
    cb.cut({ r0: 0, c0: 0, r1: 1, c1: 0 })                    // A1:A2
    cb.paste('C1', null, 'all')                                // C1:C2 — no overlap
    expect(sheet.getCell('A1')).toBe('')
    expect(sheet.getCell('A2')).toBe('')
    expect(sheet.getCell('C1')).toBe('1')
    expect(sheet.getCell('C2')).toBe('2')
  })
})
