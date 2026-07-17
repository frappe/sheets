import { describe, it, expect } from 'vitest'
import {
	editCellOp, editCellsOp, setFormatsOp, setValidationOp, setCommentOp,
	mergeOp, resizeColOp, setFreezeOp, setHiddenRowsOp, engineSliceOp, hydrateOp,
} from './op.js'

// Minimal in-memory engine doubles — enough surface to verify op apply/undo
// round-trips.  No production engines pulled in.
function fakeSheet() {
	const cells = {}
	return {
		setCell(id, v) { cells[id] = v },
		getCell(id)    { return cells[id] ?? '' },
		_cells: cells,
		restore(snap) {
			for (const k of Object.keys(cells)) delete cells[k]
			Object.assign(cells, snap)
		},
		snapshot() { return { ...cells } },
	}
}
function fakeFormats() {
	const m = {}
	return {
		set(id, fmt)  { m[id] = { ...fmt } },
		clear(id)     { delete m[id] },
		get(id)       { return m[id] || null },
		_state: m,
	}
}
function fakeValidation() {
	const m = {}
	return {
		set(id, r) { m[id] = r },
		clear(id)  { delete m[id] },
		get(id)    { return m[id] || null },
	}
}
function fakeComments() {
	const m = {}
	return {
		setThread(id, b) { if (b) m[id] = b; else delete m[id] },
		clear(id)  { delete m[id] },
		get(id)    { return m[id] || null },
	}
}
function fakeMerge() {
	const merges = []
	return {
		merge(r0, c0, r1, c1)   { merges.push({ r0, c0, r1, c1 }) },
		unmerge(r0, c0, r1, c1) {
			const i = merges.findIndex(m => m.r0===r0 && m.c0===c0 && m.r1===r1 && m.c1===c1)
			if (i >= 0) merges.splice(i, 1)
		},
		_merges: merges,
	}
}
function fakeGrid() {
	const colW = {}, rowH = {}
	return {
		setColWidth(c, w)  { colW[c] = w },
		setRowHeight(r, h) { rowH[r] = h },
		_colW: colW, _rowH: rowH,
	}
}
function fakeView() {
	const state = { freeze: { rows: 0, cols: 0 }, hiddenRows: new Set(), hiddenCols: new Set() }
	return {
		setFreeze(r, c)   { state.freeze = { rows: r, cols: c } },
		setHiddenRows(s)  { state.hiddenRows = new Set(s) },
		setHiddenCols(s)  { state.hiddenCols = new Set(s) },
		restore(snap) {
			if (snap.freeze)     state.freeze     = snap.freeze
			if (snap.hiddenRows) state.hiddenRows = new Set(snap.hiddenRows)
			if (snap.hiddenCols) state.hiddenCols = new Set(snap.hiddenCols)
		},
		_state: state,
	}
}

function makeCtx() {
	return {
		sheet:      fakeSheet(),
		formats:    fakeFormats(),
		validation: fakeValidation(),
		comments:   fakeComments(),
		merge:      fakeMerge(),
		grid:       fakeGrid(),
		view:       fakeView(),
	}
}

describe('editCellOp', () => {
	it('do/undo round-trips', () => {
		const ctx = makeCtx()
		ctx.sheet.setCell('A1', 'old')
		const op = editCellOp({ sheet: 'Sheet1', id: 'A1', before: 'old', after: 'new' })
		op.do(ctx);   expect(ctx.sheet.getCell('A1')).toBe('new')
		op.undo(ctx); expect(ctx.sheet.getCell('A1')).toBe('old')
	})

	it('coalesces same-cell consecutive edits', () => {
		const a = editCellOp({ sheet: 'S', id: 'A1', before: '',  after: 'h' })
		const b = editCellOp({ sheet: 'S', id: 'A1', before: 'h', after: 'he' })
		const merged = b.coalesce(a)
		expect(merged).toBeTruthy()
		expect(merged.serialize()).toEqual({ type: 'edit-cell', sheet: 'S', id: 'A1', before: '', after: 'he' })
	})

	it('refuses to coalesce across cells', () => {
		const a = editCellOp({ sheet: 'S', id: 'A1', before: '', after: 'x' })
		const b = editCellOp({ sheet: 'S', id: 'A2', before: '', after: 'y' })
		expect(b.coalesce(a)).toBeNull()
	})

	it('serializes to JSON', () => {
		const op = editCellOp({ sheet: 'S1', id: 'B2', before: 1, after: 2 })
		expect(op.serialize()).toEqual({ type: 'edit-cell', sheet: 'S1', id: 'B2', before: 1, after: 2 })
	})

	it('exposes touched cells for cell-history derivation', () => {
		const op = editCellOp({ sheet: 'S1', id: 'B2', before: 1, after: 2 })
		expect(op.cells).toEqual([{ sheet: 'S1', id: 'B2' }])
	})
})

describe('editCellsOp', () => {
	it('applies + reverts a batch', () => {
		const ctx = makeCtx()
		ctx.sheet.setCell('A1', 'a')
		ctx.sheet.setCell('A2', 'b')
		const op = editCellsOp({ sheet: 'Sheet1', edits: [
			{ id: 'A1', before: 'a', after: 'x' },
			{ id: 'A2', before: 'b', after: 'y' },
		] })
		op.do(ctx)
		expect(ctx.sheet.getCell('A1')).toBe('x')
		expect(ctx.sheet.getCell('A2')).toBe('y')
		op.undo(ctx)
		expect(ctx.sheet.getCell('A1')).toBe('a')
		expect(ctx.sheet.getCell('A2')).toBe('b')
	})
})

describe('setFormatsOp', () => {
	it('clears formats on undo when before is empty', () => {
		const ctx = makeCtx()
		const op = setFormatsOp({ sheet: 'S', changes: [
			{ id: 'A1', before: null, after: { bold: true } },
		] })
		op.do(ctx);   expect(ctx.formats.get('A1')).toEqual({ bold: true })
		op.undo(ctx); expect(ctx.formats.get('A1')).toBeNull()
	})

	it('restores prior format on undo', () => {
		const ctx = makeCtx()
		ctx.formats.set('A1', { italic: true })
		const op = setFormatsOp({ sheet: 'S', changes: [
			{ id: 'A1', before: { italic: true }, after: { bold: true } },
		] })
		op.do(ctx);   expect(ctx.formats.get('A1')).toEqual({ bold: true })
		op.undo(ctx); expect(ctx.formats.get('A1')).toEqual({ italic: true })
	})
})

describe('setValidationOp', () => {
	it('do/undo applies and reverts a rule', () => {
		const ctx = makeCtx()
		const rule = { type: 'list', values: ['a','b'] }
		const op = setValidationOp({ sheet: 'S', id: 'B2', before: null, after: rule })
		op.do(ctx);   expect(ctx.validation.get('B2')).toEqual(rule)
		op.undo(ctx); expect(ctx.validation.get('B2')).toBeNull()
	})
})

describe('setCommentOp', () => {
	it('do/undo applies and reverts a comment', () => {
		const ctx = makeCtx()
		const op = setCommentOp({ sheet: 'S', id: 'C3', before: null, after: 'hello' })
		op.do(ctx);   expect(ctx.comments.get('C3')).toBe('hello')
		op.undo(ctx); expect(ctx.comments.get('C3')).toBeNull()
	})
})

describe('mergeOp', () => {
	it('records the merge and restores slave values on undo', () => {
		const ctx = makeCtx()
		ctx.sheet.setCell('A1', 'A1v')
		ctx.sheet.setCell('A2', 'A2v')
		const op = mergeOp({
			sheet: 'S',
			range: { r0: 0, c0: 0, r1: 1, c1: 0 },
			prevMasterValues: { A1: 'A1v', A2: 'A2v' },
		})
		op.do(ctx)
		expect(ctx.merge._merges.length).toBe(1)
		op.undo(ctx)
		expect(ctx.merge._merges.length).toBe(0)
		expect(ctx.sheet.getCell('A2')).toBe('A2v')
	})
})

describe('resizeColOp', () => {
	it('do/undo applies and reverts the width', () => {
		const ctx = makeCtx()
		const op = resizeColOp({ col: 3, before: 100, after: 250 })
		op.do(ctx);   expect(ctx.grid._colW[3]).toBe(250)
		op.undo(ctx); expect(ctx.grid._colW[3]).toBe(100)
	})
})

describe('setFreezeOp', () => {
	it('do/undo applies and reverts freeze state', () => {
		const ctx = makeCtx()
		const op = setFreezeOp({ before: { rows: 0, cols: 0 }, after: { rows: 1, cols: 2 } })
		op.do(ctx);   expect(ctx.view._state.freeze).toEqual({ rows: 1, cols: 2 })
		op.undo(ctx); expect(ctx.view._state.freeze).toEqual({ rows: 0, cols: 0 })
	})
})

describe('setHiddenRowsOp', () => {
	it('do/undo applies and reverts the hidden-rows set', () => {
		const ctx = makeCtx()
		const op = setHiddenRowsOp({ before: [], after: [3, 4, 5] })
		op.do(ctx)
		expect([...ctx.view._state.hiddenRows].sort()).toEqual([3, 4, 5])
		op.undo(ctx)
		expect([...ctx.view._state.hiddenRows]).toEqual([])
	})
})

describe('engineSliceOp', () => {
	it('round-trips a coarse slice (e.g. sort)', () => {
		const ctx = makeCtx()
		ctx.sheet.setCell('A1', 1); ctx.sheet.setCell('A2', 2)
		const beforeSnap = ctx.sheet.snapshot()
		ctx.sheet.setCell('A1', 2); ctx.sheet.setCell('A2', 1)
		const afterSnap = ctx.sheet.snapshot()
		const op = engineSliceOp({ type: 'sort', sheet: 'S',
			before: { sheet: beforeSnap }, after: { sheet: afterSnap },
		})
		op.undo(ctx)
		expect(ctx.sheet.getCell('A1')).toBe(1)
		op.do(ctx)
		expect(ctx.sheet.getCell('A1')).toBe(2)
	})
})

describe('hydrateOp', () => {
	it('reconstructs an editCellOp from JSON', () => {
		const op = editCellOp({ sheet: 'S', id: 'A1', before: 1, after: 2 })
		const rebuilt = hydrateOp(op.serialize())
		const ctx = makeCtx()
		ctx.sheet.setCell('A1', 1)
		rebuilt.do(ctx);   expect(ctx.sheet.getCell('A1')).toBe(2)
		rebuilt.undo(ctx); expect(ctx.sheet.getCell('A1')).toBe(1)
	})

	it('falls back to engineSliceOp for unknown coarse types', () => {
		const json = { type: 'custom-coarse', sheet: 'S',
			before: { sheet: { A1: 'x' } }, after: { sheet: { A1: 'y' } } }
		const op = hydrateOp(json)
		expect(op.type).toBe('custom-coarse')
	})
})
