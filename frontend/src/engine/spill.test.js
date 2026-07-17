import { describe, it, expect, beforeEach } from 'vitest'
import { createSpillEngine } from './spill.js'

const never = () => false   // nothing blocks

describe('SpillEngine — lay & query', () => {
  let s
  beforeEach(() => { s = createSpillEngine() })

  it('lays a 2×2 array and occupies the three non-anchor cells', () => {
    const res = s.lay('A1', [[1, 2], [3, 4]], 'S', never)
    expect(res.ok).toBe(true)
    expect(res.occupied.sort()).toEqual(['A2', 'B1', 'B2'])
    expect(s.isAnchor('A1', 'S')).toBe(true)
    expect(s.rectOf('A1', 'S')).toEqual({ r0: 0, c0: 0, r1: 1, c1: 1 })
  })

  it('resolves each spill cell to its array value; anchor is not a spill cell', () => {
    s.lay('A1', [[1, 2], [3, 4]], 'S', never)
    expect(s.valueAt('B1', 'S')).toBe(2)
    expect(s.valueAt('A2', 'S')).toBe(3)
    expect(s.valueAt('B2', 'S')).toBe(4)
    expect(s.valueAt('A1', 'S')).toBeUndefined()   // anchor value comes from eval, not here
    expect(s.ownerOf('B2', 'S')).toBe('A1')
    expect(s.isSpillCell('B1', 'S')).toBe(true)
  })

  it('a column spill (SORT-shaped) occupies the cells below', () => {
    const res = s.lay('C3', [[1], [2], [3]], 'S', never)
    expect(res.occupied.sort()).toEqual(['C4', 'C5'])
    expect(s.valueAt('C5', 'S')).toBe(3)
  })

  it('a 1×1 result is not a spill', () => {
    const res = s.lay('A1', [[42]], 'S', never)
    expect(res.ok).toBe(true)
    expect(res.occupied).toEqual([])
    expect(s.isAnchor('A1', 'S')).toBe(false)
  })
})

describe('SpillEngine — collision', () => {
  let s
  beforeEach(() => { s = createSpillEngine() })

  it('blocks the whole spill when any target is occupied and occupies nothing', () => {
    const res = s.lay('A1', [[1, 2, 3]], 'S', id => id === 'C1')   // C1 blocked
    expect(res.ok).toBe(false)
    expect(res.occupied).toEqual([])
    expect(s.isAnchor('A1', 'S')).toBe(false)
    expect(s.ownerOf('B1', 'S')).toBe(null)   // B1 not partially occupied either
  })

  it('a blocked re-lay still frees the prior spill (anchor → #SPILL!)', () => {
    s.lay('A1', [[1], [2], [3]], 'S', never)        // occupies A2, A3
    const res = s.lay('A1', [[1, 2]], 'S', id => id === 'B1')
    expect(res.ok).toBe(false)
    expect(res.freed.sort()).toEqual(['A2', 'A3'])   // old spill released
    expect(s.ownerOf('A2', 'S')).toBe(null)
    expect(s.isAnchor('A1', 'S')).toBe(false)
  })
})

describe('SpillEngine — reshape & clear', () => {
  let s
  beforeEach(() => { s = createSpillEngine() })

  it('re-laying a smaller array frees the cells the shrink vacated', () => {
    s.lay('A1', [[1, 2], [3, 4]], 'S', never)        // occupies B1, A2, B2
    const res = s.lay('A1', [[9, 8]], 'S', never)     // now 1×2 → occupies B1 only
    expect(res.freed.sort()).toEqual(['A2', 'B1', 'B2'])
    expect(res.occupied).toEqual(['B1'])
    expect(s.valueAt('B1', 'S')).toBe(8)
    expect(s.ownerOf('A2', 'S')).toBe(null)          // net-freed
    expect(s.ownerOf('B2', 'S')).toBe(null)
  })

  it('clear frees every occupied cell', () => {
    s.lay('A1', [[1, 2], [3, 4]], 'S', never)
    const freed = s.clear('A1', 'S')
    expect(freed.sort()).toEqual(['A2', 'B1', 'B2'])
    expect(s.isAnchor('A1', 'S')).toBe(false)
    expect(s.ownerOf('B1', 'S')).toBe(null)
  })

  it('clear on a non-anchor is a no-op', () => {
    expect(s.clear('Z9', 'S')).toEqual([])
  })
})

describe('SpillEngine — per-sheet isolation & lifecycle', () => {
  let s
  beforeEach(() => { s = createSpillEngine() })

  it('keeps spills per sheet', () => {
    s.lay('A1', [[1, 2]], 'S1', never)
    expect(s.ownerOf('B1', 'S1')).toBe('A1')
    expect(s.ownerOf('B1', 'S2')).toBe(null)
  })

  it('rename moves a sheet’s spills', () => {
    s.lay('A1', [[1, 2]], 'S1', never)
    s.renameSheet('S1', 'S2')
    expect(s.ownerOf('B1', 'S2')).toBe('A1')
    expect(s.ownerOf('B1', 'S1')).toBe(null)
  })

  it('duplicate deep-copies spills (independent after)', () => {
    s.lay('A1', [[1, 2]], 'S1', never)
    s.duplicateSheet('S1', 'S1 copy')
    s.clear('A1', 'S1')
    expect(s.ownerOf('B1', 'S1 copy')).toBe('A1')   // copy survives source clear
  })

  it('deleteSheet drops spills', () => {
    s.lay('A1', [[1, 2]], 'S1', never)
    s.deleteSheet('S1')
    expect(s.ownerOf('B1', 'S1')).toBe(null)
  })

  it('snapshot/restore round-trips and is independent of later edits', () => {
    s.lay('A1', [[1, 2], [3, 4]], 'S', never)
    const snap = s.snapshot()
    s.clear('A1', 'S')
    s.restore(snap)
    expect(s.valueAt('B2', 'S')).toBe(4)
    expect(s.rectOf('A1', 'S')).toEqual({ r0: 0, c0: 0, r1: 1, c1: 1 })
  })
})
