// Operation/Command layer for history.
//
// Each mutation in the editor is wrapped as an Operation object with:
//   - type:        a stable string identifier (used for coalescing + serialise)
//   - do(ctx):     applies the change to the document
//   - undo(ctx):   reverses the change
//   - serialize(): plain-JSON representation for persistence
//   - cells?:      array of '{sheet, id}' touched by the op — drives cell
//                  edit history derivation in Phase 4
//   - coalesce?:   (prev) → mergedOp | null — for typing-in-one-cell debounce
//
// `ctx` is the editor's engine bag: { sheet, formats, merge, sortFilter,
//                                     comments, validation, condFormat, grid,
//                                     view: { setFreeze, setHidden, ... } }
//
// Ops are constructed *after* the mutation has happened in the host — the
// host hands us the before/after slice and the op holds onto it.  This keeps
// the host code straight-line: mutate, push(op), done.

import { parseCellId } from '../utils/cells.js'

// ── Cell value ops ────────────────────────────────────────────────────────────

// Single-cell edit.  Coalesces with a prior edit on the same (sheet, id) when
// the previous op is still within the typing burst window (caller decides).
export function editCellOp({ sheet, id, before, after }) {
	return {
		type:   'edit-cell',
		sheet,  id, before, after,
		cells:  [{ sheet, id }],
		do(ctx)   { ctx.sheet.setCell(id, after,  sheet) },
		undo(ctx) { ctx.sheet.setCell(id, before, sheet) },
		serialize() { return { type: 'edit-cell', sheet, id, before, after } },
		coalesce(prev) {
			if (!prev || prev.type !== 'edit-cell') return null
			if (prev.sheet !== sheet || prev.id !== id) return null
			return editCellOp({ sheet, id, before: prev.before, after })
		},
	}
}

// Batch cell edit (paste, fill, format painter values, sort).  Holds an array
// of { id, before, after } — does not coalesce.
export function editCellsOp({ sheet, edits }) {
	return {
		type:   'edit-cells',
		sheet,
		cells:  edits.map(e => ({ sheet, id: e.id })),
		do(ctx)   { for (const { id, after  } of edits) ctx.sheet.setCell(id, after,  sheet) },
		undo(ctx) { for (const { id, before } of edits) ctx.sheet.setCell(id, before, sheet) },
		serialize() { return { type: 'edit-cells', sheet, edits } },
	}
}

// ── Format ops ────────────────────────────────────────────────────────────────

export function setFormatsOp({ sheet, changes }) {
	// changes: [{ id, before: fmtObj|null, after: fmtObj|null }]
	return {
		type:   'set-formats',
		sheet,
		cells:  changes.map(c => ({ sheet, id: c.id })),
		do(ctx)   { for (const { id, after  } of changes) _applyFmt(ctx, sheet, id, after) },
		undo(ctx) { for (const { id, before } of changes) _applyFmt(ctx, sheet, id, before) },
		serialize() { return { type: 'set-formats', sheet, changes } },
	}
}

function _applyFmt(ctx, sheet, id, fmt) {
	if (fmt && Object.keys(fmt).length) ctx.formats.set(id, fmt, sheet)
	else                                ctx.formats.clear(id, sheet)
}

// ── Validation / comments ─────────────────────────────────────────────────────

export function setValidationOp({ sheet, id, before, after }) {
	return {
		type: 'set-validation',
		sheet, id,
		cells: [{ sheet, id }],
		do(ctx)   { _applyVal(ctx, sheet, id, after) },
		undo(ctx) { _applyVal(ctx, sheet, id, before) },
		serialize() { return { type: 'set-validation', sheet, id, before, after } },
	}
}

function _applyVal(ctx, sheet, id, rule) {
	if (rule) ctx.validation.set(id, rule, sheet)
	else      ctx.validation.clear(id, sheet)
}

export function setCommentOp({ sheet, id, before, after }) {
	return {
		type: 'set-comment',
		sheet, id,
		cells: [{ sheet, id }],
		do(ctx)   { _applyComment(ctx, sheet, id, after) },
		undo(ctx) { _applyComment(ctx, sheet, id, before) },
		serialize() { return { type: 'set-comment', sheet, id, before, after } },
	}
}

function _applyComment(ctx, sheet, id, body) {
	// `body` is a whole thread object (or null). setThread replaces the cell's
	// thread wholesale — matches how before/after are captured for undo.
	ctx.comments.setThread(id, body, sheet)
}

// ── Structure ops (merge, resize, freeze, hide) ───────────────────────────────

export function mergeOp({ sheet, range, prevMasterValues }) {
	// prevMasterValues: { id: value } captured before merge clobbered slaves
	return {
		type: 'merge',
		sheet, range,
		cells: _rangeCells(sheet, range),
		do(ctx)   { ctx.merge.merge(range.r0, range.c0, range.r1, range.c1) },
		undo(ctx) {
			ctx.merge.unmerge(range.r0, range.c0, range.r1, range.c1)
			for (const [id, v] of Object.entries(prevMasterValues || {}))
				ctx.sheet.setCell(id, v, sheet)
		},
		serialize() { return { type: 'merge', sheet, range, prevMasterValues } },
	}
}

export function unmergeOp({ sheet, range }) {
	return {
		type: 'unmerge',
		sheet, range,
		cells: _rangeCells(sheet, range),
		do(ctx)   { ctx.merge.unmerge(range.r0, range.c0, range.r1, range.c1) },
		undo(ctx) { ctx.merge.merge(range.r0, range.c0, range.r1, range.c1) },
		serialize() { return { type: 'unmerge', sheet, range } },
	}
}

export function resizeColOp({ col, before, after }) {
	return {
		type: 'resize-col',
		col,
		do(ctx)   { ctx.grid.setColWidth(col, after) },
		undo(ctx) { ctx.grid.setColWidth(col, before) },
		serialize() { return { type: 'resize-col', col, before, after } },
	}
}

export function resizeRowOp({ row, before, after }) {
	return {
		type: 'resize-row',
		row,
		do(ctx)   { ctx.grid.setRowHeight(row, after) },
		undo(ctx) { ctx.grid.setRowHeight(row, before) },
		serialize() { return { type: 'resize-row', row, before, after } },
	}
}

export function setFreezeOp({ before, after }) {
	// before/after: { rows, cols }
	return {
		type: 'set-freeze',
		do(ctx)   { ctx.view.setFreeze(after.rows,  after.cols) },
		undo(ctx) { ctx.view.setFreeze(before.rows, before.cols) },
		serialize() { return { type: 'set-freeze', before, after } },
	}
}

export function setHiddenRowsOp({ before, after }) {
	return {
		type: 'set-hidden-rows',
		do(ctx)   { ctx.view.setHiddenRows(new Set(after)) },
		undo(ctx) { ctx.view.setHiddenRows(new Set(before)) },
		serialize() { return { type: 'set-hidden-rows', before, after } },
	}
}

export function setHiddenColsOp({ before, after }) {
	return {
		type: 'set-hidden-cols',
		do(ctx)   { ctx.view.setHiddenCols(new Set(after)) },
		undo(ctx) { ctx.view.setHiddenCols(new Set(before)) },
		serialize() { return { type: 'set-hidden-cols', before, after } },
	}
}

// ── Coarse "engine-slice" ops ─────────────────────────────────────────────────
// Sort, insert/delete row/col, filter changes, sheet ops all touch a lot of
// state in interrelated engines (sheet data + formats + merge + validation +
// CF rules + filter range adjustment).  We snapshot the affected engine
// before+after rather than try to construct per-cell diffs — same memory
// behaviour as a targeted slice snapshot but with the op-stream API.

export function engineSliceOp({ type, sheet, before, after, cells = null }) {
	// before/after: { sheet?, formats?, merge?, sortFilter?, validation?,
	//                 comments?, condFormat?, view? } — only the slices the op
	// actually touched.  Other slices are absent.
	return {
		type,
		sheet,
		cells: cells || [],
		do(ctx)   { _restoreSlices(ctx, after) },
		undo(ctx) { _restoreSlices(ctx, before) },
		serialize() { return { type, sheet, before, after, cells } },
	}
}

function _restoreSlices(ctx, slices) {
	if (slices.sheet)      ctx.sheet.restore(slices.sheet)
	if (slices.formats)    ctx.formats.restore(slices.formats)
	if (slices.merge)      ctx.merge.restore(slices.merge)
	if (slices.sortFilter) ctx.sortFilter.restore(slices.sortFilter)
	if (slices.validation) ctx.validation.restore(slices.validation)
	if (slices.comments)   ctx.comments.restore(slices.comments)
	if (slices.condFormat) ctx.condFormat.restore(slices.condFormat)
	if (slices.view)       ctx.view.restore(slices.view)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _rangeCells(sheet, { r0, c0, r1, c1 }) {
	const out = []
	for (let r = r0; r <= r1; r++)
		for (let c = c0; c <= c1; c++)
			out.push({ sheet, r, c })
	return out
}

// Replay a serialised op (loaded from persistence) against a fresh runtime.
// Walks the type→factory registry and re-hydrates the closure.
const _REGISTRY = {
	'edit-cell':       editCellOp,
	'edit-cells':      editCellsOp,
	'set-formats':     setFormatsOp,
	'set-validation':  setValidationOp,
	'set-comment':     setCommentOp,
	'merge':           mergeOp,
	'unmerge':         unmergeOp,
	'resize-col':      resizeColOp,
	'resize-row':      resizeRowOp,
	'set-freeze':      setFreezeOp,
	'set-hidden-rows': setHiddenRowsOp,
	'set-hidden-cols': setHiddenColsOp,
}

export function hydrateOp(json) {
	const fac = _REGISTRY[json.type]
	if (fac) return fac(json)
	// engineSliceOp covers all coarse slice types — fall through.
	return engineSliceOp(json)
}

export { parseCellId }
