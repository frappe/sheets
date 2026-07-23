import { useShortcut } from 'frappe-ui'

/**
 * Keyboard shortcut dispatch for SheetEditor.
 *
 * App-level shortcuts are registered through frappe-ui's `useShortcut` registry
 * so they are the single source of truth for the `<KeyboardShortcutsModal>` — the
 * shortcut description lives next to its handler, so the help dialog can never
 * drift. Grid navigation/edit shortcuts stay in the canvas (they need the canvas
 * element + edit-mode state); they're registered here as *display-only* entries
 * (no handler, `preventDefault: false`) purely so the modal lists them too.
 *
 * A small residual `onGlobalKey` handles the shortcuts frappe-ui's `e.key`
 * matcher cannot: the context-sensitive Escape cascade, and the `e.code`-based
 * combos (macOS rewrites Alt+= → ≠ and Shift+<digit> → a symbol).
 *
 * @param {{
 *   formulaInputEl: () => HTMLElement | null,
 *   undo: () => void, redo: () => void, onSave: () => void,
 *   toggleFmt: (fmt: string) => void, repeatLast: () => void,
 *   toggleShowFormulas: () => void,
 *   showFindReplace: import('vue').Ref<boolean>,
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
    toggleShowFormulas, showFindReplace,
    openVersionHistory, openHyperlinkDialog, openCommentPanel, openQuickFilterForActive,
    zoomBy, resetZoom,
    commentPanel, dropdownPanel, splitText, revertSplitPreview, closeSplit,
    clipboard, clipboardHas, setMarchingAnts,
    fillDown, fillRight,
    runSmartFill,
    insertRowsCols, deleteRowsCols, applyNumberFormat, pasteValues,
    // Optional getter — true for a view-only viewer (guest / read-only share).
    // Mutating shortcuts carry `condition: notReadOnly` so they're both inert
    // AND hidden from the modal while read-only; pure view shortcuts stay live.
    readOnly = () => false,
  } = actions

  const notReadOnly = () => !readOnly()

  function _isInInput() {
    const ae = document.activeElement
    return ae?.tagName === 'INPUT' && ae !== formulaInputEl?.()
  }

  // ── Registry (source of truth for the modal) ─────────────────────────────────
  // Shortcuts frappe-ui can match on `e.key`, registered with handler + label.
  useShortcut([
    // View / tools — available even in read-only.
    { key: 's',  ctrl: true, description: 'Save',            group: 'View', handler: onSave },
    { key: 'f',  ctrl: true, description: 'Find & replace',  group: 'View', handler: () => { showFindReplace.value = true } },
    { key: '`',  ctrl: true, description: 'Show formulas',   group: 'View', handler: toggleShowFormulas },
    { key: '=',  ctrl: true, description: 'Zoom in',         group: 'View', handler: () => zoomBy(+0.1) },
    { key: '+',  ctrl: true, description: 'Zoom in',         group: 'View', handler: () => zoomBy(+0.1) },
    { key: '-',  ctrl: true, description: 'Zoom out',        group: 'View', handler: () => zoomBy(-0.1) },
    { key: '0',  ctrl: true, description: 'Reset zoom',      group: 'View', handler: resetZoom },

    // Editing — mutating, so hidden + inert while read-only.
    { key: 'z', ctrl: true,              description: 'Undo',                    group: 'Editing', condition: notReadOnly, handler: undo },
    { key: 'z', ctrl: true, shift: true, description: 'Redo',                    group: 'Editing', condition: notReadOnly, handler: redo },
    { key: 'y', ctrl: true,              description: 'Redo',                    group: 'Editing', condition: notReadOnly, handler: redo },
    { key: 'F4',                         description: 'Repeat last action',      group: 'Editing', condition: notReadOnly, handler: repeatLast },
    { key: 'd', ctrl: true,              description: 'Fill down',               group: 'Editing', condition: notReadOnly, handler: fillDown },
    { key: 'r', ctrl: true,              description: 'Fill right',              group: 'Editing', condition: notReadOnly, handler: fillRight },
    { key: 'e', ctrl: true,              description: 'Smart Fill from examples', group: 'Editing', condition: notReadOnly, handler: () => runSmartFill?.() },
    { key: 'v', ctrl: true, shift: true, description: 'Paste values only',       group: 'Editing', condition: notReadOnly, handler: () => pasteValues?.() },
    { key: 'l', ctrl: true,              description: 'Insert hyperlink',        group: 'Editing', condition: notReadOnly, handler: openHyperlinkDialog },
    { key: 'F2', shift: true,            description: 'Add / edit comment',      group: 'Editing', condition: notReadOnly, handler: openCommentPanel },
    { key: 'ArrowDown', alt: true,       description: 'Quick filter on column',  group: 'Editing', condition: notReadOnly, handler: openQuickFilterForActive },
    { key: 'h', ctrl: true, alt: true, shift: true, description: 'Version history', group: 'Editing', condition: notReadOnly, handler: openVersionHistory },

    // Formatting — mutating.
    { key: 'b', ctrl: true,              description: 'Bold',          group: 'Formatting', condition: notReadOnly, handler: () => toggleFmt('bold') },
    { key: 'i', ctrl: true,              description: 'Italic',        group: 'Formatting', condition: notReadOnly, handler: () => toggleFmt('italic') },
    { key: 'u', ctrl: true,              description: 'Underline',     group: 'Formatting', condition: notReadOnly, handler: () => toggleFmt('underline') },
    { key: 'x', ctrl: true, shift: true, description: 'Strikethrough', group: 'Formatting', condition: notReadOnly, handler: () => toggleFmt('strikethrough') },
  ])

  // ── Display-only entries ─────────────────────────────────────────────────────
  // Real handlers live in the grid canvas, the native clipboard events, or the
  // residual onGlobalKey below. `preventDefault: false` + no handler keeps them
  // passive — they never intercept a keystroke, they just populate the modal.
  useShortcut([
    // Navigation (grid canvas)
    { key: 'ArrowUp',    description: 'Move selection', group: 'Navigation', preventDefault: false },
    { key: 'ArrowDown',  description: 'Move selection', group: 'Navigation', preventDefault: false },
    { key: 'ArrowLeft',  description: 'Move selection', group: 'Navigation', preventDefault: false },
    { key: 'ArrowRight', description: 'Move selection', group: 'Navigation', preventDefault: false },
    { key: 'ArrowRight', shift: true, description: 'Extend selection',       group: 'Navigation', preventDefault: false },
    { key: 'ArrowLeft',  ctrl: true,  description: 'Jump to data-region edge', group: 'Navigation', preventDefault: false },
    { key: 'Home',       ctrl: true,  description: 'Jump to start / end',    group: 'Navigation', preventDefault: false },
    { key: 'End',        ctrl: true,  description: 'Jump to start / end',    group: 'Navigation', preventDefault: false },
    { key: 'PageDown',   description: 'Scroll one screen', group: 'Navigation', preventDefault: false },
    { key: 'PageUp',     description: 'Scroll one screen', group: 'Navigation', preventDefault: false },

    // Selection (grid canvas)
    { key: ' ', shift: true,             description: 'Select row',          group: 'Selection', preventDefault: false },
    { key: ' ', ctrl: true,              description: 'Select column',       group: 'Selection', preventDefault: false },
    { key: 'a', ctrl: true,              description: 'Select data / all',   group: 'Selection', preventDefault: false },
    { key: ' ', ctrl: true, shift: true, description: 'Select entire sheet', group: 'Selection', preventDefault: false },

    // Editing (grid canvas / native clipboard / residual handler)
    { key: 'F2',                         description: 'Edit cell',            group: 'Editing', preventDefault: false },
    { key: 'Delete',                     description: 'Clear cell',           group: 'Editing', preventDefault: false },
    { key: 'Backspace',                  description: 'Clear cell',           group: 'Editing', preventDefault: false },
    { key: 'Enter',                      description: 'Commit + move down',   group: 'Editing', preventDefault: false },
    { key: 'Tab',                        description: 'Commit + move right',  group: 'Editing', preventDefault: false },
    { key: 'Enter', alt: true,           description: 'New line in cell',     group: 'Editing', condition: notReadOnly, preventDefault: false },
    { key: 'c', ctrl: true,              description: 'Copy',                 group: 'Editing', preventDefault: false },
    { key: 'x', ctrl: true,              description: 'Cut',                  group: 'Editing', condition: notReadOnly, preventDefault: false },
    { key: 'v', ctrl: true,              description: 'Paste',                group: 'Editing', condition: notReadOnly, preventDefault: false },
    { key: '=', ctrl: true, alt: true,   description: 'Insert rows / columns', group: 'Editing', condition: notReadOnly, preventDefault: false },
    { key: '-', ctrl: true, alt: true,   description: 'Delete rows / columns', group: 'Editing', condition: notReadOnly, preventDefault: false },

    // Number formats (Ctrl+Shift+1..5) — handled via e.code below; here for display.
    { key: '1', ctrl: true, shift: true, description: 'Format as number',   group: 'Formatting', condition: notReadOnly, preventDefault: false },
    { key: '2', ctrl: true, shift: true, description: 'Format as time',     group: 'Formatting', condition: notReadOnly, preventDefault: false },
    { key: '3', ctrl: true, shift: true, description: 'Format as date',     group: 'Formatting', condition: notReadOnly, preventDefault: false },
    { key: '4', ctrl: true, shift: true, description: 'Format as currency', group: 'Formatting', condition: notReadOnly, preventDefault: false },
    { key: '5', ctrl: true, shift: true, description: 'Format as percent',  group: 'Formatting', condition: notReadOnly, preventDefault: false },
  ])

  // ── Residual handler (window keydown) ────────────────────────────────────────
  // Everything frappe-ui's e.key matcher can't do: the Escape cascade and the
  // e.code-based combos.
  function onGlobalKey(e) {
    const inInput = _isInInput()

    // Escape — context-sensitive close (first match wins). Kept custom because
    // it's a cascade, not a single action; while editing a cell the canvas owns
    // Escape (cancel edit) and focus is in the editor, so inInput short-circuits.
    if (e.key === 'Escape' && !inInput) {
      if (commentPanel.open)   { commentPanel.open  = false; return }
      if (dropdownPanel.open)  { dropdownPanel.open = false; return }
      if (splitText.open)      { revertSplitPreview(); closeSplit(); return }
      if (clipboard.hasData()) { clipboard.clear(); clipboardHas.value = false; setMarchingAnts(null); return }
      return
    }

    if (readOnly() || inInput) return
    const mod = e.metaKey || e.ctrlKey

    // Mod+Alt+= / Mod+Alt+-  — insert / delete rows or columns. Match on e.code:
    // with Alt held, macOS rewrites e.key ('=' → '≠', '-' → '–').
    if (mod && e.altKey && e.code === 'Equal') { e.preventDefault(); insertRowsCols?.(); return }
    if (mod && e.altKey && e.code === 'Minus') { e.preventDefault(); deleteRowsCols?.(); return }
    // Mod+Shift+1..5 — number formats. Match on e.code so shifted digits resolve.
    if (mod && e.shiftKey && NUMBER_FORMAT_KEYS[e.code]) {
      e.preventDefault(); applyNumberFormat?.(NUMBER_FORMAT_KEYS[e.code]); return
    }
  }

  return { onGlobalKey }
}
