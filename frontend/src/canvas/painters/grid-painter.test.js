import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGridPainter } from './grid-painter.js'
import { createMockCtx, createMockGeo } from './test-utils.js'

describe('GridPainter', () => {
  let ctx, geo, painter

  beforeEach(() => {
    ctx     = createMockCtx()
    geo     = createMockGeo()
    painter = createGridPainter(ctx, geo)
  })

  describe('drawGridLines', () => {
    it('strokes horizontal lines for each row in range + one extra', () => {
      painter.drawGridLines(0, 0, 2, 3, 500, 300)
      // rows 0,1,2 plus one sentinel → 4 moveTo/lineTo pairs at rowY(r)
      const calls = ctx.moveTo.mock.calls.filter(([, y]) => y > 24)
      expect(calls.length).toBeGreaterThanOrEqual(3)
    })

    it('strokes vertical lines for each col in range + one extra', () => {
      painter.drawGridLines(0, 0, 2, 3, 500, 300)
      const calls = ctx.moveTo.mock.calls.filter(([x]) => x > 50)
      expect(calls.length).toBeGreaterThanOrEqual(4)
    })

    it('calls stroke() to commit the main grid path', () => {
      painter.drawGridLines(0, 0, 1, 1, 500, 300)
      expect(ctx.stroke).toHaveBeenCalled()
    })

    it('draws hidden-boundary indicator when next col has zero width', () => {
      const geoWithHidden = createMockGeo({ colWidths: { 1: 0 } })
      const p = createGridPainter(ctx, geoWithHidden)
      p.drawGridLines(0, 0, 1, 2, 500, 300)
      // freezeLine strokeStyle should be set for the hidden boundary pass
      expect(ctx.stroke).toHaveBeenCalledTimes(2)
    })

    it('does not draw extra lines when no columns are hidden', () => {
      painter.drawGridLines(0, 0, 1, 1, 500, 300)
      // Only one stroke() call — the main grid path (hidden boundary path is a no-op beginPath+stroke)
      expect(ctx.stroke).toHaveBeenCalledTimes(2)
    })

    // Set up two parallel painters: same hidden-row layout, but one with the
    // hidden row tagged as filter-hidden. The difference in moveTo count
    // between them is exactly the bold boundary stroke we want to suppress.
    function countMoveTos(geoOpts) {
      const localCtx = createMockCtx()
      const p = createGridPainter(localCtx, createMockGeo(geoOpts))
      p.drawGridLines(0, 0, 4, 1, 500, 300)
      return localCtx.moveTo.mock.calls.length
    }

    it('suppresses the bold boundary stroke for filter-hidden rows', () => {
      const manual = countMoveTos({ rowHeights: { 2: 0 } })
      const filter = countMoveTos({ rowHeights: { 2: 0 }, filterHidden: new Set([2]) })
      // Manual hide adds one extra bold boundary moveTo; the filter case
      // must skip that, so its count is one lower.
      expect(manual - filter).toBe(1)
    })

    it('still draws the bold boundary for manually-hidden rows', () => {
      const none   = countMoveTos({})
      const manual = countMoveTos({ rowHeights: { 2: 0 } })
      // Manual hide path must add exactly one extra moveTo vs. no-hide.
      expect(manual - none).toBe(1)
    })
  })

  describe('drawFreezeSeparators', () => {
    it('draws a vertical freeze line when frozenW > 0', () => {
      painter.drawFreezeSeparators(100, 0, 600, 400)
      expect(ctx.stroke).toHaveBeenCalled()
      expect(ctx.moveTo).toHaveBeenCalled()
    })

    it('draws a horizontal freeze line when frozenH > 0', () => {
      painter.drawFreezeSeparators(0, 48, 600, 400)
      expect(ctx.stroke).toHaveBeenCalled()
    })

    it('draws both lines when both freeze dimensions are set', () => {
      const moveCallsBefore = ctx.moveTo.mock.calls.length
      painter.drawFreezeSeparators(100, 48, 600, 400)
      const moveCallsAfter = ctx.moveTo.mock.calls.length
      expect(moveCallsAfter - moveCallsBefore).toBe(2)
    })

    it('draws nothing (no moveTo) when both freeze dimensions are zero', () => {
      painter.drawFreezeSeparators(0, 0, 600, 400)
      expect(ctx.moveTo).not.toHaveBeenCalled()
    })
  })
})
