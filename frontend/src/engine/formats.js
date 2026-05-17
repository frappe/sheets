// Cell format store — bold, italic, underline, color, backgroundColor, align, wrapText, numberFormat.
// Pure state, zero DOM dependency.

import { parseCellId, colLabel } from '../utils/cells.js'

export function createFormatsEngine() {
	// { sheetName: { cellId: { bold, italic, underline, color, backgroundColor, align } } }
	const store = {}

	function ensure(sheet) {
		if (!store[sheet]) store[sheet] = {}
	}

	function get(id, sheet = 'Sheet1') {
		return store[sheet]?.[id] || {}
	}

	function set(id, format, sheet = 'Sheet1') {
		ensure(sheet)
		store[sheet][id] = { ...get(id, sheet), ...format }
	}

	// Toggle a boolean format key (bold, italic, underline).
	function toggle(id, key, sheet = 'Sheet1') {
		set(id, { [key]: !get(id, sheet)[key] }, sheet)
	}

	function clear(id, sheet = 'Sheet1') {
		if (store[sheet]) delete store[sheet][id]
	}

	// Apply a format to many cell IDs at once.
	function applyToRange(ids, format, sheet = 'Sheet1') {
		for (const id of ids) set(id, format, sheet)
	}

	function toggleRange(ids, key, sheet = 'Sheet1') {
		// Toggle on if ANY cell in range lacks the property; toggle off only if ALL have it.
		const allOn = ids.every(id => !!get(id, sheet)[key])
		applyToRange(ids, { [key]: !allOn }, sheet)
	}

	// ── Row / column structural shifts ────────────────────────────────────────

	function _shiftFmts(sheet, pred, newIdFn, descending) {
		ensure(sheet)
		const st = store[sheet]
		const entries = Object.entries(st)
			.map(([id, fmt]) => ({ id, p: parseCellId(id), fmt }))
			.filter(({ p }) => p && pred(p))
		entries.sort((a, b) => descending ? b.p.row - a.p.row || b.p.col - a.p.col
		                                  : a.p.row - b.p.row || a.p.col - b.p.col)
		for (const { id, p, fmt } of entries) {
			delete st[id]
			const nid = newIdFn(p)
			if (nid) st[nid] = fmt
		}
	}

	function insertRow(atRow, sheet = 'Sheet1') {
		_shiftFmts(sheet, p => p.row >= atRow, p => colLabel(p.col) + (p.row + 2), true)
	}

	function deleteRow(atRow, sheet = 'Sheet1') {
		ensure(sheet)
		for (const id of Object.keys(store[sheet] || {})) {
			const p = parseCellId(id)
			if (p && p.row === atRow) delete store[sheet][id]
		}
		_shiftFmts(sheet, p => p.row > atRow, p => colLabel(p.col) + p.row, false)
	}

	function insertCol(atCol, sheet = 'Sheet1') {
		ensure(sheet)
		const st = store[sheet]
		const entries = Object.entries(st)
			.map(([id, fmt]) => ({ id, p: parseCellId(id), fmt }))
			.filter(({ p }) => p && p.col >= atCol)
		entries.sort((a, b) => b.p.col - a.p.col)
		for (const { id, p, fmt } of entries) {
			delete st[id]
			st[colLabel(p.col + 1) + (p.row + 1)] = fmt
		}
	}

	function deleteCol(atCol, sheet = 'Sheet1') {
		ensure(sheet)
		const st = store[sheet]
		for (const id of Object.keys(st)) {
			const p = parseCellId(id)
			if (p && p.col === atCol) delete st[id]
		}
		const entries = Object.entries(st)
			.map(([id, fmt]) => ({ id, p: parseCellId(id), fmt }))
			.filter(({ p }) => p && p.col > atCol)
		entries.sort((a, b) => a.p.col - b.p.col)
		for (const { id, p, fmt } of entries) {
			delete st[id]
			st[colLabel(p.col - 1) + (p.row + 1)] = fmt
		}
	}

	// Snapshot / restore for history integration.
	function snapshot() {
		return JSON.parse(JSON.stringify(store))
	}

	function restore(snap) {
		for (const k of Object.keys(store)) delete store[k]
		for (const [k, v] of Object.entries(snap)) store[k] = v
	}

	// ── Sheet-level operations (rename / duplicate / delete) ──────────────────

	function renameSheet(oldName, newName) {
		if (!store[oldName] || store[newName] || oldName === newName) return
		store[newName] = store[oldName]
		delete store[oldName]
	}

	function duplicateSheet(srcName, newName) {
		if (store[newName]) return
		store[newName] = JSON.parse(JSON.stringify(store[srcName] || {}))
	}

	function deleteSheet(name) {
		delete store[name]
	}

	function reorderSheets(orderedNames) {
		const next = {}
		for (const name of orderedNames) if (store[name]) next[name] = store[name]
		for (const name of Object.keys(store)) if (!next[name]) next[name] = store[name]
		for (const k of Object.keys(store)) delete store[k]
		for (const [k, v] of Object.entries(next)) store[k] = v
	}

	return {
		get, set, toggle, clear, applyToRange, toggleRange,
		insertRow, deleteRow, insertCol, deleteCol,
		renameSheet, duplicateSheet, deleteSheet, reorderSheets,
		snapshot, restore,
	}
}
