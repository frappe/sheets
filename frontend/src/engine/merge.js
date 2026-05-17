import { cellId, parseCellId } from '../utils/cells.js'

export function createMergeEngine() {
  const masterMap = {}   // cellId → { rowSpan, colSpan, r, c }
  const slaveMap  = {}   // cellId → masterCellId

  function merge(r0, c0, r1, c1) {
    _unmergeRect(r0, c0, r1, c1)
    if (r0 === r1 && c0 === c1) return
    const mid = cellId(r0, c0)
    masterMap[mid] = { rowSpan: r1 - r0 + 1, colSpan: c1 - c0 + 1, r: r0, c: c0 }
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++)
        if (!(r === r0 && c === c0)) slaveMap[cellId(r, c)] = mid
  }

  function unmerge(r0, c0, r1, c1) {
    _unmergeRect(r0, c0, r1, c1)
  }

  function _unmergeRect(r0, c0, r1, c1) {
    for (const mid of Object.keys(masterMap)) {
      const { r: mr, c: mc, rowSpan, colSpan } = masterMap[mid]
      const mr1 = mr + rowSpan - 1, mc1 = mc + colSpan - 1
      if (mr1 < r0 || mr > r1 || mc1 < c0 || mc > c1) continue
      for (let r = mr; r <= mr1; r++)
        for (let c = mc; c <= mc1; c++)
          if (!(r === mr && c === mc)) delete slaveMap[cellId(r, c)]
      delete masterMap[mid]
    }
  }

  function isMaster(id)      { return !!masterMap[id] }
  function isSlave(id)       { return !!slaveMap[id] }
  function getMasterInfo(id) { return masterMap[id] || null }
  function getMasterId(id)   { return slaveMap[id] || null }
  function resolveId(id)     { return slaveMap[id] || id }

  function snapshot() {
    return {
      masterMap: JSON.parse(JSON.stringify(masterMap)),
      slaveMap:  JSON.parse(JSON.stringify(slaveMap)),
    }
  }

  function restore(snap) {
    for (const k of Object.keys(masterMap)) delete masterMap[k]
    for (const k of Object.keys(slaveMap))  delete slaveMap[k]
    Object.assign(masterMap, snap.masterMap)
    Object.assign(slaveMap,  snap.slaveMap)
  }

  return { merge, unmerge, isMaster, isSlave, getMasterInfo, getMasterId, resolveId, snapshot, restore }
}
