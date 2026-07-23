import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

// frappe-ui's barrel drags in resources that don't resolve under vitest, and we
// only care that the right shortcut *configs* get registered — so mock
// `useShortcut` to capture every config it's handed.
const { registered } = vi.hoisted(() => ({ registered: [] }))
vi.mock('frappe-ui', () => ({
  useShortcut: (configs) => registered.push(...(Array.isArray(configs) ? configs : [configs])),
}))

import { useShortcuts } from './useShortcuts.js'

// In node env there is no `document`, so stub activeElement per test.
function stubActiveElement(tagName = 'DIV') {
  Object.defineProperty(global, 'document', {
    value: { activeElement: { tagName, value: '' } },
    writable: true, configurable: true,
  })
}

function makeActions(overrides = {}) {
  return {
    formulaInputEl:         () => null,
    undo:                   vi.fn(),
    redo:                   vi.fn(),
    onSave:                 vi.fn(),
    toggleFmt:              vi.fn(),
    repeatLast:             vi.fn(),
    toggleShowFormulas:     vi.fn(),
    showFindReplace:        ref(false),
    openVersionHistory:     vi.fn(),
    openHyperlinkDialog:    vi.fn(),
    openCommentPanel:       vi.fn(),
    openQuickFilterForActive: vi.fn(),
    zoomBy:                 vi.fn(),
    resetZoom:              vi.fn(),
    commentPanel:           { open: false },
    dropdownPanel:          { open: false },
    splitText:              { open: false },
    revertSplitPreview:     vi.fn(),
    closeSplit:             vi.fn(),
    clipboard:              { hasData: vi.fn(() => false), clear: vi.fn() },
    clipboardHas:           ref(false),
    setMarchingAnts:        vi.fn(),
    fillDown:               vi.fn(),
    fillRight:              vi.fn(),
    runSmartFill:           vi.fn(),
    insertRowsCols:         vi.fn(),
    deleteRowsCols:         vi.fn(),
    applyNumberFormat:      vi.fn(),
    pasteValues:            vi.fn(),
    readOnly:               () => false,
    ...overrides,
  }
}

function key(opts = {}) {
  return {
    key: '', code: '', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
    preventDefault: vi.fn(),
    ...opts,
  }
}

// Find a registered shortcut with a real handler by combo, then fire it.
function find(combo) {
  return registered.find(c =>
    c.key === combo.key &&
    !!c.ctrl === !!combo.ctrl && !!c.shift === !!combo.shift && !!c.alt === !!combo.alt &&
    typeof c.handler === 'function')
}
function fire(combo) { find(combo)?.handler?.() }

beforeEach(() => {
  registered.length = 0
  stubActiveElement('DIV')
})

// ── Registered shortcuts (frappe-ui useShortcut) ─────────────────────────────

describe('registered shortcuts', () => {
  it('Mod+Z registers undo', () => {
    const a = makeActions(); useShortcuts(a)
    fire({ key: 'z', ctrl: true }); expect(a.undo).toHaveBeenCalled()
  })
  it('Mod+Y and Mod+Shift+Z register redo', () => {
    const a = makeActions(); useShortcuts(a)
    fire({ key: 'y', ctrl: true }); fire({ key: 'z', ctrl: true, shift: true })
    expect(a.redo).toHaveBeenCalledTimes(2)
  })
  it('Mod+B registers bold', () => {
    const a = makeActions(); useShortcuts(a)
    fire({ key: 'b', ctrl: true }); expect(a.toggleFmt).toHaveBeenCalledWith('bold')
  })
  it('Mod+Shift+X registers strikethrough', () => {
    const a = makeActions(); useShortcuts(a)
    fire({ key: 'x', ctrl: true, shift: true }); expect(a.toggleFmt).toHaveBeenCalledWith('strikethrough')
  })
  it('F4 registers repeat', () => {
    const a = makeActions(); useShortcuts(a)
    fire({ key: 'F4' }); expect(a.repeatLast).toHaveBeenCalled()
  })
  it('Mod+S registers save', () => {
    const a = makeActions(); useShortcuts(a)
    fire({ key: 's', ctrl: true }); expect(a.onSave).toHaveBeenCalled()
  })
  it('Mod+F opens find/replace', () => {
    const a = makeActions(); useShortcuts(a)
    fire({ key: 'f', ctrl: true }); expect(a.showFindReplace.value).toBe(true)
  })
  it('Mod+= / Mod+- / Mod+0 register zoom', () => {
    const a = makeActions(); useShortcuts(a)
    fire({ key: '=', ctrl: true }); expect(a.zoomBy).toHaveBeenCalledWith(+0.1)
    fire({ key: '-', ctrl: true }); expect(a.zoomBy).toHaveBeenCalledWith(-0.1)
    fire({ key: '0', ctrl: true }); expect(a.resetZoom).toHaveBeenCalled()
  })
  it('Mod+L / Shift+F2 / Alt+ArrowDown register nav-edits', () => {
    const a = makeActions(); useShortcuts(a)
    fire({ key: 'l', ctrl: true });        expect(a.openHyperlinkDialog).toHaveBeenCalled()
    fire({ key: 'F2', shift: true });       expect(a.openCommentPanel).toHaveBeenCalled()
    fire({ key: 'ArrowDown', alt: true });  expect(a.openQuickFilterForActive).toHaveBeenCalled()
  })
  it('Mod+Alt+Shift+H registers version history', () => {
    const a = makeActions(); useShortcuts(a)
    fire({ key: 'h', ctrl: true, alt: true, shift: true }); expect(a.openVersionHistory).toHaveBeenCalled()
  })
  it('Mod+D / Mod+R / Mod+E register fill + smart-fill', () => {
    const a = makeActions(); useShortcuts(a)
    fire({ key: 'd', ctrl: true }); expect(a.fillDown).toHaveBeenCalled()
    fire({ key: 'r', ctrl: true }); expect(a.fillRight).toHaveBeenCalled()
    fire({ key: 'e', ctrl: true }); expect(a.runSmartFill).toHaveBeenCalled()
  })
  it('Mod+Shift+V registers paste-values', () => {
    const a = makeActions(); useShortcuts(a)
    fire({ key: 'v', ctrl: true, shift: true }); expect(a.pasteValues).toHaveBeenCalled()
  })
})

// ── Read-only gating (via the registered condition) ──────────────────────────

describe('read-only gating', () => {
  it('mutating shortcuts carry a condition that is false when read-only', () => {
    const a = makeActions({ readOnly: () => true }); useShortcuts(a)
    expect(find({ key: 'z', ctrl: true }).condition()).toBe(false)  // undo
    expect(find({ key: 'b', ctrl: true }).condition()).toBe(false)  // bold
  })
  it('view shortcuts have no condition (stay live when read-only)', () => {
    const a = makeActions({ readOnly: () => true }); useShortcuts(a)
    expect(find({ key: 's', ctrl: true }).condition).toBeUndefined()  // save
  })
})

// ── Residual onGlobalKey: e.code shortcuts ───────────────────────────────────

describe('e.code shortcuts (onGlobalKey)', () => {
  it('Mod+Alt+Equal inserts rows/cols', () => {
    const a = makeActions()
    const { onGlobalKey } = useShortcuts(a)
    onGlobalKey(key({ code: 'Equal', metaKey: true, altKey: true }))
    expect(a.insertRowsCols).toHaveBeenCalled()
  })
  it('Mod+Alt+Minus deletes rows/cols', () => {
    const a = makeActions()
    const { onGlobalKey } = useShortcuts(a)
    onGlobalKey(key({ code: 'Minus', metaKey: true, altKey: true }))
    expect(a.deleteRowsCols).toHaveBeenCalled()
  })
  it('Mod+Shift+Digit1 applies number format', () => {
    const a = makeActions()
    const { onGlobalKey } = useShortcuts(a)
    onGlobalKey(key({ code: 'Digit1', metaKey: true, shiftKey: true }))
    expect(a.applyNumberFormat).toHaveBeenCalledWith('number')
  })
  it('Mod+Shift+Digit4 applies currency format', () => {
    const a = makeActions()
    const { onGlobalKey } = useShortcuts(a)
    onGlobalKey(key({ code: 'Digit4', metaKey: true, shiftKey: true }))
    expect(a.applyNumberFormat).toHaveBeenCalledWith('currency:USD:2')
  })
  it('e.code shortcuts are inert when read-only', () => {
    const a = makeActions({ readOnly: () => true })
    const { onGlobalKey } = useShortcuts(a)
    onGlobalKey(key({ code: 'Equal', metaKey: true, altKey: true }))
    expect(a.insertRowsCols).not.toHaveBeenCalled()
  })
})

// ── Residual onGlobalKey: Escape cascade ─────────────────────────────────────

describe('escape cascade (onGlobalKey)', () => {
  it('Escape closes commentPanel when open', () => {
    const a = makeActions(); a.commentPanel.open = true
    const { onGlobalKey } = useShortcuts(a)
    onGlobalKey(key({ key: 'Escape' }))
    expect(a.commentPanel.open).toBe(false)
  })
  it('Escape closes dropdownPanel when open', () => {
    const a = makeActions(); a.dropdownPanel.open = true
    const { onGlobalKey } = useShortcuts(a)
    onGlobalKey(key({ key: 'Escape' }))
    expect(a.dropdownPanel.open).toBe(false)
  })
  it('Escape clears clipboard marching ants', () => {
    const a = makeActions({ clipboard: { hasData: vi.fn(() => true), clear: vi.fn() } })
    const { onGlobalKey } = useShortcuts(a)
    onGlobalKey(key({ key: 'Escape' }))
    expect(a.clipboard.clear).toHaveBeenCalled()
    expect(a.setMarchingAnts).toHaveBeenCalledWith(null)
  })
})
