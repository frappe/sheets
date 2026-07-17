// Spill engine — the state machine behind array-formula spilling.
//
// When a formula evaluates to a 2-D array, the cell holding it becomes a spill
// *anchor*; the array lays out across the anchor plus the cells below/right of
// it. Those neighbour cells are *spill cells*: they hold no value of their own,
// derive their value from the anchor's array, and are read-only. If the spill
// would land on a cell that already has content, it's blocked and the anchor
// shows #SPILL! instead (the caller decides that from a { ok:false } result).
//
// This module is pure state + geometry — it never touches the sheet data or the
// evaluator. The sheet engine drives it: it evaluates the anchor, hands the 2-D
// values here, and supplies an `isBlocked(id)` probe (own content / another
// spill) for collision detection. Mirrors the merge engine's master/slave shape.

import { parseCellId, cellId } from '../utils/cells.js'
import { deepClone } from '../utils/deep-clone.js'

export function createSpillEngine() {
  // anchors[sheet][anchorId] = { rows, cols, values }   — the laid-out array
  // owner[sheet][cellId]     = anchorId                 — spill cell → its anchor
  //                                                       (the anchor is NOT in owner)
  const anchors = {}
  const owner   = {}

  function _ea(s) { return anchors[s] || (anchors[s] = {}) }
  function _eo(s) { return owner[s]   || (owner[s]   = {}) }

  // The cells a spill of the given size occupies besides the anchor.
  function _targets(anchorId, rows, cols) {
    const a = parseCellId(anchorId)
    const out = []
    if (!a) return out
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (r || c) out.push(cellId(a.row + r, a.col + c))
    return out
  }

  // ── Mutations ────────────────────────────────────────────────────────────────

  // Lay (or re-lay) the spill for `anchorId` from its 2-D `values`. `isBlocked(id)`
  // returns true when a target cell can't be occupied (has its own content, or
  // belongs to a different anchor). Returns:
  //   { ok:true,  freed, occupied }  — spilled; `freed` = cells released from the
  //                                    prior spill, `occupied` = cells now owned.
  //   { ok:false, freed, occupied:[] } — collision; nothing occupied, anchor should
  //                                    render #SPILL!. Prior spill is still cleared.
  // A 1×1 array is not a spill: it clears any prior spill and occupies nothing.
  function lay(anchorId, values, sheet, isBlocked) {
    const freed = clear(anchorId, sheet)
    const rows = values.length
    const cols = rows ? values[0].length : 0
    if (rows <= 1 && cols <= 1) return { ok: true, freed, occupied: [] }

    const targets = _targets(anchorId, rows, cols)
    for (const id of targets) {
      if (isBlocked(id)) return { ok: false, freed, occupied: [] }
    }
    _ea(sheet)[anchorId] = { rows, cols, values }
    const o = _eo(sheet)
    for (const id of targets) o[id] = anchorId
    return { ok: true, freed, occupied: targets }
  }

  // Remove the spill anchored at `anchorId`. Returns the cells it freed.
  function clear(anchorId, sheet) {
    const a = anchors[sheet]?.[anchorId]
    if (!a) return []
    const freed = _targets(anchorId, a.rows, a.cols)
    const o = owner[sheet]
    for (const id of freed) if (o && o[id] === anchorId) delete o[id]
    delete anchors[sheet][anchorId]
    return freed
  }

  // ── Queries ──────────────────────────────────────────────────────────────────

  function ownerOf(id, sheet)  { return owner[sheet]?.[id] || null }
  function isAnchor(id, sheet) { return !!anchors[sheet]?.[id] }
  function isSpillCell(id, sheet) { return !!owner[sheet]?.[id] }

  // The value the anchor's array places at `id`, or undefined if `id` isn't a
  // spill cell (the anchor's own value comes from the normal evaluation path).
  function valueAt(id, sheet) {
    const anchorId = owner[sheet]?.[id]
    if (!anchorId) return undefined
    const a  = anchors[sheet][anchorId]
    const ap = parseCellId(anchorId)
    const p  = parseCellId(id)
    return a.values[p.row - ap.row]?.[p.col - ap.col]
  }

  // The rect an anchor's spill covers (inclusive), or null if not an anchor.
  function rectOf(anchorId, sheet) {
    const a = anchors[sheet]?.[anchorId]
    if (!a) return null
    const p = parseCellId(anchorId)
    return { r0: p.row, c0: p.col, r1: p.row + a.rows - 1, c1: p.col + a.cols - 1 }
  }

  // All anchor ids on a sheet (for re-materialisation / repaint sweeps).
  function anchorIds(sheet) { return Object.keys(anchors[sheet] || {}) }

  // ── Sheet lifecycle ──────────────────────────────────────────────────────────

  function clearSheet(sheet) { delete anchors[sheet]; delete owner[sheet] }
  function renameSheet(oldName, newName) {
    if (anchors[oldName]) { anchors[newName] = anchors[oldName]; delete anchors[oldName] }
    if (owner[oldName])   { owner[newName]   = owner[oldName];   delete owner[oldName] }
  }
  function duplicateSheet(src, dst) {
    if (anchors[src]) anchors[dst] = deepClone(anchors[src])
    if (owner[src])   owner[dst]   = deepClone(owner[src])
  }
  function deleteSheet(name) { clearSheet(name) }

  function snapshot() { return { anchors: deepClone(anchors), owner: deepClone(owner) } }
  function restore(snap) {
    for (const k of Object.keys(anchors)) delete anchors[k]
    for (const k of Object.keys(owner))   delete owner[k]
    if (!snap) return
    Object.assign(anchors, deepClone(snap.anchors || {}))
    Object.assign(owner,   deepClone(snap.owner   || {}))
  }

  return {
    lay, clear,
    ownerOf, isAnchor, isSpillCell, valueAt, rectOf, anchorIds,
    clearSheet, renameSheet, duplicateSheet, deleteSheet,
    snapshot, restore,
  }
}
