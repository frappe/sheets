import { describe, it, expect, vi } from 'vitest'
import { createHistory } from './history.js'

// The history is a generic snapshot/restore stack. Two distinct behaviours
// to verify here: (a) the classic full-restore on undo when no collab is
// running, and (b) the conflict-aware path where each pushed snapshot
// remembers the local-only touches that arrived after it, so a later undo
// reverts ONLY those touches and leaves remote-applied keys alone.

describe('history — basic stack semantics', () => {
  it('init seeds the first snapshot and is idempotent', () => {
    const snapshot = vi.fn(() => 1)
    const h = createHistory({ snapshot, restore: () => {} })
    h.init()
    h.init()
    expect(snapshot).toHaveBeenCalledTimes(1)
  })

  it('undo restores the previous full snapshot', () => {
    const snapshots = ['A', 'B', 'C']
    let idx = 0
    const restore = vi.fn()
    const h = createHistory({ snapshot: () => snapshots[idx++], restore })
    h.push(); h.push(); h.push()
    expect(h.undo()).toBe(true)
    expect(restore).toHaveBeenLastCalledWith('B', { touches: null })
  })

  it('redo replays the snapshot we undid past', () => {
    const restore = vi.fn()
    const h = createHistory({ snapshot: () => Math.random(), restore })
    h.push(); h.push()
    h.undo()
    restore.mockClear()
    expect(h.redo()).toBe(true)
    expect(restore).toHaveBeenCalledTimes(1)
  })
})

describe('history — conflict-aware touches', () => {
  it('each entry remembers the touches of the op that produced it, and undo passes them through', () => {
    // Push N captures (snap_N, drain_N) where drain_N is the cells op-N
    // touched. Undo from index N → N-1 should restore snap_{N-1} AND
    // signal drain_N as the cells to revert.
    let snapCalls = 0, drainCalls = 0
    const drains = []
    const restore = vi.fn()
    const h = createHistory({
      snapshot:        () => `snap${snapCalls++}`,
      restore,
      getLocalTouches: () => {
        const t = new Set([`Sheet1|cell${drainCalls++}`])
        drains.push(t)
        return t
      },
    })
    h.push(); h.push(); h.push()
    // Stack: [{snap0,d0}, {snap1,d1}, {snap2,d2}], index=2.
    h.undo()  // 2 → 1: restore snap1, signal d2 as the cells to revert.
    expect(restore).toHaveBeenLastCalledWith('snap1', { touches: drains[2] })
    h.undo()  // 1 → 0: restore snap0, signal d1.
    expect(restore).toHaveBeenLastCalledWith('snap0', { touches: drains[1] })
  })

  it('redo always full-restores (touches: null) — undo is the safer direction', () => {
    let i = 0
    const restore = vi.fn()
    const h = createHistory({
      snapshot:        () => `snap${i}`,
      restore,
      getLocalTouches: () => new Set([`touch${i++}`]),
    })
    h.push(); h.push()
    h.undo()
    restore.mockClear()
    h.redo()
    const [, opts] = restore.mock.calls[0]
    expect(opts.touches).toBeNull()
  })

  it('falls back to a null touches argument when getLocalTouches is not provided', () => {
    const restore = vi.fn()
    const h = createHistory({ snapshot: () => 'x', restore })
    h.push(); h.push()
    h.undo()
    expect(restore).toHaveBeenLastCalledWith('x', { touches: null })
  })
})

// Op-based history avoids the per-edit deep-clone snapshot — high-frequency
// cell edits push a tiny {before, after} diff instead, and undo / redo
// dispatch through applyOp / revertOp callbacks. Mixed mode (some entries
// are ops, others are snapshots) is the supported migration path.

describe('history — op-based entries', () => {
  it('pushOp records an entry without calling snapshot()', () => {
    const snapshot = vi.fn(() => 'snap')
    const restore  = vi.fn()
    const h = createHistory({ snapshot, restore, applyOp: vi.fn(), revertOp: vi.fn() })
    h.init()                                     // 1 snapshot for the base
    snapshot.mockClear()
    h.pushOp({ opType: 'edit', after: { A1: '1' } })
    h.pushOp({ opType: 'edit', after: { A1: '2' } })
    expect(snapshot).not.toHaveBeenCalled()
  })

  it('undo dispatches to revertOp for op entries', () => {
    const revertOp = vi.fn()
    const h = createHistory({ snapshot: () => null, restore: vi.fn(), applyOp: vi.fn(), revertOp })
    h.init()
    h.pushOp({ opType: 'edit', before: { A1: 'old' }, after: { A1: 'new' } })
    h.undo()
    expect(revertOp).toHaveBeenCalledTimes(1)
    expect(revertOp.mock.calls[0][0].before.A1).toBe('old')
  })

  it('redo dispatches to applyOp for op entries', () => {
    const applyOp = vi.fn()
    const h = createHistory({ snapshot: () => null, restore: vi.fn(), applyOp, revertOp: vi.fn() })
    h.init()
    h.pushOp({ opType: 'edit', before: { A1: 'old' }, after: { A1: 'new' } })
    h.undo()
    h.redo()
    expect(applyOp).toHaveBeenCalledTimes(1)
    expect(applyOp.mock.calls[0][0].after.A1).toBe('new')
  })

  it('mixed stack: undo past an op entry to a snapshot entry restores the snapshot', () => {
    const restore  = vi.fn()
    const revertOp = vi.fn()
    let snapId = 0
    const h = createHistory({
      snapshot: () => `snap${snapId++}`,
      restore, applyOp: vi.fn(), revertOp,
    })
    h.init()                                     // stack: [snap0]
    h.push()                                     // stack: [snap0, snap1]
    h.pushOp({ opType: 'edit', before: { A1: 'x' }, after: { A1: 'y' } })  // stack: [snap0, snap1, op]
    // index=2 (the op). Undo → revertOp + index=1 (snap1, but state already
    // coherent, no restore call needed).
    h.undo()
    expect(revertOp).toHaveBeenCalledTimes(1)
    expect(restore).not.toHaveBeenCalled()
    // Undo again → index=0 (snap0). Snap entry → restore('snap0').
    h.undo()
    expect(restore).toHaveBeenLastCalledWith('snap0', { touches: null })
  })

  it('canUndo / canRedo treat ops the same as snapshots for the stack walk', () => {
    const h = createHistory({ snapshot: () => 'x', restore: vi.fn(), applyOp: vi.fn(), revertOp: vi.fn() })
    h.init()
    h.pushOp({ opType: 'edit' })
    expect(h.canUndo()).toBe(true)
    expect(h.canRedo()).toBe(false)
    h.undo()
    expect(h.canUndo()).toBe(false)
    expect(h.canRedo()).toBe(true)
  })

  it('pushing a new entry after an undo drops everything past the cursor', () => {
    const applyOp = vi.fn()
    const h = createHistory({ snapshot: () => 'x', restore: vi.fn(), applyOp, revertOp: vi.fn() })
    h.init()
    h.pushOp({ opType: 'edit', after: { A1: '1' } })
    h.pushOp({ opType: 'edit', after: { A1: '2' } })
    h.undo()                                     // back to op #1
    h.pushOp({ opType: 'edit', after: { A1: '3' } })  // truncates op #2
    expect(h.canRedo()).toBe(false)
  })
})
