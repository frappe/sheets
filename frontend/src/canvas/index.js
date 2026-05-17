import { createGeometry } from './geometry.js'
import { createRenderer } from './renderer.js'
import { createOverlay }  from './overlay.js'
import { TOTAL_ROWS, TOTAL_COLS, DEFAULT_ROW_H, ROW_HEADER_W, COL_HEADER_H, setTotalRows } from './constants.js'
import { cellId, colLabel, parseCellId } from '../utils/cells.js'

export { colLabel, cellId, parseCellId } from '../utils/cells.js'

export function createGrid(canvas, { onSelect, onCommit, onInput, onCancel, getFormat, onFill, onBatchCommit, getMergeInfo, isSlave, getMasterId } = {}) {
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1

  const data = {}
  const colW = {}
  const rowH = {}

  let sel    = { r: 0, c: 0 }
  let selEnd = { r: 0, c: 0 }
  let selMode    = 'cell'  // 'cell' | 'col' | 'row'
  let dragging   = false
  let editing    = false
  let resizing   = null  // { col, startX, startW }
  let resizingRow = null  // { row, startY, startH }
  let filling    = null  // { startCell }

  const scroll     = { x: 0, y: 0 }
  const freeze     = { rows: 0, cols: 0 }
  const hiddenRows = new Set()
  const hiddenCols = new Set()
  let cssW = 0, cssH = 0

  // Marching-ants rect drawn over cut/copy source until paste/Escape clears it.
  let marchAnts  = null     // { r0, c0, r1, c1 } or null
  let marchPhase = 0
  let _marchRAF  = null

  // User-facing zoom (Ctrl+= / Ctrl+-). Affects ctx transform + hit tests.
  let _zoom = 1

  let _acEl = null, _acItems = [], _acIdx = 0

  const geo      = createGeometry(colW, rowH, scroll, freeze, hiddenRows, hiddenCols, () => _zoom)
  const renderer = createRenderer(ctx, geo)
  const overlay  = createOverlay(canvas.parentElement)
  _acSetup()

  // ── Render ──────────────────────────────────────────────────────────────────

  let _raf = null
  function scheduleRender() {
    if (!_raf) _raf = requestAnimationFrame(() => { _raf = null; render() })
  }

  const _renderListeners = []
  function onRender(cb) { _renderListeners.push(cb); return () => { const i = _renderListeners.indexOf(cb); if (i >= 0) _renderListeners.splice(i, 1) } }

  function render() {
    renderer.render({ cssW, cssH, data, sel, selEnd, selMode, editing, getFormat, freeze, getMergeInfo, isSlave, marchAnts, marchPhase, pickerRect, zoom: _zoom })
    for (const cb of _renderListeners) cb()
  }

  function _stepMarch() {
    _marchRAF = null
    if (!marchAnts) return
    marchPhase = (marchPhase + 0.5) % 1000
    render()
    _marchRAF = requestAnimationFrame(_stepMarch)
  }

  function setMarchingAnts(rect) {
    if (rect && (rect.r0 === undefined || rect.c0 === undefined)) rect = null
    marchAnts = rect ? { r0: rect.r0, c0: rect.c0, r1: rect.r1, c1: rect.c1 } : null
    if (_marchRAF) { cancelAnimationFrame(_marchRAF); _marchRAF = null }
    if (marchAnts) _marchRAF = requestAnimationFrame(_stepMarch)
    else           render()
  }

  // Visible column header rects for DOM overlays (filter chevrons, etc).
  // Returns [{c, x, width}] for frozen + currently-visible non-frozen columns.
  function getColumnHeaderRects() {
    const rects = []
    const fc = freeze.cols || 0
    for (let c = 0; c < fc; c++) rects.push({ c, x: geo.colX(c), width: geo.cw(c) })
    const c0 = geo.firstVisCol()
    const c1 = geo.lastVisCol(c0, cssW)
    for (let c = c0; c <= c1; c++) rects.push({ c, x: geo.colX(c), width: geo.cw(c) })
    return rects
  }

  // Row-0 rect — the user's header row of data. Used to position filter chevrons.
  function getRow0Rect() {
    return { y: geo.rowY(0), height: geo.rh(0) }
  }

  // ── Selection ────────────────────────────────────────────────────────────────

  function getSelRange() {
    return {
      r0: Math.min(sel.r, selEnd.r), c0: Math.min(sel.c, selEnd.c),
      r1: Math.max(sel.r, selEnd.r), c1: Math.max(sel.c, selEnd.c),
      mode: selMode,
    }
  }

  // Max scroll so the last col/row sits flush with the viewport's right/bottom.
  // Beyond this we'd just be showing empty canvas past the sheet — Google
  // Sheets clamps to here, so do we.
  function _sheetTotalW() { let w = 0; for (let c = 0; c < TOTAL_COLS; c++) w += geo.cw(c); return w }
  function _sheetTotalH() { let h = 0; for (let r = 0; r < TOTAL_ROWS; r++) h += geo.rh(r); return h }
  function _maxScrollX()  { return Math.max(0, _sheetTotalW() + ROW_HEADER_W - cssW) }
  function _maxScrollY()  { return Math.max(0, _sheetTotalH() + COL_HEADER_H - cssH) }
  function _clampScroll() {
    scroll.x = Math.max(0, Math.min(scroll.x, _maxScrollX()))
    scroll.y = Math.max(0, Math.min(scroll.y, _maxScrollY()))
  }

  function ensureVisible(r, c) {
    if (c < (freeze.cols || 0) || r < (freeze.rows || 0)) return
    const frozW_ = geo.frozenW ? geo.frozenW() : 0
    const frozH_ = geo.frozenH ? geo.frozenH() : 0
    const x = geo.colX(c), y = geo.rowY(r), w = geo.cw(c), h = geo.rh(r)
    const minX = 50 + frozW_, minY = 24 + frozH_
    if (x < minX)        scroll.x = Math.max(0, scroll.x - (minX - x))
    else if (x+w > cssW) scroll.x += x + w - cssW + 8
    if (y < minY)        scroll.y = Math.max(0, scroll.y - (minY - y))
    else if (y+h > cssH) scroll.y += y + h - cssH + 8
    _clampScroll()
  }

  function moveSel(r, c) {
    selMode = 'cell'
    const p = geo.clamp(r, c)
    sel = selEnd = p
    ensureVisible(sel.r, sel.c)
    // Any non-picker selection move dismisses a lingering picker highlight.
    if (pickerRect) { pickerRect = null }
    render()
    onSelect?.(cellId(sel.r, sel.c))
  }

  function extendSel(r, c) {
    selEnd = geo.clamp(r, c)
    ensureVisible(selEnd.r, selEnd.c)
    render()
  }

  // Jump to data-region edge (Cmd+Arrow behaviour matching Google Sheets)
  function _jumpEdge(startR, startC, dr, dc) {
    const maxR = TOTAL_ROWS - 1, maxC = TOTAL_COLS - 1
    const curFilled = !!data[cellId(startR, startC)]
    let nr = Math.max(0, Math.min(maxR, startR + dr))
    let nc = Math.max(0, Math.min(maxC, startC + dc))
    if (curFilled && !!data[cellId(nr, nc)]) {
      // Scan forward to end of contiguous block
      let r = startR, c = startC
      while (true) {
        const tr = r + dr, tc = c + dc
        if (tr < 0 || tr > maxR || tc < 0 || tc > maxC) break
        if (!data[cellId(tr, tc)]) break
        r = tr; c = tc
      }
      return { r, c }
    } else {
      // Scan forward to next filled cell
      let r = startR + dr, c = startC + dc
      while (r >= 0 && r <= maxR && c >= 0 && c <= maxC) {
        if (data[cellId(r, c)]) return { r, c }
        r += dr; c += dc
      }
      // No filled cell — go to grid boundary
      return {
        r: dr > 0 ? maxR : dr < 0 ? 0 : startR,
        c: dc > 0 ? maxC : dc < 0 ? 0 : startC,
      }
    }
  }

  function _lastUsedCell() {
    let maxR = 0, maxC = 0
    for (const id of Object.keys(data)) {
      const p = parseCellId(id)
      if (p) { if (p.row > maxR) maxR = p.row; if (p.col > maxC) maxC = p.col }
    }
    return { r: maxR, c: maxC }
  }

  // ── Formula autocomplete ─────────────────────────────────────────────────────

  const _AC_FUNS = {
    ABS:'(number)', AND:'(logical1, ...)', AVERAGE:'(number1, ...)',
    AVERAGEIF:'(range, criteria, [avg_range])', CEILING:'(number, significance)',
    CHOOSE:'(index, value1, ...)', COLUMN:'([reference])', COLUMNS:'(array)',
    CONCAT:'(text1, ...)', CONCATENATE:'(text1, ...)',
    COUNT:'(value1, ...)', COUNTA:'(value1, ...)', COUNTBLANK:'(range)',
    COUNTIF:'(range, criteria)', COUNTIFS:'(range1, criteria1, ...)',
    DATE:'(year, month, day)', DAY:'(date)', EXP:'(number)',
    FALSE:'()', FIND:'(find_text, within_text, [start])',
    FLOOR:'(number, significance)', HLOOKUP:'(value, table, row, [range])',
    HOUR:'(time)', IF:'(test, value_if_true, [value_if_false])',
    IFERROR:'(value, value_if_error)', IFS:'(condition1, value1, ...)',
    INDEX:'(array, row, [col])', INDIRECT:'(ref_text)',
    INT:'(number)', ISBLANK:'(value)', ISERROR:'(value)',
    ISNUMBER:'(value)', ISTEXT:'(value)',
    LARGE:'(array, k)', LEFT:'(text, [num_chars])',
    LEN:'(text)', LN:'(number)', LOG:'(number, [base])',
    LOWER:'(text)', MATCH:'(value, array, [type])',
    MAX:'(number1, ...)', MID:'(text, start, num_chars)',
    MIN:'(number1, ...)', MINUTE:'(time)', MOD:'(number, divisor)',
    MONTH:'(date)', NOT:'(logical)', NOW:'()',
    OR:'(logical1, ...)', PI:'()', POWER:'(base, exponent)',
    PRODUCT:'(number1, ...)', PROPER:'(text)',
    RAND:'()', RANDBETWEEN:'(bottom, top)', RANK:'(number, ref, [order])',
    REPLACE:'(text, start, num_chars, new_text)', REPT:'(text, times)',
    RIGHT:'(text, [num_chars])', ROUND:'(number, digits)',
    ROUNDDOWN:'(number, digits)', ROUNDUP:'(number, digits)',
    ROW:'([reference])', ROWS:'(array)',
    SEARCH:'(find_text, within_text, [start])',
    SMALL:'(array, k)', SQRT:'(number)',
    SUBSTITUTE:'(text, old, new, [instance])',
    SUM:'(number1, ...)', SUMIF:'(range, criteria, [sum_range])',
    SUMIFS:'(sum_range, range1, criteria1, ...)',
    TEXT:'(value, format_text)', TEXTJOIN:'(delimiter, ignore_empty, text1, ...)',
    TIME:'(hour, minute, second)', TODAY:'()', TRIM:'(text)', TRUE:'()',
    UPPER:'(text)', VALUE:'(text)',
    VLOOKUP:'(value, table, col_index, [range_lookup])',
    WEEKDAY:'(date, [return_type])', YEAR:'(date)',
  }

  function _acSetup() {
    _acEl = document.createElement('div')
    _acEl.style.cssText = [
      'position:absolute', 'display:none', 'z-index:50',
      'background:#fff', 'border:1px solid #e2e2e2', 'border-radius:6px',
      'box-shadow:0 4px 14px rgba(0,0,0,.1)',
      'min-width:200px', 'max-height:208px', 'overflow-y:auto',
      'padding:4px 0',
      'font:13px Inter,system-ui,sans-serif',
    ].join(';')
    canvas.parentElement.appendChild(_acEl)
  }

  function _acToken(value, cursor) {
    if (!value || !value.startsWith('=')) return null
    const before = value.slice(0, cursor)
    const m = before.match(/(?:[=(+\-*/&^,])([A-Za-z][A-Za-z0-9_]*)$|^=([A-Za-z][A-Za-z0-9_]*)$/)
    return m ? (m[1] || m[2]) : null
  }

  function _acUpdate(value, cursor) {
    if (!_acEl) return
    const tok = _acToken(value, cursor)
    if (!tok) { _acHide(); return }
    const up = tok.toUpperCase()
    _acItems = Object.keys(_AC_FUNS).filter(n => n.startsWith(up)).sort().slice(0, 8)
    if (!_acItems.length) { _acHide(); return }
    _acIdx = 0
    _acRender()
  }

  function _acRender() {
    if (!_acEl) return
    _acEl.innerHTML = ''
    _acItems.forEach((name, i) => {
      const row = document.createElement('div')
      row.style.cssText = `display:flex;align-items:baseline;gap:10px;padding:6px 12px;cursor:pointer;white-space:nowrap;${i === _acIdx ? 'background:#f3f3f3;' : ''}`
      row.innerHTML = `<span style="font-weight:600;min-width:80px;color:#171717;">${name}</span><span style="font-size:11px;color:#7c7c7c;">${_AC_FUNS[name]}</span>`
      row.addEventListener('mousedown', e => { e.preventDefault(); _acCommit(name) })
      row.addEventListener('mouseover', () => { _acIdx = i; _acHighlight() })
      _acEl.appendChild(row)
    })
    const ox = parseFloat(overlay.el.style.left) || 0
    const oy = parseFloat(overlay.el.style.top)  || 0
    const oh = parseFloat(overlay.el.style.height) || 24
    _acEl.style.left    = ox + 'px'
    _acEl.style.top     = (oy + oh + 2) + 'px'
    _acEl.style.display = 'block'
  }

  function _acHighlight() {
    if (!_acEl) return
    Array.from(_acEl.children).forEach((row, i) => {
      row.style.background = i === _acIdx ? '#f3f3f3' : ''
    })
  }

  function _acHide() {
    _acItems = []; _acIdx = 0
    if (_acEl) _acEl.style.display = 'none'
  }

  function _acCommit(name) {
    const input = overlay.el
    const cursor = input.selectionStart, value = input.value
    const before = value.slice(0, cursor)
    const m = before.match(/(?:[=(+\-*/&^,])([A-Za-z][A-Za-z0-9_]*)$|^=([A-Za-z][A-Za-z0-9_]*)$/)
    if (m) {
      const tok = m[1] || m[2], tokStart = cursor - tok.length
      const newVal = value.slice(0, tokStart) + name + '(' + value.slice(cursor)
      input.value = newVal
      const pos = tokStart + name.length + 1
      input.setSelectionRange(pos, pos)
      onInput?.(cellId(sel.r, sel.c), newVal)
    }
    _acHide()
    input.focus()
  }

  // ── Inline editor ────────────────────────────────────────────────────────────

  // 'enter' mode (fresh typing) lets arrow keys commit-and-move like Excel /
  // Google Sheets. 'edit' mode (F2 / dblclick on existing content) keeps arrow
  // keys as cursor movement inside the input.
  let editMode = 'enter'

  // Formula-reference picker. Active while *any* focused <input> contains a
  // formula (`=…`) and the user clicks/drags cells. The click inserts the
  // cell's ref into that input instead of moving selection. Drag extends to a
  // range. Works for both the inline cell editor (overlay) and the top
  // formula bar — anything that's a currently-focused <input> with =-prefixed
  // text qualifies.
  let picker     = null  // { anchorR, anchorC, target: HTMLInputElement }
  // The visible amber dashed highlight. Tracks the last picked cell/range and
  // stays visible until the edit commits or is cancelled.
  let pickerRect = null  // { r0, c0, r1, c1 }
  // Keyboard-driven picker state ("PICKING" in the state-machine doc). Set by
  // arrow keys while editing a formula at a ref-acceptable caret position.
  // Going to null returns us to EDITING (text caret moves). See _pickerKb*.
  let pickerKb   = null  // { target, anchorR, anchorC, headR, headC, insertStart, insertEnd, savedValue, savedCaret }

  function _pickTarget() {
    const ae = document.activeElement
    if (!ae || ae.tagName !== 'INPUT') return null
    if (typeof ae.value !== 'string' || !ae.value.startsWith('=')) return null
    return ae
  }

  function _isPickMode() { return !!_pickTarget() }

  // Returns the index right before any partial ref characters that abut the
  // cursor — e.g. cursor after `=SUM(A1:B` → start of `A1:B`. Lets a click
  // *replace* a half-typed reference instead of appending.
  function _refReplaceStart(input) {
    const pos = input.selectionStart
    const val = input.value
    const m = val.slice(0, pos).match(/[A-Z]+\d*(?::[A-Z]*\d*)?$/i)
    return m ? pos - m[0].length : pos
  }

  function _refForRange(r0, c0, r1, c1, sheetName) {
    const a = colLabel(c0) + (r0 + 1)
    const range = (r0 === r1 && c0 === c1) ? a : a + ':' + colLabel(c1) + (r1 + 1)
    // Sheet prefix only when the pick is on a different sheet than the one
    // the formula was started on. Quoted if the name has spaces or weirdness
    // (matches the engine's tokenizer, which accepts both quoted and bare).
    if (!sheetName) return range
    return /\s|[!]/.test(sheetName) ? `'${sheetName}'!${range}` : `${sheetName}!${range}`
  }
  // TODO(cross-sheet picker): wire a `getCurrentSheet` / `getEditingHomeSheet`
  // callback from the SheetEditor so the picker can detect cross-sheet picks
  // and pass a non-null `sheetName` here. The engine already understands
  // `Sheet2!A1` notation; the missing piece is keeping the in-cell editor
  // alive across sheet-tab switches so the user can actually click on the
  // other sheet without the editor blur-committing. Separate feature.

  function _clearPickerHighlight() {
    if (!pickerRect && !picker && !pickerKb) return
    picker = null
    pickerKb = null
    pickerRect = null
    render()
  }

  function _writeRef(input, refText, replaceStart) {
    const val = input.value
    const cursor = input.selectionStart
    const next = val.slice(0, replaceStart) + refText + val.slice(cursor)
    input.value = next
    const newPos = replaceStart + refText.length
    input.setSelectionRange(newPos, newPos)
    // Notify any framework binding (Vue v-model / @input listeners on the
    // top formula bar) plus our overlay's existing input handler.
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  // ── Formula picker — keyboard state machine ─────────────────────────────────
  //
  // While editing a `=…` formula, arrow keys at a *reference-acceptable* caret
  // position drive a phantom picker cursor on the grid (match Google Sheets):
  //   IDLE → showEditor → EDITING
  //   EDITING → (arrow at ref pos) → PICKING → (arrow) updates ref live
  //   EDITING → (arrow mid-token)  → native caret move (no picker)
  //   PICKING → (type non-arrow)   → EDITING, inserted ref stays
  //   PICKING → (Esc)              → EDITING, inserted ref removed
  //   PICKING → (Enter/Tab)        → IDLE,    formula committed
  //
  // The text caret BEFORE the picker started is preserved so Esc can revert.

  const REF_PRECEDERS = '=(,;+-*/:&^<>%'

  function _isRefPosition(input) {
    const pos = input.selectionStart
    if (pos == null) return false
    const left = input.value.slice(0, pos)
    if (!left.startsWith('=')) return false
    const trimmed = left.replace(/\s+$/, '')
    if (trimmed === '=') return true
    const last = trimmed[trimmed.length - 1]
    if (REF_PRECEDERS.includes(last)) return true
    // Trailing chars form a partial cell ref AND are preceded by a ref-preceder.
    const m = trimmed.match(/([A-Z]+\d*(?::[A-Z]*\d*)?)$/i)
    if (!m) return false
    const before = trimmed.slice(0, trimmed.length - m[0].length).replace(/\s+$/, '')
    if (!before) return true                                  // just '=A1'
    const prev = before[before.length - 1]
    return REF_PRECEDERS.includes(prev)
  }

  // Resolve a click/keystroke landing on a slave cell to its merge master.
  function _resolveMaster(r, c) {
    if (!getMasterId) return { r, c }
    const mid = getMasterId(cellId(r, c))
    if (!mid) return { r, c }
    const p = parseCellId(mid)
    return p ? { r: p.row, c: p.col } : { r, c }
  }

  // Skip hidden rows/cols when moving the picker head. dr/dc are ±1.
  function _skipHiddenR(r, dr) {
    while (r >= 0 && r < TOTAL_ROWS && geo.rh(r) === 0) r += dr
    return Math.max(0, Math.min(TOTAL_ROWS - 1, r))
  }
  function _skipHiddenC(c, dc) {
    while (c >= 0 && c < TOTAL_COLS && geo.cw(c) === 0) c += dc
    return Math.max(0, Math.min(TOTAL_COLS - 1, c))
  }

  // Bring (r, c) into view inside the scrollable region — same idea as
  // ensureVisible but works regardless of `sel` (which we don't move).
  function _scrollIntoView(r, c) {
    const frozW_ = geo.frozenW(), frozH_ = geo.frozenH()
    if (c >= (freeze.cols || 0)) {
      const x = geo.colX(c), w = geo.cw(c)
      const minX = ROW_HEADER_W + frozW_
      if (x < minX)         scroll.x = Math.max(0, scroll.x - (minX - x))
      else if (x + w > cssW) scroll.x += x + w - cssW + 8
    }
    if (r >= (freeze.rows || 0)) {
      const y = geo.rowY(r), h = geo.rh(r)
      const minY = COL_HEADER_H + frozH_
      if (y < minY)         scroll.y = Math.max(0, scroll.y - (minY - y))
      else if (y + h > cssH) scroll.y += y + h - cssH + 8
    }
    _clampScroll()
  }

  // Compute the ref text from anchor+head and rewrite the inserted span.
  function _pickerKbRender() {
    if (!pickerKb) return
    const { target, anchorR, anchorC, headR, headC, insertStart } = pickerKb
    const r0 = Math.min(anchorR, headR), r1 = Math.max(anchorR, headR)
    const c0 = Math.min(anchorC, headC), c1 = Math.max(anchorC, headC)
    const ref = _refForRange(r0, c0, r1, c1)
    // Replace the previously-inserted span (anchored by insertStart).
    const val = target.value
    const next = val.slice(0, insertStart) + ref + val.slice(pickerKb.insertEnd)
    target.value = next
    pickerKb.insertEnd = insertStart + ref.length
    target.setSelectionRange(pickerKb.insertEnd, pickerKb.insertEnd)
    target.dispatchEvent(new Event('input', { bubbles: true }))
    pickerRect = { r0, c0, r1, c1 }
    _scrollIntoView(headR, headC)
    render()
  }

  // Enter PICKING from EDITING. Anchor starts at the cell directly adjacent
  // to the edited cell, in the direction of the arrow keypress.
  function _pickerKbStart(target, dr, dc, shiftKey) {
    const savedCaret = target.selectionStart
    const savedValue = target.value

    let anchorR, anchorC, headR, headC, insertStart, insertEnd

    // Mouse → keyboard handoff: a prior click/drag set `picker` and the ref
    // was inserted at the input's current cursor. Adopt that anchor + rect
    // so Shift+arrow extends from where the user dragged, not from `sel`.
    if (picker && picker.target === target && pickerRect) {
      const refLen = _refForRange(pickerRect.r0, pickerRect.c0, pickerRect.r1, pickerRect.c1).length
      insertEnd   = target.selectionStart
      insertStart = Math.max(0, insertEnd - refLen)

      anchorR = picker.anchorR
      anchorC = picker.anchorC
      // Current "head" = the rect corner opposite the anchor.
      const curHeadR = (anchorR === pickerRect.r0) ? pickerRect.r1 : pickerRect.r0
      const curHeadC = (anchorC === pickerRect.c0) ? pickerRect.c1 : pickerRect.c0
      headR = curHeadR + dr
      headC = curHeadC + dc
    } else {
      insertStart = _refReplaceStart(target)
      insertEnd   = target.selectionStart
      // Fresh pick — start one step from the edited cell.
      headR = sel.r + dr
      headC = sel.c + dc
      anchorR = headR; anchorC = headC
    }

    // Clamp, skip hidden, resolve merge masters.
    headR = Math.max(0, Math.min(TOTAL_ROWS - 1, headR))
    headC = Math.max(0, Math.min(TOTAL_COLS - 1, headC))
    if (dr !== 0) headR = _skipHiddenR(headR, dr)
    if (dc !== 0) headC = _skipHiddenC(headC, dc)
    const m = _resolveMaster(headR, headC)
    headR = m.r; headC = m.c
    // Plain arrow collapses the range; Shift+arrow extends.
    if (!shiftKey) { anchorR = headR; anchorC = headC }

    pickerKb = {
      target, anchorR, anchorC, headR, headC,
      insertStart, insertEnd, savedValue, savedCaret,
    }
    _pickerKbRender()
  }

  // Move/extend the picker head. shift=true keeps anchor, false collapses.
  // mod=true → jump to data-region edge using existing _jumpEdge.
  function _pickerKbMove(dr, dc, shift, mod) {
    if (!pickerKb) return
    let nr = pickerKb.headR + dr, nc = pickerKb.headC + dc
    if (mod) {
      const t = _jumpEdge(pickerKb.headR, pickerKb.headC, dr, dc)
      nr = t.r; nc = t.c
    } else {
      // Skip hidden rows/cols
      if (dr !== 0) nr = _skipHiddenR(nr, dr)
      if (dc !== 0) nc = _skipHiddenC(nc, dc)
      nr = Math.max(0, Math.min(TOTAL_ROWS - 1, nr))
      nc = Math.max(0, Math.min(TOTAL_COLS - 1, nc))
    }
    const master = _resolveMaster(nr, nc)
    nr = master.r; nc = master.c
    if (!shift) { pickerKb.anchorR = nr; pickerKb.anchorC = nc }
    pickerKb.headR = nr; pickerKb.headC = nc
    _pickerKbRender()
  }

  // Cancel PICKING (Esc): restore the input to its pre-picker state.
  function _pickerKbCancel() {
    if (!pickerKb) return
    const { target, savedValue, savedCaret } = pickerKb
    target.value = savedValue
    target.setSelectionRange(savedCaret, savedCaret)
    target.dispatchEvent(new Event('input', { bubbles: true }))
    pickerKb = null
    pickerRect = null
    render()
  }

  // Exit PICKING but keep the inserted ref (user typed an operator / digit).
  function _pickerKbCommit() {
    pickerKb = null
    // Leave pickerRect visible — picker.kind = 'cell' so anchor data is the
    // last picked rect. It'll clear on next selection move / commit / cancel.
  }

  function showEditor(initialValue, mode = 'enter') {
    editMode = mode
    const fmt = getFormat ? getFormat(cellId(sel.r, sel.c)) : {}
    overlay.position(geo.colX(sel.c), geo.rowY(sel.r), geo.cw(sel.c), geo.rh(sel.r), fmt)
    overlay.show(initialValue)
    editing = true
    onInput?.(cellId(sel.r, sel.c), initialValue)
    render()
  }

  function _commitAndHide() {
    if (!editing) return
    _acHide()
    editing = false
    const id  = cellId(sel.r, sel.c)
    const val = overlay.getValue()
    overlay.hide()
    _clearPickerHighlight()
    onCommit?.(id, val)
  }

  overlay.el.addEventListener('input', () => {
    const val = overlay.getValue()
    onInput?.(cellId(sel.r, sel.c), val)
    _acUpdate(val, overlay.el.selectionStart)
  })

  overlay.el.addEventListener('keydown', e => {
    if (_acItems.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); _acIdx = Math.min(_acIdx + 1, _acItems.length - 1); _acHighlight(); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); _acIdx = Math.max(_acIdx - 1, 0); _acHighlight(); return }
      if ((e.key === 'Tab' || e.key === 'Enter') && _acItems[_acIdx]) { e.preventDefault(); _acCommit(_acItems[_acIdx]); return }
      if (e.key === 'Escape')    { _acHide(); return }
    }
    // In 'enter' mode, arrow keys commit the current value and move the
    // selection one cell in that direction — matching Excel / Google Sheets.
    // In 'edit' mode (F2 / dblclick), arrows stay as cursor-movement.
    if (editMode === 'enter' && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const dirs = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
      const [dr, dc] = dirs[e.key]
      e.preventDefault()
      _commitAndHide()
      moveSel(sel.r + dr, sel.c + dc)
      canvas.focus()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      _commitAndHide()
      moveSel(sel.r + 1, sel.c)
      canvas.focus()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      _commitAndHide()
      moveSel(sel.r, e.shiftKey ? sel.c - 1 : sel.c + 1)
      canvas.focus()
    } else if (e.key === 'Escape') {
      _acHide()
      editing = false
      overlay.hide()
      _clearPickerHighlight()
      render()
      canvas.focus()
      onCancel?.(cellId(sel.r, sel.c))
    }
  })

  overlay.el.addEventListener('blur', () => {
    if (!editing) return
    _acHide()
    editing = false
    const id  = cellId(sel.r, sel.c)
    const val = overlay.getValue()
    overlay.hide()
    render()
    onCommit?.(id, val)
  })

  // ── Fill handle ──────────────────────────────────────────────────────────────

  function _fillHandlePos() {
    // Anchor at the bottom-right of the merged footprint when the active cell
    // is a merge master, so the visual handle and its hit test align.
    const merge = getMergeInfo ? getMergeInfo(cellId(sel.r, sel.c)) : null
    const spanC = merge ? merge.colSpan : 1
    const spanR = merge ? merge.rowSpan : 1
    let w = 0, h = 0
    for (let i = 0; i < spanC; i++) w += geo.cw(sel.c + i)
    for (let i = 0; i < spanR; i++) h += geo.rh(sel.r + i)
    return {
      fx: geo.colX(sel.c) + w,
      fy: geo.rowY(sel.r) + h,
    }
  }

  function hitTestFillHandle(ex, ey, rect) {
    if (editing) return false
    // Mouse coords are physical CSS px; fillHandlePos is logical. Undo zoom.
    const x = (ex - rect.left) / _zoom
    const y = (ey - rect.top)  / _zoom
    const { fx, fy } = _fillHandlePos()
    return Math.hypot(x - fx, y - fy) <= 8
  }

  // ── Auto-fit (double-click resize edge or header) ────────────────────────────

  // Measure with the same font the renderer uses, scoped to a fmt's bold/italic.
  function _measureWidth(text, fmt) {
    const weight = fmt?.bold   ? 'bold'   : 'normal'
    const style  = fmt?.italic ? 'italic' : 'normal'
    ctx.save()
    ctx.font = `${style} ${weight} 13px InterVar, Inter, ui-sans-serif, system-ui, sans-serif`
    const w = ctx.measureText(String(text)).width
    ctx.restore()
    return w
  }

  function autoFitCol(c) {
    const CELL_PAD   = 12   // matches renderer's left/right padding (≈6px each side)
    const HEADER_PAD = 16
    const MIN_W      = 40
    const MAX_W      = 600
    let widest = _measureWidth(colLabel(c), { bold: true }) + HEADER_PAD
    for (const id of Object.keys(data)) {
      const p = parseCellId(id)
      if (!p || p.col !== c) continue
      const val = data[id]
      if (val == null || val === '') continue
      const fmt = getFormat ? getFormat(id) : {}
      // Skip wrap-text columns — they auto-grow rows, not cols.
      if (fmt.wrapText) continue
      const w = _measureWidth(val, fmt) + CELL_PAD
      if (w > widest) widest = w
    }
    colW[c] = Math.max(MIN_W, Math.min(MAX_W, Math.ceil(widest)))
    _applyCanvasSize()
    render()
  }

  function autoFitRow(r) {
    const ROW_PAD = 6
    const MIN_H   = DEFAULT_ROW_H
    const MAX_H   = 400
    let tallest = MIN_H
    for (const id of Object.keys(data)) {
      const p = parseCellId(id)
      if (!p || p.row !== r) continue
      const val = data[id]
      if (val == null || val === '') continue
      const fmt = getFormat ? getFormat(id) : {}
      let h = 18 // single line height at 13px
      if (fmt.wrapText) {
        // Estimate wrapped line count from measured width vs. column width.
        const w   = _measureWidth(val, fmt)
        const cw  = Math.max(1, geo.cw(p.col) - 8)
        const ln  = Math.max(1, Math.ceil(w / cw))
        h = ln * 18
      }
      if (h + ROW_PAD > tallest) tallest = h + ROW_PAD
    }
    rowH[r] = Math.max(MIN_H, Math.min(MAX_H, Math.ceil(tallest)))
    _applyCanvasSize()
    render()
  }

  // ── Canvas events ────────────────────────────────────────────────────────────

  canvas.addEventListener('mousedown', e => {
    const rect = canvas.getBoundingClientRect()

    // ── PRIORITY 0: formula reference picker ────────────────────────────────
    // While a `=…` formula is focused (in-cell overlay OR top formula bar),
    // *any* canvas click is routed to the picker. This is what kills the
    // VLOOKUP-mid-typing crash: previously a click on a column/row header
    // would commit the partial formula → parser throws. Now those clicks
    // insert a column/row reference instead.
    const pickInput = _pickTarget()
    if (pickInput) {
      e.preventDefault()
      // Resize edges / fill handle / corner are no-ops during pick.
      if (geo.hitTestColResize(e.clientX, e.clientY, rect) !== null) return
      if (geo.hitTestRowResize(e.clientX, e.clientY, rect) !== null) return
      if (geo.hitTestCorner(e.clientX, e.clientY, rect))              return
      if (hitTestFillHandle(e.clientX, e.clientY, rect))              return

      const colHit = geo.hitTestColHeader(e.clientX, e.clientY, rect)
      if (colHit !== null) {
        // Full-column reference (`A:A`).
        const ref = `${colLabel(colHit)}:${colLabel(colHit)}`
        _writeRef(pickInput, ref, _refReplaceStart(pickInput))
        picker     = { anchorR: 0, anchorC: colHit, target: pickInput, kind: 'col' }
        pickerRect = { r0: 0, c0: colHit, r1: TOTAL_ROWS - 1, c1: colHit }
        render()
        return
      }
      const rowHit = geo.hitTestRowHeader(e.clientX, e.clientY, rect)
      if (rowHit !== null) {
        // Full-row reference (`1:1`).
        const ref = `${rowHit + 1}:${rowHit + 1}`
        _writeRef(pickInput, ref, _refReplaceStart(pickInput))
        picker     = { anchorR: rowHit, anchorC: 0, target: pickInput, kind: 'row' }
        pickerRect = { r0: rowHit, c0: 0, r1: rowHit, c1: TOTAL_COLS - 1 }
        render()
        return
      }
      const h = geo.hitTest(e.clientX, e.clientY, rect)
      if (!h) return
      // No self-reference — clicking the cell being edited is a no-op.
      if (editing && h.r === sel.r && h.c === sel.c) return
      // Slave cells redirect to their merge master.
      let tr = h.r, tc = h.c
      if (getMasterId) {
        const mid = getMasterId(cellId(h.r, h.c))
        if (mid) { const p = parseCellId(mid); if (p) { tr = p.row; tc = p.col } }
      }
      _writeRef(pickInput, _refForRange(tr, tc, tr, tc), _refReplaceStart(pickInput))
      picker     = { anchorR: tr, anchorC: tc, target: pickInput, kind: 'cell' }
      pickerRect = { r0: tr, c0: tc, r1: tr, c1: tc }
      pickerKb   = null   // mouse-pick supersedes any keyboard pick state
      render()
      return
    }

    const resizeCol = geo.hitTestColResize(e.clientX, e.clientY, rect)
    if (resizeCol !== null) {
      e.preventDefault()
      resizing = { col: resizeCol, startX: e.clientX, startW: colW[resizeCol] ?? 100 }
      return
    }

    const resizeRowHit = geo.hitTestRowResize(e.clientX, e.clientY, rect)
    if (resizeRowHit !== null) {
      e.preventDefault()
      resizingRow = { row: resizeRowHit, startY: e.clientY, startH: rowH[resizeRowHit] ?? DEFAULT_ROW_H }
      return
    }

    if (hitTestFillHandle(e.clientX, e.clientY, rect)) {
      filling = { startCell: cellId(sel.r, sel.c) }
      return
    }

    // Top-left corner cell → select the entire grid (Google Sheets behavior).
    if (geo.hitTestCorner(e.clientX, e.clientY, rect)) {
      if (editing) _commitAndHide()
      selMode = 'all'
      sel    = { r: 0, c: 0 }
      selEnd = { r: TOTAL_ROWS - 1, c: TOTAL_COLS - 1 }
      canvas.focus()
      render()
      onSelect?.('A1')
      return
    }

    const colHit = geo.hitTestColHeader(e.clientX, e.clientY, rect)
    if (colHit !== null) {
      if (editing) _commitAndHide()
      selMode = 'col'
      sel    = { r: 0, c: colHit }
      selEnd = { r: TOTAL_ROWS - 1, c: colHit }
      canvas.focus()
      render()
      onSelect?.(colLabel(colHit) + ':' + colLabel(colHit))
      return
    }

    const rowHit = geo.hitTestRowHeader(e.clientX, e.clientY, rect)
    if (rowHit !== null) {
      if (editing) _commitAndHide()
      selMode = 'row'
      sel    = { r: rowHit, c: 0 }
      selEnd = { r: rowHit, c: TOTAL_COLS - 1 }
      canvas.focus()
      render()
      onSelect?.(String(rowHit + 1) + ':' + String(rowHit + 1))
      return
    }

    // Picker check moved to top of mousedown (PRIORITY 0) — by here we know
    // no =-formula input is focused, so a click is a real selection.
    if (editing) _commitAndHide()
    const h = geo.hitTest(e.clientX, e.clientY, rect)
    if (!h) return
    canvas.focus()
    dragging = true
    // Redirect clicks on slave cells to their master cell
    let tr = h.r, tc = h.c
    if (getMasterId) {
      const mid = getMasterId(cellId(h.r, h.c))
      if (mid) { const p = parseCellId(mid); if (p) { tr = p.row; tc = p.col } }
    }
    if (e.shiftKey) extendSel(tr, tc)
    else            moveSel(tr, tc)
  })

  canvas.addEventListener('dblclick', e => {
    const rect = canvas.getBoundingClientRect()

    // Double-click on the column resize edge or column header → auto-fit column width.
    const resizeCol = geo.hitTestColResize(e.clientX, e.clientY, rect)
    if (resizeCol !== null)        { autoFitCol(resizeCol); return }
    const headerCol = geo.hitTestColHeader(e.clientX, e.clientY, rect)
    if (headerCol !== null)        { autoFitCol(headerCol); return }

    // Double-click on the row resize edge or row header → auto-fit row height.
    const resizeRowHit = geo.hitTestRowResize(e.clientX, e.clientY, rect)
    if (resizeRowHit !== null)     { autoFitRow(resizeRowHit); return }
    const headerRow = geo.hitTestRowHeader(e.clientX, e.clientY, rect)
    if (headerRow !== null)        { autoFitRow(headerRow); return }

    const h = geo.hitTest(e.clientX, e.clientY, rect)
    if (!h) return
    showEditor(data[cellId(h.r, h.c)] ?? '', 'edit')
  })

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect()
    const resizeCol = geo.hitTestColResize(e.clientX, e.clientY, rect)
    const resizeRowHit = !resizing && geo.hitTestRowResize(e.clientX, e.clientY, rect)
    const overFill  = !resizing && !resizingRow && !dragging && hitTestFillHandle(e.clientX, e.clientY, rect)
    if (resizeCol !== null || resizing)          canvas.style.cursor = 'col-resize'
    else if (resizeRowHit !== null || resizingRow) canvas.style.cursor = 'row-resize'
    else if (overFill)                            canvas.style.cursor = 'crosshair'
    else                                          canvas.style.cursor = 'default'

    if (filling) {
      const h = geo.hitTest(e.clientX, e.clientY, rect)
      if (h) extendSel(h.r, h.c)
      return
    }
    if (picker) {
      const h = geo.hitTest(e.clientX, e.clientY, rect)
      if (h) {
        const r0 = Math.min(picker.anchorR, h.r), r1 = Math.max(picker.anchorR, h.r)
        const c0 = Math.min(picker.anchorC, h.c), c1 = Math.max(picker.anchorC, h.c)
        _writeRef(picker.target, _refForRange(r0, c0, r1, c1), _refReplaceStart(picker.target))
        pickerRect = { r0, c0, r1, c1 }
        render()
      }
      return
    }
    if (!dragging) return
    const h = geo.hitTest(e.clientX, e.clientY, rect)
    if (h) extendSel(h.r, h.c)
  })

  canvas.addEventListener('mouseup', () => {
    if (filling) {
      const { r0, c0, r1, c1 } = getSelRange()
      const srcId  = filling.startCell
      const targets = []
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const id = cellId(r, c)
          if (id !== srcId) targets.push(id)
        }
      if (targets.length) onFill?.(srcId, targets)
      filling = null
    }
    if (picker) {
      // Return focus to whichever input fed the picker so the user keeps typing.
      const t = picker.target
      picker = null
      t?.focus?.()
    }
    dragging = false
  })

  function _onDocMouseMove(e) {
    if (resizing) {
      // Drag delta is in physical CSS px; colW stores logical units, so undo
      // the zoom on the delta before applying.
      colW[resizing.col] = Math.max(30, resizing.startW + (e.clientX - resizing.startX) / _zoom)
      _applyCanvasSize()
      render()
    }
    if (resizingRow) {
      rowH[resizingRow.row] = Math.max(16, resizingRow.startH + (e.clientY - resizingRow.startY) / _zoom)
      _applyCanvasSize()
      render()
    }
  }

  function _onDocMouseUp() {
    if (resizing)    resizing    = null
    if (resizingRow) resizingRow = null
  }

  document.addEventListener('mousemove', _onDocMouseMove)
  document.addEventListener('mouseup',   _onDocMouseUp)

  // Document-level keydown delegator — picks up arrow keys for both the
  // in-cell overlay AND the top formula bar input without touching Vue.
  // Only intercepts when a =-formula input is the focus target.
  function _onDocPickerKey(e) {
    const target = _pickTarget()
    if (!target) return
    // Home/End/Shift+Home/Shift+End always move text caret. Never picker.
    if (e.key === 'Home' || e.key === 'End') return

    const dirs = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }
    const dir = dirs[e.key]
    const mod = e.ctrlKey || e.metaKey

    // PICKING mode — every keydown is meaningful.
    if (pickerKb && pickerKb.target === target) {
      if (dir) {
        e.preventDefault()
        e.stopPropagation()
        _pickerKbMove(dir[0], dir[1], e.shiftKey, mod)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        _pickerKbCancel()
        return                                       // EDITING continues
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        _pickerKbCommit()
        return                                       // fall through to commit
      }
      // Any other key (digit, letter, operator, comma, close-paren, etc.):
      // exit PICKING and let the keystroke reach the input naturally.
      _pickerKbCommit()
      return
    }

    // EDITING mode — only arrow keys with a ref-acceptable caret trigger picker.
    if (dir && _isRefPosition(target)) {
      e.preventDefault()
      e.stopPropagation()
      _pickerKbStart(target, dir[0], dir[1], e.shiftKey)
      return
    }
    // Otherwise let the native input handle the key (caret moves in text).
  }
  // capture=true so we beat the overlay's own keydown listener that would
  // commit-and-move on plain arrows.
  document.addEventListener('keydown', _onDocPickerKey, true)

  canvas.addEventListener('wheel', e => {
    e.preventDefault()
    // Wheel deltas are physical pixels; scroll is logical. Divide so a single
    // notch advances the same logical distance regardless of zoom.
    scroll.x += e.deltaX / _zoom
    scroll.y += e.deltaY / _zoom
    _clampScroll()
    if (editing) {
      const fmt = getFormat ? getFormat(cellId(sel.r, sel.c)) : {}
      overlay.position(geo.colX(sel.c) * _zoom, geo.rowY(sel.r) * _zoom, geo.cw(sel.c) * _zoom, geo.rh(sel.r) * _zoom, fmt, _zoom)
    }
    render()
  }, { passive: false })

  canvas.setAttribute('tabindex', '0')
  canvas.addEventListener('keydown', e => {
    const { r, c }         = sel
    const { r: er, c: ec } = selEnd
    const mod    = e.ctrlKey || e.metaKey
    const isArrow = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)
    const dirs   = { ArrowUp:[-1,0], ArrowDown:[1,0], ArrowLeft:[0,-1], ArrowRight:[0,1] }

    // Cmd+Arrow / Cmd+Shift+Arrow — jump to data-region edge
    if (mod && isArrow) {
      e.preventDefault()
      const [dr, dc] = dirs[e.key]
      if (e.shiftKey) { const t = _jumpEdge(er, ec, dr, dc); extendSel(t.r, t.c) }
      else            { const t = _jumpEdge(r,  c,  dr, dc); moveSel(t.r,  t.c)  }
      return
    }

    // Cmd+Home / Cmd+End
    if (mod && e.key === 'Home') {
      e.preventDefault()
      if (e.shiftKey) extendSel(0, 0); else moveSel(0, 0)
      return
    }
    if (mod && e.key === 'End') {
      e.preventDefault()
      const last = _lastUsedCell()
      if (e.shiftKey) extendSel(last.r, last.c); else moveSel(last.r, last.c)
      return
    }

    // Shift+Arrow — extend selection one cell
    if (e.shiftKey && !mod && isArrow) {
      e.preventDefault()
      const [dr, dc] = dirs[e.key]
      extendSel(er + dr, ec + dc)
      return
    }

    if (e.key === 'F2') { e.preventDefault(); showEditor(data[cellId(r, c)] ?? '', 'edit'); return }

    if ((e.key === 'Delete' || e.key === 'Backspace') && !mod) {
      e.preventDefault()
      onCommit?.(cellId(r, c), '')
      return
    }

    if (e.key.length === 1 && !mod) { e.preventDefault(); showEditor(e.key); return }

    const moves = {
      ArrowUp:[r-1,c], ArrowDown:[r+1,c], ArrowLeft:[r,c-1], ArrowRight:[r,c+1],
      Tab:[r,c+1], Enter:[r+1,c],
    }
    if (moves[e.key]) { e.preventDefault(); moveSel(...moves[e.key]) }
  })

  // ── Public API ───────────────────────────────────────────────────────────────

  // Last viewport dimensions reported by the parent (gridWrap). Stored so we
  // can re-apply the sheet-extent cap whenever column/row sizes change.
  let _viewportW = 0, _viewportH = 0

  function _applyCanvasSize() {
    // Logical viewport (cssW/cssH) shrinks with zoom so the geometry sees a
    // smaller area while the on-screen pixels stay constant. The canvas's
    // *physical* size is tied to the viewport (×dpr ×zoom), so high-DPI plus
    // zoom both contribute to backing-store resolution.
    const sheetW = _sheetTotalW() + ROW_HEADER_W
    const sheetH = _sheetTotalH() + COL_HEADER_H
    const viewLogicalW = _viewportW / _zoom
    const viewLogicalH = _viewportH / _zoom
    cssW = Math.min(viewLogicalW, sheetW)
    cssH = Math.min(viewLogicalH, sheetH)
    // Physical CSS size is logical × zoom; backing store is that × dpr.
    const physW = cssW * _zoom
    const physH = cssH * _zoom
    canvas.width  = Math.round(physW * dpr)
    canvas.height = Math.round(physH * dpr)
    canvas.style.width  = physW + 'px'
    canvas.style.height = physH + 'px'
    _clampScroll()
  }

  function resize(w, h) {
    // Cap the canvas to the actual sheet extent. If the viewport is wider than
    // the sheet, the canvas is shrunk so nothing renders past column Z / row N,
    // and the surrounding wrap shows its own background. Matches the no-blank
    // behavior of Google Sheets.
    _viewportW = w; _viewportH = h
    _applyCanvasSize()
    render()
  }

  function setCell(id, value) {
    if (!value && value !== 0) delete data[id]
    else data[id] = value
    scheduleRender()
  }

  function batchSetCells(map) {
    for (const [id, value] of Object.entries(map)) {
      if (!value && value !== 0) delete data[id]
      else data[id] = value
    }
    scheduleRender()
  }

  function clearAll() {
    for (const k of Object.keys(data)) delete data[k]
    render()
  }

  function destroy() {
    overlay.remove()
    _acEl?.remove()
    if (_raf)       { cancelAnimationFrame(_raf);       _raf = null }
    if (_marchRAF)  { cancelAnimationFrame(_marchRAF);  _marchRAF = null }
    document.removeEventListener('mousemove', _onDocMouseMove)
    document.removeEventListener('mouseup',   _onDocMouseUp)
    document.removeEventListener('keydown',   _onDocPickerKey, true)
  }

  function getColWidth(c)    { return colW[c] ?? 100 }
  function setColWidth(c, w) { geo.setColWidth(c, w); _applyCanvasSize(); scheduleRender() }
  function getRowHeight(r)   { return rowH[r] ?? DEFAULT_ROW_H }
  function setRowHeight(r, h){ geo.setRowHeight(r, h); _applyCanvasSize(); scheduleRender() }

  function shiftRowHeights(atRow, delta) {
    const pairs = Object.entries(rowH).map(([k, v]) => [+k, v]).filter(([r]) => r >= atRow)
    delta > 0 ? pairs.sort((a, b) => b[0] - a[0]) : pairs.sort((a, b) => a[0] - b[0])
    for (const [r, h] of pairs) { delete rowH[r]; const nr = r + delta; if (nr >= 0) rowH[nr] = h }
    _applyCanvasSize()
  }

  function shiftColWidths(atCol, delta) {
    const pairs = Object.entries(colW).map(([k, v]) => [+k, v]).filter(([c]) => c >= atCol)
    delta > 0 ? pairs.sort((a, b) => b[0] - a[0]) : pairs.sort((a, b) => a[0] - b[0])
    for (const [c, w] of pairs) { delete colW[c]; const nc = c + delta; if (nc >= 0) colW[nc] = w }
    _applyCanvasSize()
  }

  function getHitRegion(ex, ey) {
    const rect = canvas.getBoundingClientRect()
    return {
      headerCol: geo.hitTestColHeader(ex, ey, rect),
      headerRow: geo.hitTestRowHeader(ex, ey, rect),
      cell:      geo.hitTest(ex, ey, rect),
    }
  }

  function setFreeze(rows, cols) {
    freeze.rows = rows || 0
    freeze.cols = cols || 0
    // CRITICAL: reset scroll so the first scrollable column/row sits flush at
    // the right/bottom edge of the frozen pane (spec rule: leftmost visible
    // at scrollLeft=0 must be column N). Without this, freezing while already
    // scrolled hides cols N..N+k under the just-frozen pane's mapping.
    scroll.x = 0
    scroll.y = 0
    _clampScroll()
    render()
  }

  function setHiddenRows(newSet) {
    hiddenRows.clear()
    for (const r of newSet) hiddenRows.add(r)
    _applyCanvasSize()
    render()
  }

  function setHiddenCols(newSet) {
    hiddenCols.clear()
    for (const c of newSet) hiddenCols.add(c)
    _applyCanvasSize()
    render()
  }

  function getHiddenRows() { return new Set(hiddenRows) }
  function getHiddenCols() { return new Set(hiddenCols) }

  function expandRows(by = 1000) {
    setTotalRows(TOTAL_ROWS + by)
    _applyCanvasSize()
    render()
  }

  function getTotalRows() { return TOTAL_ROWS }

  function setZoom(z) {
    _zoom = Math.max(0.5, Math.min(2.5, z))
    _applyCanvasSize()
    render()
  }
  function getZoom() { return _zoom }

  // True when the user has scrolled close enough to the bottom of the sheet
  // that an "add more rows" affordance is worth showing. Threshold is in rows.
  function isNearBottom(threshold = 10) {
    const r0   = geo.firstVisRow()
    const last = geo.lastVisRow(r0, cssH)
    return last >= TOTAL_ROWS - 1 - threshold
  }

  // ── View-state snapshot/restore (for persistence) ────────────────────────────
  // Captures everything the user can change visually but isn't part of the
  // cell/format/merge engines: column widths, row heights, freeze, hidden,
  // total-rows expansion, zoom. Without this the doc would reload with default
  // 100px widths, no freeze, no expanded rows, etc.
  function viewSnapshot() {
    return {
      colW:       { ...colW },
      rowH:       { ...rowH },
      freezeRows: freeze.rows || 0,
      freezeCols: freeze.cols || 0,
      hiddenRows: Array.from(hiddenRows),
      hiddenCols: Array.from(hiddenCols),
      totalRows:  TOTAL_ROWS,
      zoom:       _zoom,
    }
  }

  function viewRestore(snap) {
    if (!snap) return
    for (const k of Object.keys(colW)) delete colW[k]
    for (const k of Object.keys(rowH)) delete rowH[k]
    Object.assign(colW, snap.colW || {})
    Object.assign(rowH, snap.rowH || {})
    freeze.rows = snap.freezeRows || 0
    freeze.cols = snap.freezeCols || 0
    hiddenRows.clear()
    for (const r of (snap.hiddenRows || [])) hiddenRows.add(r)
    hiddenCols.clear()
    for (const c of (snap.hiddenCols || [])) hiddenCols.add(c)
    if (typeof snap.totalRows === 'number') setTotalRows(snap.totalRows)
    if (typeof snap.zoom === 'number')      _zoom = Math.max(0.5, Math.min(2.5, snap.zoom))
    _applyCanvasSize()
    render()
  }

  return {
    resize, render, setCell, batchSetCells, clearAll,
    getCell: id => data[id] ?? '',
    getActiveCell: () => cellId(sel.r, sel.c),
    getSelection: getSelRange,
    getColWidth, setColWidth, getRowHeight, setRowHeight,
    shiftRowHeights, shiftColWidths, getHitRegion,
    setFreeze, setHiddenRows, setHiddenCols, getHiddenRows, getHiddenCols,
    getColumnHeaderRects, getRow0Rect, onRender,
    setMarchingAnts,
    autoFitCol, autoFitRow,
    expandRows, getTotalRows, isNearBottom,
    setZoom, getZoom,
    viewSnapshot, viewRestore,
    destroy,
  }
}
