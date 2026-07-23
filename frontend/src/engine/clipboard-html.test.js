// @vitest-environment happy-dom
//
// pasteFromHTML needs a DOM (DOMParser) to read the clipboard's <table>, so
// this file opts into happy-dom while the rest of the clipboard suite stays on
// the default node environment.
import { describe, it, expect, beforeEach } from 'vitest'
import { createClipboard } from './clipboard.js'

function makeSheet(initial = {}) {
  const store = { ...initial }
  return {
    getRawData:      () => store,
    getCell:         id => store[id] ?? '',
    setCell:         (id, v) => { store[id] = v },
    getCurrentSheet: () => 'Sheet1',
    getDisplayValue: id => store[id] ?? '',
    _store:          () => store,
  }
}

describe('clipboard — pasteFromHTML (external table paste)', () => {
  let sheet, cb
  beforeEach(() => { sheet = makeSheet(); cb = createClipboard({ sheet }) })

  it('lays a <table> out across rows AND columns (the Gameplan case)', () => {
    // Gameplan's text/plain twin is newline-joined with no tabs, so only the
    // HTML table carries the column structure.
    const html = `<table>
      <tr><td>technextsarl@gmail.com</td><td>Europe</td><td>149</td></tr>
      <tr><td>kovcaroline@gmail.com</td><td>Europe</td><td>188</td></tr>
    </table>`
    const ok = cb.pasteFromHTML(html, 'A1', null, null)
    expect(ok).toBe(true)
    const s = sheet._store()
    expect(s.A1).toBe('technextsarl@gmail.com')
    expect(s.B1).toBe('Europe')
    expect(s.C1).toBe('149')
    expect(s.A2).toBe('kovcaroline@gmail.com')
    expect(s.C2).toBe('188')
  })

  it('honours <th> header rows and anchors at the destination cell', () => {
    const html = '<table><thead><tr><th>Name</th><th>Qty</th></tr></thead>' +
                 '<tbody><tr><td>Widget</td><td>3</td></tr></tbody></table>'
    cb.pasteFromHTML(html, 'B2', null, null)
    const s = sheet._store()
    expect(s.B2).toBe('Name')
    expect(s.C2).toBe('Qty')
    expect(s.B3).toBe('Widget')
    expect(s.C3).toBe('3')
  })

  it('collapses stray whitespace/newlines inside a cell', () => {
    const html = '<table><tr><td>  a\n  b  </td><td>c</td></tr></table>'
    cb.pasteFromHTML(html, 'A1', null, null)
    expect(sheet._store().A1).toBe('a b')
  })

  it('pads colspan cells so later columns stay aligned', () => {
    const html = '<table>' +
                 '<tr><td colspan="2">Region</td><td>Total</td></tr>' +
                 '<tr><td>EU</td><td>West</td><td>9</td></tr></table>'
    cb.pasteFromHTML(html, 'A1', null, null)
    const s = sheet._store()
    expect(s.A1).toBe('Region')
    expect(s.B1).toBe('')      // colspan pad
    expect(s.C1).toBe('Total')
    expect(s.C2).toBe('9')
  })

  it('returns false when the HTML has no table, so callers fall back to text', () => {
    expect(cb.pasteFromHTML('<p>just a paragraph</p>', 'A1', null, null)).toBe(false)
    expect(cb.pasteFromHTML('', 'A1', null, null)).toBe(false)
    expect(sheet._store().A1).toBeUndefined()
  })

  it('measureHTMLPaste reports the table block so undo covers the whole paste', () => {
    // Same undo-capture bug as the text path: an HTML table pasted into a
    // single clicked cell must record every written cell, not just the anchor.
    const html = '<table>' +
                 '<tr><td>a</td><td>b</td><td>c</td></tr>' +
                 '<tr><td>1</td><td>2</td><td>3</td></tr></table>'
    expect(cb.measureHTMLPaste(html, 'A1', { r0: 0, c0: 0, r1: 0, c1: 0 }))
      .toEqual({ r0: 0, c0: 0, r1: 1, c1: 2 })
    // No table → null, so the editor falls through to the text measure.
    expect(cb.measureHTMLPaste('<p>no table</p>', 'A1', null)).toBeNull()
  })
})

// ── Hyperlink preservation from clipboard HTML ───────────────────────────────

function makeFormats() {
  const store = {}
  return {
    get:   (id) => store[id] ?? {},
    set:   (id, fmt) => { store[id] = { ...(store[id] || {}), ...fmt } },
    clear: (id) => { delete store[id] },
    _store: () => store,
  }
}

describe('clipboard — pasteFromHTML keeps <a href> linkness', () => {
  it('maps anchor targets onto fmt.hyperlink with the anchor text as value', () => {
    const sheet   = makeSheet()
    const formats = makeFormats()
    const cb      = createClipboard({ sheet, formats })
    const html = '<table><tr>' +
                 '<td><a href="https://frappe.io/">Frappe</a></td>' +
                 '<td>no link</td></tr></table>'
    expect(cb.pasteFromHTML(html, 'A1', null)).toBe(true)
    expect(sheet._store().A1).toBe('Frappe')
    expect(formats._store().A1).toEqual({ hyperlink: 'https://frappe.io/' })
    expect(formats._store().B1).toBeUndefined()
  })

  it('ignores javascript: anchors but still auto-links URL-shaped text', () => {
    const sheet   = makeSheet()
    const formats = makeFormats()
    const cb      = createClipboard({ sheet, formats })
    const html = '<table><tr>' +
                 '<td><a href="javascript:alert(1)">click</a></td>' +
                 '<td>https://frappe.io/</td></tr></table>'
    cb.pasteFromHTML(html, 'A1', null)
    expect(formats._store().A1).toBeUndefined()
    expect(formats._store().B1).toEqual({ hyperlink: 'https://frappe.io/' })
  })
})
