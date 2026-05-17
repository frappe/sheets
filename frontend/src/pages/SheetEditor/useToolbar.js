import { ref } from 'vue'

// getGrid is a getter fn () => grid so the toolbar always has the live reference.
// markDirty (optional) is called after every mutation so the SheetEditor can
// trigger autosave — without it, format changes never persist.
export function useToolbar({ sheet, formats, getGrid, history, selectionIds, syncFlags, markDirty }) {
  const activeFormat = ref({})

  // Last-action ledger — what F4 replays. Captured by every toolbar mutator
  // *after* it runs so the record always reflects what was actually applied.
  let lastAction = null

  function refreshActiveFormat() {
    activeFormat.value = formats.get(
      getGrid()?.getActiveCell() ?? 'A1',
      sheet.getCurrentSheet(),
    )
  }

  // History uses post-mutate semantics: snapshot AFTER each mutation so that
  // stack[index] always equals the current live state. Undo decrements + reads
  // stack[index]; redo increments + reads. Reversing the order (push before
  // mutate) makes a single undo revert TWO actions at once — the visible bug
  // where formatting one cell + typing into another cell would undo both.
  function _afterMutation(kind, args) {
    history.push()
    getGrid()?.render()
    refreshActiveFormat()
    syncFlags()
    markDirty?.()
    lastAction = { kind, args }
  }

  function toggleFmt(key) {
    formats.toggleRange(selectionIds(), key, sheet.getCurrentSheet())
    _afterMutation('toggleFmt', [key])
  }

  function setAlign(align) {
    formats.applyToRange(selectionIds(), { align }, sheet.getCurrentSheet())
    _afterMutation('setAlign', [align])
  }

  function setValign(valign) {
    formats.applyToRange(selectionIds(), { valign }, sheet.getCurrentSheet())
    _afterMutation('setValign', [valign])
  }

  function setColor(key, value) {
    formats.applyToRange(selectionIds(), { [key]: value }, sheet.getCurrentSheet())
    _afterMutation('setColor', [key, value])
  }

  function clearFormatting() {
    const ids = selectionIds()
    const sh  = sheet.getCurrentSheet()
    for (const id of ids) formats.clear(id, sh)
    _afterMutation('clearFormatting', [])
  }

  function getLastAction() { return lastAction }
  function recordAction(kind, args) { lastAction = { kind, args } }

  return {
    activeFormat, refreshActiveFormat,
    toggleFmt, setAlign, setValign, setColor, clearFormatting,
    getLastAction, recordAction,
  }
}
