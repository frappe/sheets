import { describe, it, expect } from 'vitest'
import { computePivot, computePivotModel, pivotDrillDown, writePivotToSheet, createPivotEngine } from './pivot.js'

// getRangeValues stub — pivot only cares about the 2D array (row 0 = headers).
const ranged = (data) => () => data

describe('computePivot / computePivotModel', () => {
  const data = [
    ['territory', 'name'],
    ['India', 'a'],
    ['India', 'b'],
    ['Africa', 'c'],
  ]
  const config = { sourceSheet: 'S', sourceRange: 'A1:B4', rows: ['territory'], cols: [], values: [{ field: 'name', agg: 'count' }] }

  it('renders a COUNT pivot, rows sorted, with a grand total', () => {
    expect(computePivot(config, ranged(data))).toEqual([
      ['territory', 'COUNT(name)'],
      ['Africa', 1],
      ['India', 2],
      ['Grand Total', 3],
    ])
  })

  it('computePivot is a thin wrapper over the model table', () => {
    const model = computePivotModel(config, ranged(data))
    expect(model.table).toEqual(computePivot(config, ranged(data)))
    expect(model.rowKeyList).toEqual(['Africa', 'India'])
    expect(model.hasColFields).toBe(false)
  })

  it('returns null/[] when there is nothing to pivot', () => {
    expect(computePivotModel({ sourceRange: '', rows: [], cols: [], values: [] }, ranged(data))).toBeNull()
    expect(computePivot({ sourceRange: '', rows: [], cols: [], values: [] }, ranged(data))).toEqual([])
  })
})

describe('pivotDrillDown — no column fields', () => {
  const data = [
    ['territory', 'name'],
    ['India', 'a'],
    ['India', 'b'],
    ['Africa', 'c'],
  ]
  const config = { sourceSheet: 'S', sourceRange: 'A1:B4', rows: ['territory'], cols: [], values: [{ field: 'name', agg: 'count' }] }
  const model = computePivotModel(config, ranged(data))

  it('drills a value cell to its group rows', () => {
    // (1,1) = Africa count
    expect(pivotDrillDown(model, 1, 1)).toEqual({ headers: ['territory', 'name'], rows: [['Africa', 'c']] })
    // (2,1) = India count → both India rows
    expect(pivotDrillDown(model, 2, 1).rows).toEqual([['India', 'a'], ['India', 'b']])
  })

  it('drills a row-label cell to the whole group', () => {
    expect(pivotDrillDown(model, 2, 0).rows).toEqual([['India', 'a'], ['India', 'b']])
  })

  it('drills the grand-total row to every source row', () => {
    expect(pivotDrillDown(model, 3, 1).rows).toHaveLength(3)
  })

  it('returns null for the header row', () => {
    expect(pivotDrillDown(model, 0, 1)).toBeNull()
  })

  it('returns null past the last row', () => {
    expect(pivotDrillDown(model, 99, 1)).toBeNull()
  })
})

describe('pivotDrillDown — with column fields', () => {
  const data = [
    ['region', 'year', 'sales'],
    ['North', '2022', 10],
    ['North', '2023', 20],
    ['South', '2022', 5],
  ]
  const config = { sourceSheet: 'S', sourceRange: 'A1:C4', rows: ['region'], cols: ['year'], values: [{ field: 'sales', agg: 'sum' }] }
  const model = computePivotModel(config, ranged(data))

  it('drills a row × column intersection', () => {
    // header: [region, 2022, 2023, Grand Total]; row 1 = North
    expect(pivotDrillDown(model, 1, 1).rows).toEqual([['North', '2022', 10]])   // North/2022
    expect(pivotDrillDown(model, 1, 2).rows).toEqual([['North', '2023', 20]])   // North/2023
  })

  it('drills a row-total cell to all columns of that row', () => {
    expect(pivotDrillDown(model, 1, 3).rows).toEqual([['North', '2022', 10], ['North', '2023', 20]])
  })

  it('drills the grand total to every row', () => {
    const last = model.table.length - 1
    expect(pivotDrillDown(model, last, 3).rows).toHaveLength(3)
  })
})

// ── async (block-reading) parity + cancellation ───────────────────────────────

import { computePivotModelAsync } from './pivot.js'

// Range-aware stub: slices the 2D `data` by the requested A1:B2 rectangle, so
// the block reader sees the real rows for each block (the `ranged` stub above
// ignores the range and would hand back the header on every block).
function slicer(data) {
  const at = s => {
    const m = s.match(/^([A-Z]+)(\d+)$/)
    let col = 0
    for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
    return { col: col - 1, row: +m[2] - 1 }
  }
  return (start, end) => {
    const a = at(start), b = at(end)
    const out = []
    for (let r = a.row; r <= b.row; r++) out.push((data[r] || []).slice(a.col, b.col + 1))
    return out
  }
}

describe('computePivotModelAsync', () => {
  const data = [
    ['region', 'year', 'sales'],
    ['North', '2022', 10],
    ['North', '2023', 20],
    ['South', '2022', 5],
    ['South', '2023', 7],
  ]
  const config = { sourceSheet: 'S', sourceRange: 'A1:C5', rows: ['region'], cols: ['year'], values: [{ field: 'sales', agg: 'sum' }] }

  it('matches the sync table, even with a tiny block size forcing many yields', async () => {
    const sync = computePivotModel(config, ranged(data))
    const model = await computePivotModelAsync(config, slicer(data), { blockRows: 1 })
    expect(model.table).toEqual(sync.table)
  })

  it('bails out when onYield reports it was superseded', async () => {
    const model = await computePivotModelAsync(config, slicer(data), { blockRows: 1, onYield: () => false })
    expect(model).toBeNull()
  })
})

describe('writePivotToSheet — anchor offset & rect clear', () => {
  const cid = (r, c) => String.fromCharCode(65 + c) + (r + 1)
  const table = [['H1', 'H2'], ['a', 1], ['Grand Total', 5]]

  it('writes at A1 by default and clears nothing on first render', () => {
    const cells = {}
    const cleared = []
    writePivotToSheet(table, 'Out',
      (id, v) => { cells[id] = v },
      (sh, ext) => cleared.push(ext))
    expect(cells.A1).toBe('H1')
    expect(cells.B3).toBe(5)
    expect(cleared).toEqual([null])   // prevExtent null → nothing cleared
  })

  it('offsets every write by the anchor', () => {
    const cells = {}
    writePivotToSheet(table, 'Out',
      (id, v) => { cells[id] = v },
      () => {},
      { row: 0, col: 7 })             // anchor at H1
    expect(cells.H1).toBe('H1')       // top-left lands at the anchor
    expect(cells.I3).toBe(5)          // bottom-right offset too
    expect(cells.A1).toBeUndefined()  // nothing written at the origin
  })

  it('passes the previous extent to clearRect so only the old rect is wiped', () => {
    const prev = { r0: 0, c0: 7, r1: 9, c1: 8 }
    let got = null
    writePivotToSheet(table, 'Out', () => {}, (sh, ext) => { got = ext }, { row: 0, col: 7 }, prev)
    expect(got).toEqual(prev)
  })
})

describe('createPivotEngine — anchors, extent, snapshot', () => {
  it('defaults anchorRow/anchorCol to 0 on add, honouring an explicit anchor', () => {
    const e = createPivotEngine()
    const id1 = e.add({ outputSheet: 'S', rows: ['R'], values: [] })
    expect(e.get(id1)).toMatchObject({ anchorRow: 0, anchorCol: 0 })
    const id2 = e.add({ outputSheet: 'S', rows: ['R'], values: [], anchorRow: 3, anchorCol: 7 })
    expect(e.get(id2)).toMatchObject({ anchorRow: 3, anchorCol: 7 })
  })

  it('restore() defaults missing anchors but keeps a stored 0', () => {
    const e = createPivotEngine()
    e.restore({ pivots: {
      old: { id: 'old', outputSheet: 'S', rows: ['R'], values: [] },        // pre-anchor config
      zero: { id: 'zero', outputSheet: 'S', rows: ['R'], values: [], anchorRow: 0, anchorCol: 0 },
    }, nextId: 9 })
    expect(e.get('old')).toMatchObject({ anchorRow: 0, anchorCol: 0 })
    expect(e.get('zero')).toMatchObject({ anchorRow: 0, anchorCol: 0 })
  })

  it('setExtent caches a rect without notifying, and snapshot strips it', () => {
    const e = createPivotEngine()
    let notifications = 0
    e.setOnChange(() => { notifications++ })
    const id = e.add({ outputSheet: 'S', rows: ['R'], values: [] })  // 1 notify
    e.setExtent(id, { r0: 0, c0: 0, r1: 5, c1: 1 })
    expect(e.get(id)._extent).toEqual({ r0: 0, c0: 0, r1: 5, c1: 1 })
    expect(notifications).toBe(1)                                    // setExtent silent
    const snap = e.snapshot()
    expect(snap.pivots[id]).not.toHaveProperty('_extent')            // transient, not persisted
  })
})
