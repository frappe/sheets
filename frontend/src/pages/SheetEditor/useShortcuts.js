/**
 * Keyboard shortcut dispatch for SheetEditor.
 *
 * @param {{
 *   formulaInputEl: () => HTMLElement | null,
 *   undo: () => void, redo: () => void, onSave: () => void,
 *   toggleFmt: (fmt: string) => void, repeatLast: () => void,
 *   toggleShowFormulas: () => void,
 *   showFindReplace: import('vue').Ref<boolean>,
 *   showShortcutsHelp: import('vue').Ref<boolean>,
 *   openVersionHistory: () => void, openHyperlinkDialog: () => void,
 *   openCommentPanel: () => void, openQuickFilterForActive: () => void,
 *   zoomBy: (d: number) => void, resetZoom: () => void,
 *   commentPanel: { open: boolean },
 *   dropdownPanel: { open: boolean },
 *   splitText: { open: boolean },
 *   revertSplitPreview: () => void, closeSplit: () => void,
 *   clipboard: { hasData: () => boolean, clear: () => void },
 *   clipboardHas: import('vue').Ref<boolean>,
 *   setMarchingAnts: (v: null) => void,
 *   fillDown: () => void, fillRight: () => void,
 *   runSmartFill: () => void,
 *   insertRowsCols: () => void, deleteRowsCols: () => void,
 *   applyNumberFormat: (fmt: string) => void, pasteValues: () => void,
 *   readOnly?: () => boolean,
 * }} actions
 */

// Ctrl/Cmd+Shift+<digit> → number-format key, matching Google Sheets' 1-6 row.
// Keyed by KeyboardEvent.code so shifted digits ('!', '@', …) still resolve.
// Exponent/scientific (GS's Ctrl+Shift+6) is intentionally absent — the format
// engine has no scientific renderer yet, so there's nothing correct to apply.
const NUMBER_FORMAT_KEYS = {
  Digit1: 'number',
  Digit2: 'time',
  Digit3: 'date',
  Digit4: 'currency:USD:2',
  Digit5: 'percentage',
}

export function useShortcuts(actions) {
  const {
    formulaInputEl, undo, redo, onSave, toggleFmt, repeatLast,
    toggleShowFormulas, showFindReplace, showShortcutsHelp,
    openVersionHistory, openHyperlinkDialog, openCommentPanel, openQuickFilterForActive,
    zoomBy, resetZoom,
    commentPanel, dropdownPanel, splitText, revertSplitPreview, closeSplit,
    clipboard, clipboardHas, setMarchingAnts,
    fillDown, fillRight,
    runSmartFill,
    insertRowsCols, deleteRowsCols, applyNumberFormat, pasteValues,
    // Optional getter — true for a view-only viewer (guest / read-only share).
    // When set, shortcuts that would mutate the sheet are swallowed; pure
    // navigation / view shortcuts (find, zoom, formula-peek, escape) stay live.
    readOnly = () => false,
  } = actions

  function _isInInput() {
    const ae = document.activeElement
    return ae?.tagName === 'INPUT' && ae !== formulaInputEl?.()
  }

  function _handleFormatKeys(e, mod, inInput) {
    // Viewer: undo/redo/format/repeat all mutate — swallow them so a stray
    // Cmd+B doesn't paint local-only changes the viewer can never save.
    if (readOnly()) return false
    if (mod && e.key === 'z' && !e.shiftKey)                              { e.preventDefault(); undo();                         return true }
    if (mod && (e.key === 'y' || (e.shiftKey && e.key === 'z')))          { e.preventDefault(); redo();                         return true }
    if (mod && e.key === 'b' && !inInput)                                  { e.preventDefault(); toggleFmt('bold');              return true }
    if (mod && e.key === 'i' && !inInput)                                  { e.preventDefault(); toggleFmt('italic');            return true }
    if (mod && e.key === 'u' && !inInput)                                  { e.preventDefault(); toggleFmt('underline');         return true }
    if (mod && e.shiftKey && (e.key === 'x' || e.key === 'X') && !inInput) {
      e.preventDefault(); toggleFmt('strikethrough'); return true
    }
    if (e.key === 'F4' && !inInput)                                        { e.preventDefault(); repeatLast();                   return true }
    return false
  }

  function _handleViewKeys(e, mod, inInput) {
    if (mod && (e.key === '`' || e.code === 'Backquote') && !inInput) {
      e.preventDefault(); toggleShowFormulas(); return true
    }
    if (mod && e.key === 's')                                              { e.preventDefault(); onSave();                       return true }
    if (mod && e.key === 'f')                                              { e.preventDefault(); showFindReplace.value = true;   return true }
    // Alt is excluded so Mod+Alt+= / Mod+Alt+- fall through to insert/delete
    // rows below rather than being swallowed as zoom.
    if (mod && !e.altKey && (e.key === '=' || e.key === '+'))              { e.preventDefault(); zoomBy(+0.1);                   return true }
    if (mod && !e.altKey && e.key === '-')                                 { e.preventDefault(); zoomBy(-0.1);                   return true }
    if (mod && e.key === '0')                                              { e.preventDefault(); resetZoom();                    return true }
    if (!mod && !inInput && e.key === '?')                                 { e.preventDefault(); showShortcutsHelp.value = true; return true }
    return false
  }

  function _handleNavKeys(e, mod, inInput) {
    if (mod && e.altKey && e.shiftKey && (e.key === 'h' || e.key === 'H')) {
      e.preventDefault(); openVersionHistory(); return true
    }
    if (mod && e.key === 'l' && !inInput)                                  { e.preventDefault(); openHyperlinkDialog();          return true }
    if (e.shiftKey && e.key === 'F2' && !inInput)                          { e.preventDefault(); openCommentPanel();             return true }
    if (e.altKey && e.key === 'ArrowDown' && !inInput)                     { e.preventDefault(); openQuickFilterForActive();     return true }
    return false
  }

  function _handleEscape(e, inInput) {
    if (e.key !== 'Escape' || inInput) return false
    if (commentPanel.open)   { commentPanel.open  = false; return true }
    if (dropdownPanel.open)  { dropdownPanel.open = false; return true }
    if (splitText.open)      { revertSplitPreview(); closeSplit(); return true }
    if (clipboard.hasData()) { clipboard.clear(); clipboardHas.value = false; setMarchingAnts(null); return true }
    return false
  }

  function onGlobalKey(e) {
    const mod     = e.metaKey || e.ctrlKey
    const inInput = _isInInput()
    // Read-only viewers: only the non-mutating shortcuts stay live (find,
    // formulas toggle, zoom, help, Escape). Format/undo/redo, nav-edits
    // (hyperlink, comment, quick-filter), and fill/smart-fill all mutate the
    // doc, so skip them — they'd set isDirty for a save that can never land.
    const ro = readOnly()
    if (!ro && _handleFormatKeys(e, mod, inInput)) return
    if (_handleViewKeys(e, mod, inInput))          return
    if (!ro && _handleNavKeys(e, mod, inInput))    return
    if (_handleEscape(e, inInput))                 return
    if (ro) return
    if (mod && e.key === 'd' && !inInput) { e.preventDefault(); fillDown();  return }
    if (mod && e.key === 'r' && !inInput) { e.preventDefault(); fillRight(); return }
    // Cmd/Ctrl+E — Smart Fill. Matches Excel's Flash Fill shortcut. Detects
    // a pattern from the user's example values in the selected column and
    // fills the remaining empty cells in the selection.
    if (mod && (e.key === 'e' || e.key === 'E') && !inInput) {
      e.preventDefault(); runSmartFill?.(); return
    }
    // Mod+Alt+= / Mod+Alt+-  — insert / delete rows or columns. Match on
    // e.code: with Alt held, macOS rewrites e.key ('=' → '≠', '-' → '–'), so
    // the physical key is the only reliable signal here.
    if (mod && e.altKey && e.code === 'Equal' && !inInput) {
      e.preventDefault(); insertRowsCols?.(); return
    }
    if (mod && e.altKey && e.code === 'Minus' && !inInput) {
      e.preventDefault(); deleteRowsCols?.(); return
    }
    // Mod+Shift+1..5 — apply a number format to the selection (GS parity).
    if (mod && e.shiftKey && !inInput && NUMBER_FORMAT_KEYS[e.code]) {
      e.preventDefault(); applyNumberFormat?.(NUMBER_FORMAT_KEYS[e.code]); return
    }
    // Mod+Shift+V — paste values only (drops formatting / formulas).
    if (mod && e.shiftKey && (e.key === 'v' || e.key === 'V') && !inInput) {
      e.preventDefault(); pasteValues?.(); return
    }
  }

  return { onGlobalKey }
}
