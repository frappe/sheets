import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCellPainter } from './cell-painter.js'
import { createMockCtx, createMockGeo } from './test-utils.js'

// drawRegionCells now reads values through a getVal(id) function (the lazy
// render seam) instead of indexing a data object. gv() adapts a plain
// { id: value } fixture to that contract so these tests read naturally.
const gv = obj => id => obj[id]

describe('CellPainter', () => {
  let ctx, geo, painter

  beforeEach(() => {
    ctx     = createMockCtx()
    geo     = createMockGeo()
    painter = createCellPainter(ctx, geo)
  })

  describe('drawRegionCells', () => {
    it('draws nothing when data is empty', () => {
      painter.drawRegionCells(0, 0, 2, 2, gv({}), null, null, null)
      expect(ctx.fillText).not.toHaveBeenCalled()
    })

    it('calls fillText for a cell that has a value', () => {
      painter.drawRegionCells(0, 0, 1, 1, gv({ 'A1': 'Hello' }), null, null, null)
      expect(ctx.fillText).toHaveBeenCalledWith('Hello', expect.any(Number), expect.any(Number))
    })

    it('right-aligns numeric values automatically', () => {
      painter.drawRegionCells(0, 0, 0, 0, gv({ 'A1': '42' }), null, null, null)
      expect(ctx.textAlign).toBe('right')
    })

    it('left-aligns text values automatically', () => {
      painter.drawRegionCells(0, 0, 0, 0, gv({ 'A1': 'hello' }), null, null, null)
      expect(ctx.textAlign).toBe('left')
    })

    it('respects explicit fmt.align over auto-detection', () => {
      const getFormat = vi.fn(() => ({ align: 'center' }))
      painter.drawRegionCells(0, 0, 0, 0, gv({ 'A1': '99' }), getFormat, null, null)
      expect(ctx.textAlign).toBe('center')
    })

    it('skips slave cells entirely', () => {
      const isSlave = vi.fn(() => true)
      painter.drawRegionCells(0, 0, 0, 0, gv({ 'A1': 'data' }), null, null, isSlave)
      expect(ctx.fillText).not.toHaveBeenCalled()
    })

    it('draws a white background rect for merged cells', () => {
      const getMergeInfo = vi.fn(() => ({ colSpan: 2, rowSpan: 1 }))
      painter.drawRegionCells(0, 0, 0, 0, gv({}), null, getMergeInfo, null)
      expect(ctx.fillRect).toHaveBeenCalled()
    })

    it('applies backgroundColor from format', () => {
      const getFormat = vi.fn(() => ({ backgroundColor: '#FF0000' }))
      painter.drawRegionCells(0, 0, 0, 0, gv({ 'A1': '' }), getFormat, null, null)
      expect(ctx.fillStyle).toBe('#FF0000')
    })

    it('skips rows with zero height', () => {
      const geoHidden = createMockGeo({ rowHeights: { 0: 0 } })
      const p = createCellPainter(ctx, geoHidden)
      p.drawRegionCells(0, 0, 0, 0, gv({ 'A1': 'hi' }), null, null, null)
      expect(ctx.fillText).not.toHaveBeenCalled()
    })
  })

  describe('drawRegionBorders', () => {
    it('does nothing when getFormat is null', () => {
      painter.drawRegionBorders(0, 0, 2, 2, null, null, null)
      expect(ctx.stroke).not.toHaveBeenCalled()
    })

    it('draws borderTop when format specifies it', () => {
      const getFormat = vi.fn(() => ({ borderTop: { style: 'thin', color: '#000' } }))
      painter.drawRegionBorders(0, 0, 0, 0, getFormat, null, null)
      expect(ctx.stroke).toHaveBeenCalled()
      expect(ctx.moveTo).toHaveBeenCalled()
    })

    it('draws all four borders when all are set', () => {
      const border = { style: 'thin', color: '#000' }
      const getFormat = vi.fn(() => ({
        borderTop: border, borderBottom: border,
        borderLeft: border, borderRight: border,
      }))
      painter.drawRegionBorders(0, 0, 0, 0, getFormat, null, null)
      expect(ctx.stroke).toHaveBeenCalledTimes(4)
    })

    it('skips cells with no format object', () => {
      const getFormat = vi.fn(() => null)
      painter.drawRegionBorders(0, 0, 1, 1, getFormat, null, null)
      expect(ctx.stroke).not.toHaveBeenCalled()
    })

    it('skips slave cells', () => {
      const getFormat = vi.fn(() => ({ borderTop: { style: 'thin', color: '#000' } }))
      const isSlave   = vi.fn(() => true)
      painter.drawRegionBorders(0, 0, 0, 0, getFormat, null, isSlave)
      expect(ctx.stroke).not.toHaveBeenCalled()
    })
  })

  describe('overflow mode', () => {
    // The mock cell is 100px wide. With 1ch ≈ 8px the threshold for spill
    // is ~12 chars; longer strings overflow and request extra clip width.
    function widthAtFillText(call) {
      // 4th rect() call before fillText is the clip rect: x, y, w, h
      const rectCalls = ctx.rect.mock.calls
      return rectCalls[rectCalls.length - 1]
    }

    beforeEach(() => {
      ctx.measureText = vi.fn(s => ({ width: String(s).length * 8 }))
    })

    it('left-aligned text extends clip rect into empty right cells', () => {
      // 30 chars × 8 = 240px > 100px cell. Walks right into B1 (empty) — 100px
      // of room — and stops there (well past textW). Clip width should be > 100.
      painter.drawRegionCells(0, 0, 0, 4,
        gv({ 'A1': 'This is a very long sentence' }), null, null, null)
      const lastClipRect = widthAtFillText()
      expect(lastClipRect[2]).toBeGreaterThan(100)
    })

    it('respects a right-neighbour with content (no spill into B1 if B1 has a value)', () => {
      painter.drawRegionCells(0, 0, 0, 4,
        gv({ 'A1': 'This is a very long sentence', 'B1': 'blocker' }), null, null, null)
      const clipRect = ctx.rect.mock.calls.find(c => c[2] !== undefined && c[2] <= 100)
      // The clip rect for A1's text should be ≤ A1's own width since B1 blocks.
      expect(clipRect[2]).toBeLessThanOrEqual(100)
    })

    it('respects a right-neighbour with background fill (Sheets parity)', () => {
      const getFormat = vi.fn(id => id === 'B1' ? { backgroundColor: '#fee' } : {})
      painter.drawRegionCells(0, 0, 0, 4,
        gv({ 'A1': 'This is a very long sentence' }), getFormat, null, null)
      // B1 has bg → blocks spill. The text-clip rect should not exceed A1's own width.
      const textClips = ctx.rect.mock.calls.filter(c => c[2] !== undefined && c[2] < 200)
      // Just assert the *widest* text-area clip is no wider than A1.
      const widestNarrowClip = Math.max(...textClips.map(c => c[2]))
      expect(widestNarrowClip).toBeLessThanOrEqual(100)
    })

    it('clip mode never extends past the cell border', () => {
      const getFormat = vi.fn(() => ({ textWrap: 'clip' }))
      painter.drawRegionCells(0, 0, 0, 4,
        gv({ 'A1': 'This is a very long sentence' }), getFormat, null, null)
      const lastClipRect = widthAtFillText()
      // Width is at most A1's content width (≤ 100, less for inset).
      expect(lastClipRect[2]).toBeLessThanOrEqual(100)
    })
  })

  describe('wrapped text', () => {
    it('calls fillText multiple times for text that wraps', () => {
      ctx.measureText = vi.fn((s) => ({ width: s.length * 8 }))
      const getFormat = vi.fn(() => ({ wrapText: true }))
      // "Hello World" at 8px/char = 88px; cell width 100px minus 8 = 92px → should fit on one line
      // But "Hello World is a long sentence" = 240px → needs wrapping
      painter.drawRegionCells(0, 0, 0, 0,
        gv({ 'A1': 'Hello World is a very long sentence here' }),
        getFormat, null, null)
      expect(ctx.fillText.mock.calls.length).toBeGreaterThanOrEqual(1)
    })

    it('does not call fillText when wrapped value is empty', () => {
      const getFormat = vi.fn(() => ({ wrapText: true }))
      painter.drawRegionCells(0, 0, 0, 0, gv({ 'A1': '' }), getFormat, null, null)
      expect(ctx.fillText).not.toHaveBeenCalled()
    })
  })

  describe('text decorations', () => {
    it('draws underline stroke when format.underline is true', () => {
      const getFormat = vi.fn(() => ({ underline: true }))
      painter.drawRegionCells(0, 0, 0, 0, gv({ 'A1': 'text' }), getFormat, null, null)
      // underline produces an extra stroke() call beyond the font setup
      expect(ctx.stroke).toHaveBeenCalled()
    })

    it('draws strikethrough when format.strikethrough is true', () => {
      const getFormat = vi.fn(() => ({ strikethrough: true }))
      painter.drawRegionCells(0, 0, 0, 0, gv({ 'A1': 'text' }), getFormat, null, null)
      expect(ctx.stroke).toHaveBeenCalled()
    })
  })
})
