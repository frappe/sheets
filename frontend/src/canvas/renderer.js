import { COLORS, COL_HEADER_H, ROW_HEADER_W } from './constants.js'
import { colLabel, cellId } from '../utils/cells.js'

export function createRenderer(ctx, geometry) {
  const { cw, rh, colX, rowY, firstVisCol, firstVisRow, lastVisCol, lastVisRow } = geometry
  const frozenW = geometry.frozenW || (() => 0)
  const frozenH = geometry.frozenH || (() => 0)

  function render({ cssW, cssH, data, sel, selEnd, selMode = 'cell', editing, getFormat,
                    freeze: frz = { rows: 0, cols: 0 }, getMergeInfo, isSlave,
                    marchAnts = null, marchPhase = 0, pickerRect = null, zoom = 1 }) {
    if (!cssW || !cssH) return
    ctx.save()
    // dpr handles HiDPI; zoom is the user-facing Ctrl+= / Ctrl+- scale. Both
    // multiply into the ctx transform; geometry below works in logical units.
    const k = (window.devicePixelRatio || 1) * zoom
    ctx.scale(k, k)
    ctx.fillStyle = COLORS.white
    ctx.fillRect(0, 0, cssW, cssH)

    const fc = frz.cols || 0, fr = frz.rows || 0
    const frozW_ = frozenW(), frozH_ = frozenH()
    const mainX = ROW_HEADER_W + frozW_
    const mainY = COL_HEADER_H + frozH_

    const c0s = firstVisCol(), r0s = firstVisRow()
    const c1s = lastVisCol(c0s, cssW), r1s = lastVisRow(r0s, cssH)
    const range = _selRange(sel, selEnd)

    function _region(r0, c0, r1, c1, clipX, clipY, clipW, clipH) {
      if (clipW <= 0 || clipH <= 0 || r1 < r0 || c1 < c0) return
      ctx.save()
      ctx.beginPath(); ctx.rect(clipX, clipY, clipW, clipH); ctx.clip()
      _drawSelFill(range)
      _drawGridLines(r0, c0, r1, c1, cssW, cssH)   // grid first
      _drawCells(r0, c0, r1, c1, data, getFormat, getMergeInfo, isSlave)  // cells erase interior lines
      _drawBorders(r0, c0, r1, c1, getFormat)       // colored borders on top
      if (marchAnts)  _drawMarchingAnts(marchAnts, marchPhase)
      if (pickerRect) _drawPickerRect(pickerRect)
      ctx.restore()
    }

    // 4 regions: bottom-right first so frozen areas paint on top
    _region(r0s, c0s, r1s, c1s, mainX, mainY, cssW - mainX, cssH - mainY)
    if (fr > 0) _region(0, c0s, fr - 1, c1s, mainX, COL_HEADER_H, cssW - mainX, frozH_)
    if (fc > 0) _region(r0s, 0, r1s, fc - 1, ROW_HEADER_W, mainY, frozW_, cssH - mainY)
    if (fr > 0 && fc > 0) _region(0, 0, fr - 1, fc - 1, ROW_HEADER_W, COL_HEADER_H, frozW_, frozH_)

    _drawColHeaders(c0s, c1s, fc, mainX, cssW, sel, range, selMode)
    _drawRowHeaders(r0s, r1s, fr, mainY, cssH, sel, range, selMode)
    _drawCorner()

    if (!editing && selMode === 'cell') {
      // If the active cell is a merge master, span the selection border across
      // its entire merged footprint. Slave cells of a merge can't be selected
      // directly — clicks are redirected to the master in canvas/index.js.
      const activeMerge = getMergeInfo ? getMergeInfo(cellId(sel.r, sel.c)) : null
      const spanC = activeMerge ? activeMerge.colSpan : 1
      const spanR = activeMerge ? activeMerge.rowSpan : 1
      let mergedW = 0, mergedH = 0
      for (let i = 0; i < spanC; i++) mergedW += cw(sel.c + i)
      for (let i = 0; i < spanR; i++) mergedH += rh(sel.r + i)

      // Region-aware clip — a scrollable selection that's scrolled partially
      // under the frozen pane must stop at the pane boundary, never paint
      // across frozen cells. Pick the clip rect based on which region the
      // anchor cell belongs to.
      const inFrozenCol = sel.c < fc
      const inFrozenRow = sel.r < fr
      const clipX = inFrozenCol ? ROW_HEADER_W : mainX
      const clipY = inFrozenRow ? COL_HEADER_H : mainY
      ctx.save()
      ctx.beginPath()
      ctx.rect(clipX, clipY, Math.max(0, cssW - clipX), Math.max(0, cssH - clipY))
      ctx.clip()
      ctx.strokeStyle = COLORS.selBorder
      ctx.lineWidth = 2
      ctx.strokeRect(colX(sel.c) + 1, rowY(sel.r) + 1, mergedW - 2, mergedH - 2)
      ctx.lineWidth = 1
      const hx = colX(sel.c) + mergedW
      const hy = rowY(sel.r) + mergedH
      ctx.fillStyle = COLORS.selHandle
      ctx.beginPath()
      ctx.arc(hx, hy, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    if (frozW_ > 0 || frozH_ > 0) _drawFreezeSeparators(frozW_, frozH_, cssW, cssH)

    ctx.restore()
  }

  function _selRange(sel, selEnd) {
    return {
      r0: Math.min(sel.r, selEnd.r), c0: Math.min(sel.c, selEnd.c),
      r1: Math.max(sel.r, selEnd.r), c1: Math.max(sel.c, selEnd.c),
    }
  }

  function _drawSelFill({ r0, c0, r1, c1 }) {
    const x = colX(c0), y = rowY(r0)
    const w = colX(c1) + cw(c1) - x
    const h = rowY(r1) + rh(r1) - y
    ctx.fillStyle = COLORS.selFill
    ctx.fillRect(x, y, w, h)
  }

  // Marching-ants border around cut/copy source — Google-Sheets-style dashed
  // outline that animates by phase-shifting the dash offset each frame.
  function _drawMarchingAnts({ r0, c0, r1, c1 }, phase) {
    const x = colX(c0) + 1, y = rowY(r0) + 1
    const w = colX(c1) + cw(c1) - x - 1
    const h = rowY(r1) + rh(r1) - y - 1
    ctx.save()
    ctx.lineWidth   = 1.5
    ctx.strokeStyle = COLORS.selBorder
    ctx.setLineDash([5, 3])
    ctx.lineDashOffset = -phase
    ctx.strokeRect(x, y, w, h)
    ctx.restore()
  }

  // Formula reference picker — amber dashed outline + tint over the range that
  // the user has just inserted into a `=…` formula. Static (no animation) so
  // it doesn't compete with the marching-ants on a cut/copy source.
  function _drawPickerRect({ r0, c0, r1, c1 }) {
    const x = colX(c0), y = rowY(r0)
    const w = colX(c1) + cw(c1) - x
    const h = rowY(r1) + rh(r1) - y
    ctx.save()
    ctx.fillStyle = COLORS.pickerFill
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = COLORS.pickerBorder
    ctx.lineWidth   = 1.5
    ctx.setLineDash([6, 4])
    ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5)
    ctx.restore()
  }

  function _drawCells(r0, c0, r1, c1, data, getFormat, getMergeInfo, isSlave) {
    ctx.textBaseline = 'middle'
    for (let r = r0; r <= r1; r++) {
      if (rh(r) === 0) continue
      for (let c = c0; c <= c1; c++) {
        const id = cellId(r, c)
        if (isSlave && isSlave(id)) continue

        const merge = getMergeInfo && getMergeInfo(id)
        const spanC = merge ? merge.colSpan : 1
        const spanR = merge ? merge.rowSpan : 1

        const val = data[id]
        const fmt = getFormat ? getFormat(id) : {}
        const x = colX(c), y = rowY(r)

        let w = 0
        for (let sc = 0; sc < spanC; sc++) w += cw(c + sc)
        let h = 0
        for (let sr = 0; sr < spanR; sr++) h += rh(r + sr)

        // Merged cells: erase interior grid lines with white background
        if (merge) {
          ctx.fillStyle = COLORS.white
          ctx.fillRect(x + 1, y + 1, w - 1, h - 1)
        }

        if (fmt.backgroundColor) {
          ctx.fillStyle = fmt.backgroundColor
          ctx.fillRect(x, y, w, h)
        }

        if (val == null || val === '') continue

        const weight = fmt.bold   ? 'bold'   : 'normal'
        const style  = fmt.italic ? 'italic' : 'normal'
        const fontPx = Math.max(8, Math.min(72, fmt.fontSize || 13))
        const family = fmt.fontFamily || 'InterVar, Inter, ui-sans-serif, system-ui, sans-serif'
        ctx.font      = `${style} ${weight} ${fontPx}px ${family}`
        // Hyperlinks render in Espresso ink-blue-3 (unless the user set a
        // custom color) — link semantics are the one place an accent blue is
        // expected, even in our otherwise-monochrome theme.
        ctx.fillStyle = fmt.color || (fmt.hyperlink ? '#007BE0' : COLORS.cellText)
        ctx.textAlign = fmt.align || 'left'

        if (fmt.wrapText) {
          _drawWrappedText(String(val), x, y, w, h, fmt)
        } else {
          ctx.save()
          ctx.beginPath(); ctx.rect(x + 1, y, w - 2, h); ctx.clip()
          const textX = fmt.align === 'center' ? x + w / 2
                      : fmt.align === 'right'  ? x + w - 4
                      : x + 4
          // Vertical alignment — default is middle (preserves current behavior).
          const textY = fmt.valign === 'top'    ? y + 4
                      : fmt.valign === 'bottom' ? y + h - 4
                      :                            y + h / 2
          const baseline = fmt.valign === 'top'    ? 'top'
                         : fmt.valign === 'bottom' ? 'bottom'
                         :                            'middle'
          ctx.textBaseline = baseline
          ctx.fillText(String(val), textX, textY)

          if (fmt.underline || fmt.strikethrough || fmt.hyperlink) {
            const tw  = ctx.measureText(String(val)).width
            const lx0 = fmt.align === 'center' ? textX - tw / 2
                      : fmt.align === 'right'  ? textX - tw
                      : textX
            // Convert the text anchor (textY) to its rendered middle line so
            // strikes/underlines sit consistently regardless of valign.
            const midY = baseline === 'top'    ? textY + 7
                       : baseline === 'bottom' ? textY - 7
                       :                          textY
            ctx.strokeStyle = fmt.color || (fmt.hyperlink ? '#007BE0' : COLORS.cellText)
            ctx.lineWidth   = 1
            if (fmt.underline || fmt.hyperlink) {
              ctx.beginPath()
              ctx.moveTo(lx0, midY + 8)
              ctx.lineTo(lx0 + tw, midY + 8)
              ctx.stroke()
            }
            if (fmt.strikethrough) {
              ctx.beginPath()
              ctx.moveTo(lx0, midY + 1)
              ctx.lineTo(lx0 + tw, midY + 1)
              ctx.stroke()
            }
          }
          ctx.restore()
        }
      }
    }
  }

  function _drawWrappedText(val, x, y, w, h, fmt) {
    const maxW   = w - 8
    const lineH  = 16
    const words  = val.split(/\s+/).filter(Boolean)
    if (!words.length) return

    const lines = []
    let line = ''
    for (const word of words) {
      const test = line ? line + ' ' + word : word
      if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = word }
      else line = test
    }
    if (line) lines.push(line)

    const totalH = lines.length * lineH
    // First-line text middle, anchored per vertical alignment.
    const startY = fmt.valign === 'top'    ? y + lineH / 2 + 2
                 : fmt.valign === 'bottom' ? y + h - totalH + lineH / 2 - 2
                 :                            y + Math.max(lineH / 2, (h - totalH) / 2 + lineH / 2)
    const textX  = fmt.align === 'center' ? x + w / 2
                 : fmt.align === 'right'  ? x + w - 4
                 : x + 4

    ctx.save()
    ctx.textBaseline = 'middle'
    ctx.beginPath(); ctx.rect(x + 1, y + 1, w - 2, h - 2); ctx.clip()
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], textX, startY + i * lineH)
    ctx.restore()
  }

  function _drawBorders(r0, c0, r1, c1, getFormat) {
    if (!getFormat) return
    for (let r = r0; r <= r1; r++) {
      if (rh(r) === 0) continue
      for (let c = c0; c <= c1; c++) {
        const fmt = getFormat(cellId(r, c))
        if (!fmt) continue
        const x = colX(c), y = rowY(r), w = cw(c), h = rh(r)
        if (fmt.borderTop)    _borderLine(x, y,     x + w, y,     fmt.borderTop)
        if (fmt.borderBottom) _borderLine(x, y + h, x + w, y + h, fmt.borderBottom)
        if (fmt.borderLeft)   _borderLine(x, y,     x,     y + h, fmt.borderLeft)
        if (fmt.borderRight)  _borderLine(x + w, y, x + w, y + h, fmt.borderRight)
      }
    }
  }

  function _borderLine(x1, y1, x2, y2, border) {
    const { style = 'thin', color = '#000000' } = border
    ctx.strokeStyle = color
    ctx.lineWidth   = style === 'thick' ? 3 : style === 'medium' ? 2 : 1
    ctx.beginPath()
    ctx.moveTo(x1 + 0.5, y1 + 0.5)
    ctx.lineTo(x2 + 0.5, y2 + 0.5)
    ctx.stroke()
  }

  function _drawGridLines(r0, c0, r1, c1, cssW, cssH) {
    ctx.strokeStyle = COLORS.gridLine
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let r = r0; r <= r1 + 1; r++) { const y = rowY(r) + 0.5; ctx.moveTo(ROW_HEADER_W, y); ctx.lineTo(cssW, y) }
    for (let c = c0; c <= c1 + 1; c++) { const x = colX(c) + 0.5; ctx.moveTo(x, COL_HEADER_H); ctx.lineTo(x, cssH) }
    ctx.stroke()

    // Hidden-column / hidden-row indicator: a 2px ink-gray-7 line in the body
    // at every boundary where a hidden col/row meets a visible one.
    ctx.strokeStyle = COLORS.freezeLine
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let c = c0; c <= c1; c++) {
      if (cw(c) > 0 && cw(c + 1) === 0) {
        const x = colX(c) + cw(c) + 0.5
        ctx.moveTo(x, COL_HEADER_H); ctx.lineTo(x, cssH)
      }
    }
    for (let r = r0; r <= r1; r++) {
      if (rh(r) > 0 && rh(r + 1) === 0) {
        const y = rowY(r) + rh(r) + 0.5
        ctx.moveTo(ROW_HEADER_W, y); ctx.lineTo(cssW, y)
      }
    }
    ctx.stroke()
  }

  function _drawFreezeSeparators(frozW_, frozH_, cssW, cssH) {
    ctx.strokeStyle = COLORS.freezeLine
    ctx.lineWidth = 2
    ctx.beginPath()
    if (frozW_ > 0) {
      const x = ROW_HEADER_W + frozW_ + 0.5
      ctx.moveTo(x, COL_HEADER_H); ctx.lineTo(x, cssH)
    }
    if (frozH_ > 0) {
      const y = COL_HEADER_H + frozH_ + 0.5
      ctx.moveTo(ROW_HEADER_W, y); ctx.lineTo(cssW, y)
    }
    ctx.stroke()
  }

  // Draw a single column header cell at its current x position. Pulled out of
  // the loop so we can call it from two passes with different clip rects.
  function _drawOneColHeader(c, sel, range, selMode) {
    const x = colX(c), w = cw(c)
    const inRange    = c >= range.c0 && c <= range.c1
    const isSelected = (selMode === 'col' || selMode === 'all') && inRange
    const isAnchor   = c === sel.c
    // Only paint a per-cell background for highlighted states. The default
    // headerBg has already been filled across the whole strip — re-painting it
    // per column would clobber the previous column's right boundary line.
    if (isSelected)    { ctx.fillStyle = COLORS.activeHeader; ctx.fillRect(x, 0, w, COL_HEADER_H) }
    else if (isAnchor) { ctx.fillStyle = COLORS.activeHeader; ctx.fillRect(x, 0, w, COL_HEADER_H) }
    else if (inRange)  { ctx.fillStyle = COLORS.rangeHeader;  ctx.fillRect(x, 0, w, COL_HEADER_H) }
    ctx.fillStyle = (isSelected || isAnchor) ? COLORS.cellText : COLORS.headerText
    if (w > 0) ctx.fillText(colLabel(c), x + w / 2, COL_HEADER_H / 2)
    const nextHidden = cw(c + 1) === 0 && c + 1 < 9999
    if (w > 0 && nextHidden) {
      ctx.strokeStyle = COLORS.freezeLine; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(x + w + 0.5, 0); ctx.lineTo(x + w + 0.5, COL_HEADER_H); ctx.stroke()
      _drawHiddenChevronsV(x + w, COL_HEADER_H / 2)
    } else {
      ctx.strokeStyle = COLORS.gridLine; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x + w + 0.5, 0); ctx.lineTo(x + w + 0.5, COL_HEADER_H); ctx.stroke()
    }
  }

  // Frozen-aware column header drawing.
  //   - Background fill spans the whole strip.
  //   - Scrollable headers (c >= fc) are drawn inside a clip starting at
  //     mainX = ROW_HEADER_W + frozenW, so a header sliding leftward under
  //     `scroll.x` can never paint over the frozen-header area.
  //   - Frozen headers (c < fc) are drawn *after*, with no clip, so they sit
  //     on top of any scrollable header that's poking under them.
  function _drawColHeaders(c0Scroll, c1Scroll, fc, mainX, cssW, sel, range, selMode) {
    ctx.fillStyle = COLORS.headerBg
    ctx.fillRect(ROW_HEADER_W, 0, cssW, COL_HEADER_H)
    ctx.font = '12px InterVar, Inter, ui-sans-serif, system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'

    // Pass 1 — scrollable headers, clipped so they can't bleed into the
    // frozen area on the left.
    ctx.save()
    ctx.beginPath()
    ctx.rect(mainX, 0, Math.max(0, cssW - mainX), COL_HEADER_H)
    ctx.clip()
    for (let c = Math.max(c0Scroll, fc); c <= c1Scroll; c++) _drawOneColHeader(c, sel, range, selMode)
    ctx.restore()

    // Pass 2 — frozen headers on top, no clip.
    for (let c = 0; c < fc; c++) _drawOneColHeader(c, sel, range, selMode)

    // Bottom divider beneath the headers.
    ctx.strokeStyle = COLORS.gridLine; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ROW_HEADER_W, COL_HEADER_H + 0.5); ctx.lineTo(cssW, COL_HEADER_H + 0.5); ctx.stroke()
  }

  // ◀▶ marker pair, centred on (bx, by), pointing apart — communicates that
  // columns are hidden at this boundary. Mirror for rows: ▲▼.
  function _drawHiddenChevronsV(bx, by) {
    const sz = 3
    ctx.fillStyle = COLORS.headerText
    ctx.beginPath()
    ctx.moveTo(bx - 2,     by - sz)
    ctx.lineTo(bx - 2 - sz, by)
    ctx.lineTo(bx - 2,     by + sz)
    ctx.closePath(); ctx.fill()
    ctx.beginPath()
    ctx.moveTo(bx + 2,     by - sz)
    ctx.lineTo(bx + 2 + sz, by)
    ctx.lineTo(bx + 2,     by + sz)
    ctx.closePath(); ctx.fill()
  }

  function _drawHiddenChevronsH(bx, by) {
    const sz = 3
    ctx.fillStyle = COLORS.headerText
    ctx.beginPath()
    ctx.moveTo(bx - sz, by - 2)
    ctx.lineTo(bx,      by - 2 - sz)
    ctx.lineTo(bx + sz, by - 2)
    ctx.closePath(); ctx.fill()
    ctx.beginPath()
    ctx.moveTo(bx - sz, by + 2)
    ctx.lineTo(bx,      by + 2 + sz)
    ctx.lineTo(bx + sz, by + 2)
    ctx.closePath(); ctx.fill()
  }

  function _drawOneRowHeader(r, sel, range, selMode) {
    const y = rowY(r), h = rh(r)
    if (h === 0) return
    const inRange    = r >= range.r0 && r <= range.r1
    const isSelected = (selMode === 'row' || selMode === 'all') && inRange
    const isAnchor   = r === sel.r
    // Same rule as _drawOneColHeader — skip the redundant per-cell bg fill so
    // the previous row's bottom divider survives.
    if (isSelected)    { ctx.fillStyle = COLORS.activeHeader; ctx.fillRect(0, y, ROW_HEADER_W, h) }
    else if (isAnchor) { ctx.fillStyle = COLORS.activeHeader; ctx.fillRect(0, y, ROW_HEADER_W, h) }
    else if (inRange)  { ctx.fillStyle = COLORS.rangeHeader;  ctx.fillRect(0, y, ROW_HEADER_W, h) }
    ctx.fillStyle = (isSelected || isAnchor) ? COLORS.cellText : COLORS.headerText
    ctx.fillText(String(r + 1), ROW_HEADER_W / 2, y + h / 2)
    const nextHidden = rh(r + 1) === 0 && r + 1 < 9999
    if (nextHidden) {
      ctx.strokeStyle = COLORS.freezeLine; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(0, y + h + 0.5); ctx.lineTo(ROW_HEADER_W, y + h + 0.5); ctx.stroke()
      _drawHiddenChevronsH(ROW_HEADER_W / 2, y + h)
    } else {
      ctx.strokeStyle = COLORS.gridLine; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, y + h + 0.5); ctx.lineTo(ROW_HEADER_W, y + h + 0.5); ctx.stroke()
    }
  }

  // Frozen-aware row header drawing — same shape as _drawColHeaders but along
  // the vertical axis. Scrollable row headers clipped to start at mainY so
  // they can't paint over the frozen-row strip; frozen row headers drawn last
  // on top.
  function _drawRowHeaders(r0Scroll, r1Scroll, fr, mainY, cssH, sel, range, selMode) {
    ctx.fillStyle = COLORS.headerBg
    ctx.fillRect(0, COL_HEADER_H, ROW_HEADER_W, cssH)
    ctx.font = '12px InterVar, Inter, ui-sans-serif, system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'

    ctx.save()
    ctx.beginPath()
    ctx.rect(0, mainY, ROW_HEADER_W, Math.max(0, cssH - mainY))
    ctx.clip()
    for (let r = Math.max(r0Scroll, fr); r <= r1Scroll; r++) _drawOneRowHeader(r, sel, range, selMode)
    ctx.restore()

    for (let r = 0; r < fr; r++) _drawOneRowHeader(r, sel, range, selMode)

    ctx.strokeStyle = COLORS.gridLine; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ROW_HEADER_W + 0.5, COL_HEADER_H); ctx.lineTo(ROW_HEADER_W + 0.5, cssH); ctx.stroke()
  }

  function _drawCorner() {
    ctx.fillStyle = COLORS.headerBg
    ctx.fillRect(0, 0, ROW_HEADER_W, COL_HEADER_H)
    ctx.strokeStyle = COLORS.gridLine; ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(ROW_HEADER_W + 0.5, 0); ctx.lineTo(ROW_HEADER_W + 0.5, COL_HEADER_H)
    ctx.moveTo(0, COL_HEADER_H + 0.5); ctx.lineTo(ROW_HEADER_W, COL_HEADER_H + 0.5)
    ctx.stroke()
  }

  return { render }
}
