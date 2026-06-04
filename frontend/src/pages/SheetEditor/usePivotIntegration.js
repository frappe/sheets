import { ref, computed, watch } from 'vue'
import { computePivot, writePivotToSheet } from '../../engine/pivot.js'
import { colLabel, cellId } from '../../utils/cells.js'
import { COL_HEADER_H, ROW_HEADER_W } from '../../canvas/constants.js'

// Styling applied to the pivot's column header row (row 0) and Grand Total
// row (last row). Matches the Google Sheets look the user asked for.
const PIVOT_HEADER_FORMAT = { bold: true, backgroundColor: '#d9e0e8' }

/**
 * @param {{
 *   pivot: object,
 *   sheet: object,
 *   currentSheet: import('vue').Ref<string>,
 *   renderVersion: import('vue').Ref<number>,
 *   getGrid: () => object,
 *   contextMenu: { open: boolean },
 *   switchSheet: (name: string) => void,
 *   syncNames: () => void,
 *   history: { push: () => void },
 *   isDirty: import('vue').Ref<boolean>,
 *   repopulateGrid: () => void,
 * }} opts
 */
export function usePivotIntegration({
  pivot, sheet, formats, currentSheet, renderVersion, getGrid,
  contextMenu, switchSheet, syncNames,
  history, isDirty, repopulateGrid,
}) {
  const pivotDialogOpen   = ref(false)
  const pivotInitialRange = ref('')
  const pivotEditId       = ref('')
  const pivotEditConfig   = ref(null)
  const pivotVersion      = ref(0)
  // Row/column count of the last-rendered pivot output; used to position the
  // edit FAB and the highlight overlay without re-running the full
  // computePivot() on every canvas render frame.
  const _pivotRowCount    = ref(0)
  const _pivotColCount    = ref(0)

  // Every engine mutation (including restore on page reload) bumps the version,
  // so reactive computeds like `activePivotConfig` re-evaluate. Without this,
  // the edit FAB stays hidden after a reload because `pivot.restore()` runs
  // silently and the cached computed never sees the new pivot list.
  pivot.setOnChange?.(() => { pivotVersion.value++ })

  // Reading pivotVersion forces Vue to re-evaluate on every add/update/delete.
  const activePivotConfig = computed(() => {
    void pivotVersion.value
    return pivot.list().find(p => p.outputSheet === currentSheet.value) ?? null
  })

  // Set of sheet names that are pivot outputs — computed so templates reactively
  // update tab styles when pivots are added or deleted.
  const pivotSheetNames = computed(() => {
    void pivotVersion.value
    return new Set(pivot.list().map(p => p.outputSheet))
  })

  function isPivotSheet(name) { return pivotSheetNames.value.has(name) }

  // After a page reload, pivot.restore() puts the config back but never calls
  // _applyPivotOutput, so the in-memory _pivotRowCount stays at 0 — and both
  // the edit FAB and the highlight overlay (which gate on rows > 0) silently
  // hide. Watch the active config: when it becomes non-null, do a READ-ONLY
  // computePivot() to derive dimensions. We don't go through _applyPivotOutput
  // because its setCell writes would bump renderVersion and could mark the
  // sheet dirty even though the cells already match the saved snapshot.
  //
  // Also (re-)apply the header/total banding so older pivots created before
  // this styling existed pick it up the first time they're opened. formats.set
  // is idempotent and doesn't mark isDirty by itself, so this is safe to run
  // on every activation.
  watch(activePivotConfig, (cfg) => {
    if (!cfg) {
      _pivotRowCount.value = 0
      _pivotColCount.value = 0
      return
    }
    const table = computePivot(cfg, (s, e, sh) => sheet.getRangeValues(s, e, sh))
    _pivotRowCount.value = table.length
    _pivotColCount.value = table[0]?.length || 0
    _styleHeaderAndTotal(table, cfg.outputSheet)
  }, { immediate: true })

  // Positions the edit FAB below the Grand Total row without re-running
  // computePivot() — _pivotRowCount is updated whenever pivot output is written.
  // getCellRect returns coordinates even when the cell has scrolled above the
  // visible cell area, so the FAB would otherwise overlap the column/row
  // headers when the user scrolls past the pivot. Gate on the headers.
  const pivotFabStyle = computed(() => {
    void pivotVersion.value
    renderVersion.value
    const cfg  = activePivotConfig.value
    const grid = getGrid()
    const rows = _pivotRowCount.value
    if (!grid || !cfg || !rows) return null
    const rect = grid.getCellRect?.(rows - 1, 0)
    if (!rect) return null
    const zoom = grid.getZoom?.() ?? 1
    const top  = rect.y + rect.height + 6
    if (top < COL_HEADER_H * zoom || rect.x + rect.width < ROW_HEADER_W * zoom) {
      return null
    }
    return { top: top + 'px', left: rect.x + 'px' }
  })

  // Highlight overlay — a thin coloured border drawn over the pivot output
  // range so users can see it's a generated table (Google Sheets does the
  // same). Anchored on getCellRect of the top-left and bottom-right output
  // cells; tracks scroll/zoom via the renderVersion read.
  //
  // Clip the overlay to the visible cell area so it never bleeds into the
  // column/row headers when scrolled. Hide entirely when the pivot has
  // scrolled completely above/left of the visible area.
  const pivotHighlightStyle = computed(() => {
    void pivotVersion.value
    renderVersion.value
    const cfg  = activePivotConfig.value
    const grid = getGrid()
    const rows = _pivotRowCount.value
    const cols = _pivotColCount.value
    if (!grid || !cfg || !rows || !cols) return null
    const tl = grid.getCellRect?.(0, 0)
    const br = grid.getCellRect?.(rows - 1, cols - 1)
    if (!tl || !br) return null
    const zoom    = grid.getZoom?.() ?? 1
    const headerY = COL_HEADER_H * zoom
    const headerX = ROW_HEADER_W * zoom
    const right   = br.x + br.width
    const bottom  = br.y + br.height
    if (bottom <= headerY || right <= headerX) return null
    const top  = Math.max(tl.y, headerY)
    const left = Math.max(tl.x, headerX)
    return {
      top:    top  + 'px',
      left:   left + 'px',
      width:  (right  - left) + 'px',
      height: (bottom - top)  + 'px',
    }
  })

  const pivotBannerMenuOptions = [
    { label: 'Edit pivot',   icon: 'edit-2',                    onClick: onPivotEdit   },
    { label: 'Delete pivot', icon: 'trash-2', theme: 'red',     onClick: onPivotDelete },
  ]

  function openPivotDialog() {
    contextMenu.open = false
    const grid = getGrid()
    const sel  = grid?.getSelection()
    pivotInitialRange.value = sel
      ? `${colLabel(sel.c0)}${sel.r0 + 1}:${colLabel(sel.c1)}${sel.r1 + 1}`
      : ''
    pivotEditId.value     = ''
    pivotEditConfig.value = null
    pivotDialogOpen.value = true
  }

  function onPivotEdit() {
    const cfg = activePivotConfig.value
    if (!cfg) return
    pivotEditId.value       = cfg.id
    pivotEditConfig.value   = { ...cfg }
    pivotInitialRange.value = cfg.sourceRange || ''
    pivotDialogOpen.value   = true
  }

  function onPivotRefresh() {
    const cfg = activePivotConfig.value
    if (!cfg) return
    _applyPivotOutput(cfg)
    repopulateGrid()
  }

  function onPivotDelete() {
    const cfg = activePivotConfig.value
    if (!cfg) return
    pivot.remove(cfg.id)
  }

  function _clearPivotOutputSheet(sheetName) {
    const data = sheet.getRawData(sheetName)
    for (const id of Object.keys(data)) {
      sheet.setCell(id, '', sheetName)
      // Clear the format too — otherwise the previous header/total band
      // lingers on rows the new (shorter) pivot no longer occupies.
      formats?.clear?.(id, sheetName)
    }
  }

  function _applyPivotOutput(config) {
    const table = computePivot(config, (s, e, sh) => sheet.getRangeValues(s, e, sh))
    _pivotRowCount.value = table.length
    _pivotColCount.value = table[0]?.length || 0
    writePivotToSheet(
      table, config.outputSheet,
      (id, val, sh) => sheet.setCell(id, val, sh),
      shName => _clearPivotOutputSheet(shName),
    )
    _styleHeaderAndTotal(table, config.outputSheet)
  }

  // Apply the bold + #d9e0e8 banding to row 0 (column headers) and the last
  // row (Grand Total). Walks every column in the pivot width so the band is
  // continuous even for cells the engine left empty (which writePivotToSheet
  // skipped). Re-applied on every recompute since _clearPivotOutputSheet wipes
  // formats first.
  function _styleHeaderAndTotal(table, outputSheet) {
    if (!formats?.set || !table.length) return
    const cols = table[0]?.length || 0
    const lastRow = table.length - 1
    for (let c = 0; c < cols; c++) {
      formats.set(cellId(0, c), PIVOT_HEADER_FORMAT, outputSheet)
      if (lastRow > 0) {
        formats.set(cellId(lastRow, c), PIVOT_HEADER_FORMAT, outputSheet)
      }
    }
  }

  function recomputePivotsForSheet(srcSheet) {
    if (!pivot.affectsPivot(srcSheet)) return
    for (const cfg of pivot.list()) {
      if (cfg.sourceSheet === srcSheet) _applyPivotOutput(cfg)
    }
    repopulateGrid()
  }

  function onPivotConfirm(config) {
    const existing = sheet.getSheetNames()
    if (config.id) {
      const old = pivot.get(config.id)
      const outputSheet = old?.outputSheet || `Pivot – ${config.rows.join(', ')}`
      pivot.update(config.id, { ...config, outputSheet })
      _applyPivotOutput({ ...config, outputSheet })
      switchSheet(outputSheet)
    } else {
      const baseName = `Pivot – ${config.rows.join(', ')}`
      let outputSheet = baseName; let n = 2
      while (existing.includes(outputSheet)) outputSheet = `${baseName} ${n++}`
      sheet.addSheet(outputSheet)
      syncNames()
      config.outputSheet = outputSheet
      pivot.add(config)
      _applyPivotOutput({ ...config, outputSheet })
      switchSheet(outputSheet)
    }
    repopulateGrid()
    history.push(); isDirty.value = true
  }

  return {
    pivotDialogOpen, pivotInitialRange, pivotEditId, pivotEditConfig, pivotVersion,
    activePivotConfig, pivotFabStyle, pivotHighlightStyle, pivotBannerMenuOptions,
    isPivotSheet, openPivotDialog, onPivotEdit, onPivotRefresh, onPivotDelete, onPivotConfirm,
    recomputePivotsForSheet,
  }
}
