// Sheet state engine — owns raw cell data, formula evaluation, and dep cascades.
// The canvas grid stores display strings; this engine stores raw values.
//
// Integration contract:
//   onCellChanged(cellId, displayValue, sheetName) — called after any mutation,
//   so the consumer (SheetEditor.vue) can push display strings to the canvas.

import { evaluate } from './formula.js'
import { createDepsEngine } from './deps.js'
import { parseCellId, colLabel } from '../utils/cells.js'

export function createSheet({ onCellChanged } = {}) {
	const sheets   = { Sheet1: {} }
	const deps     = createDepsEngine()
	let   current  = 'Sheet1'
	const circular = new Set()

	// ── Formula evaluation ────────────────────────────────────────────────────

	function getCellValue(id, sheet = current) {
		const raw = sheets[sheet]?.[id]
		if (raw === undefined || raw === null || raw === '') return 0
		if (typeof raw === 'string' && raw.startsWith('='))
			return _evalFormula(raw.slice(1), sheet)
		const n = parseFloat(raw)
		return isNaN(n) ? raw : n
	}

	function getRangeValues(startId, endId, sheet = current) {
		const s = parseCellId(startId), e = parseCellId(endId)
		if (!s || !e) return []
		const rows = []
		for (let r = Math.min(s.row, e.row); r <= Math.max(s.row, e.row); r++) {
			const row = []
			for (let c = Math.min(s.col, e.col); c <= Math.max(s.col, e.col); c++)
				row.push(getCellValue(colLabel(c) + (r + 1), sheet))
			rows.push(row)
		}
		return rows
	}

	function _evalFormula(formula, sheet = current) {
		const key = `${sheet}::${formula}`
		if (circular.has(key)) return '#CIRCULAR!'
		circular.add(key)
		try {
			return evaluate(
				formula,
				id         => getCellValue(id, sheet),
				(s, e)     => getRangeValues(s, e, sheet),
				(sh, id)   => getCellValue(id, sh),
				(sh, s, e) => getRangeValues(s, e, sh),
			)
		} catch (_) {
			// Partial / malformed formulas (e.g. `=VLOOKUP(` mid-typing, which
			// can briefly hit the engine via a stray commit) must not throw —
			// the surrounding UI catches the result and any unhandled exception
			// here would crash whatever called setCell. Return a soft error.
			return '#ERROR!'
		} finally {
			circular.delete(key)
		}
	}

	function getDisplayValue(id, sheet = current) {
		const raw = sheets[sheet]?.[id] ?? ''
		if (typeof raw === 'string' && raw.startsWith('=')) {
			const result = _evalFormula(raw.slice(1), sheet)
			return result === null || result === undefined ? '' : String(result)
		}
		return raw === null || raw === undefined ? '' : String(raw)
	}

	// ── Mutation ──────────────────────────────────────────────────────────────

	function setCell(id, value, sheet = current) {
		if (!sheets[sheet]) sheets[sheet] = {}
		if (value === '' || value == null) delete sheets[sheet][id]
		else sheets[sheet][id] = value

		deps.register(id, value, sheet)
		_notify(id, sheet)
		for (const dep of deps.getDependents(id, sheet)) _notify(dep, sheet)
	}

	function _notify(id, sheet = current) {
		if (sheet !== current) return
		onCellChanged?.(id, getDisplayValue(id, sheet), sheet)
	}

	// ── Row / column insertion & deletion ────────────────────────────────────

	function _shiftCells(sheet, pred, newIdFn) {
		const sh = sheets[sheet]
		if (!sh) return
		const entries = Object.entries(sh)
			.map(([id, v]) => ({ id, p: parseCellId(id), v }))
			.filter(({ p }) => p && pred(p))
		entries.sort((a, b) => a.p.row !== b.p.row ? b.p.row - a.p.row : b.p.col - a.p.col)
		for (const { id, p, v } of entries) {
			delete sh[id]
			const nid = newIdFn(p)
			if (nid) sh[nid] = v
		}
		deps.rebuild(sh, sheet)
	}

	function insertRow(atRow) {
		_shiftCells(current, p => p.row >= atRow, p => colLabel(p.col) + (p.row + 2))
	}

	function deleteRow(atRow) {
		const sh = sheets[current]
		if (!sh) return
		for (const id of Object.keys(sh)) {
			const p = parseCellId(id)
			if (p && p.row === atRow) delete sh[id]
		}
		_shiftCells(current, p => p.row > atRow, p => colLabel(p.col) + p.row)
	}

	function insertCol(atCol) {
		const sh = sheets[current]
		if (!sh) return
		const entries = Object.entries(sh)
			.map(([id, v]) => ({ id, p: parseCellId(id), v }))
			.filter(({ p }) => p && p.col >= atCol)
		entries.sort((a, b) => b.p.col - a.p.col)
		for (const { id, p, v } of entries) {
			delete sh[id]
			sh[colLabel(p.col + 1) + (p.row + 1)] = v
		}
		deps.rebuild(sh, current)
	}

	function deleteCol(atCol) {
		const sh = sheets[current]
		if (!sh) return
		for (const id of Object.keys(sh)) {
			const p = parseCellId(id)
			if (p && p.col === atCol) delete sh[id]
		}
		const entries = Object.entries(sh)
			.map(([id, v]) => ({ id, p: parseCellId(id), v }))
			.filter(({ p }) => p && p.col > atCol)
		entries.sort((a, b) => a.p.col - b.p.col)
		for (const { id, p, v } of entries) {
			delete sh[id]
			sh[colLabel(p.col - 1) + (p.row + 1)] = v
		}
		deps.rebuild(sh, current)
	}

	// ── Sheet management ──────────────────────────────────────────────────────

	function switchSheet(name) {
		if (!sheets[name]) { sheets[name] = {}; deps.rebuild({}, name) }
		current = name
		// Notify all cells so the canvas is fully redrawn for the new sheet
		for (const id of Object.keys(sheets[current]))
			onCellChanged?.(id, getDisplayValue(id, current), current)
	}

	function addSheet(name) {
		if (sheets[name]) return
		sheets[name] = {}
		deps.rebuild({}, name)
	}

	function renameSheet(oldName, newName) {
		if (!sheets[oldName] || sheets[newName] || oldName === newName) return false
		sheets[newName] = sheets[oldName]
		delete sheets[oldName]
		deps.rebuild(sheets[newName], newName)
		if (current === oldName) current = newName
		return true
	}

	function duplicateSheet(srcName, newName) {
		if (!sheets[srcName] || sheets[newName]) return false
		sheets[newName] = JSON.parse(JSON.stringify(sheets[srcName]))
		deps.rebuild(sheets[newName], newName)
		return true
	}

	function reorderSheets(orderedNames) {
		// Rebuild the internal sheets dict in the requested order. Drops names
		// that don't exist; missing names get appended at the end.
		const next = {}
		for (const name of orderedNames) if (sheets[name]) next[name] = sheets[name]
		for (const name of Object.keys(sheets)) if (!next[name]) next[name] = sheets[name]
		for (const k of Object.keys(sheets)) delete sheets[k]
		for (const [k, v] of Object.entries(next)) sheets[k] = v
		return true
	}

	function deleteSheet(name) {
		if (!sheets[name]) return false
		const names = Object.keys(sheets)
		if (names.length <= 1) return false   // Always keep at least one sheet
		delete sheets[name]
		if (current === name) current = Object.keys(sheets)[0]
		// Notify caller for re-render
		for (const id of Object.keys(sheets[current] || {}))
			onCellChanged?.(id, getDisplayValue(id, current), current)
		return true
	}

	// ── Accessors ─────────────────────────────────────────────────────────────

	function getCell(id, sheet = current)   { return sheets[sheet]?.[id] ?? '' }
	function getCurrentSheet()              { return current }
	function getSheetNames()                { return Object.keys(sheets) }
	function getRawData(sheet = current)    { return sheets[sheet] || {} }

	// ── Snapshot / restore (for history) ─────────────────────────────────────

	function snapshot() {
		return {
			sheets:  JSON.parse(JSON.stringify(sheets)),
			current,
		}
	}

	function restore(snap) {
		for (const key of Object.keys(sheets)) delete sheets[key]
		for (const [name, data] of Object.entries(snap.sheets)) {
			sheets[name] = data
			deps.rebuild(data, name)
		}
		current = snap.current
		for (const id of Object.keys(sheets[current] || {}))
			onCellChanged?.(id, getDisplayValue(id, current), current)
	}

	// Initialise dep graph for the default sheet
	deps.rebuild({}, 'Sheet1')

	return {
		setCell, getCell, getDisplayValue, getCellValue, getRangeValues,
		switchSheet, addSheet, renameSheet, duplicateSheet, deleteSheet, reorderSheets,
		getSheetNames, getCurrentSheet, getRawData,
		insertRow, deleteRow, insertCol, deleteCol,
		snapshot, restore,
	}
}
