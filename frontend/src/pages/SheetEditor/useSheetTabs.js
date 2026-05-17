import { ref } from 'vue'

// getGrid is a getter fn () => grid. onSwitch is called after every sheet switch
// so the caller can repopulate canvas data for the new sheet.
export function useSheetTabs({ sheet, formats, getGrid, activeCell, formulaValue, refreshActiveFormat, onSwitch }) {
  const sheetNames   = ref(sheet.getSheetNames())
  const currentSheet = ref(sheet.getCurrentSheet())

  function switchSheet(name) {
    getGrid()?.clearAll()
    sheet.switchSheet(name)
    currentSheet.value = sheet.getCurrentSheet()
    activeCell.value   = 'A1'
    formulaValue.value = sheet.getCell('A1')
    refreshActiveFormat()
    onSwitch?.()
  }

  function addSheet() {
    const name = 'Sheet' + (sheet.getSheetNames().length + 1)
    sheet.addSheet(name)
    sheetNames.value = sheet.getSheetNames()
    switchSheet(name)
  }

  // Returns true on success, false on collision / invalid name.
  function renameSheet(oldName, newName) {
    newName = (newName || '').trim()
    if (!newName) return false
    if (sheet.getSheetNames().includes(newName) && newName !== oldName) return false
    const ok = sheet.renameSheet(oldName, newName)
    if (!ok) return false
    formats?.renameSheet(oldName, newName)
    sheetNames.value   = sheet.getSheetNames()
    currentSheet.value = sheet.getCurrentSheet()
    return true
  }

  function duplicateSheet(srcName) {
    const existing = sheet.getSheetNames()
    let copy = `${srcName} copy`
    let n = 1
    while (existing.includes(copy)) { n++; copy = `${srcName} copy ${n}` }
    sheet.duplicateSheet(srcName, copy)
    formats?.duplicateSheet(srcName, copy)
    sheetNames.value = sheet.getSheetNames()
    switchSheet(copy)
    return copy
  }

  function deleteSheet(name) {
    if (sheet.getSheetNames().length <= 1) return false
    const wasCurrent = sheet.getCurrentSheet() === name
    const ok = sheet.deleteSheet(name)
    if (!ok) return false
    formats?.deleteSheet(name)
    sheetNames.value = sheet.getSheetNames()
    if (wasCurrent) switchSheet(sheet.getCurrentSheet())
    else            currentSheet.value = sheet.getCurrentSheet()
    return true
  }

  function reorderSheets(orderedNames) {
    sheet.reorderSheets(orderedNames)
    formats?.reorderSheets(orderedNames)
    sheetNames.value = sheet.getSheetNames()
  }

  function syncNames() {
    sheetNames.value   = sheet.getSheetNames()
    currentSheet.value = sheet.getCurrentSheet()
  }

  return {
    sheetNames, currentSheet,
    switchSheet, addSheet, renameSheet, duplicateSheet, deleteSheet, reorderSheets,
    syncNames,
  }
}
