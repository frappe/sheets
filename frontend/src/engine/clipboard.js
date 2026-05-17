// Clipboard engine — internal copy/cut/paste + system clipboard TSV interchange.

import { colLabel, parseCellId } from '../utils/cells.js'

export function createClipboard({ sheet, formats }) {
	let _data    = null   // { 'dr,dc': rawValue }
	let _fmts    = null   // { 'dr,dc': formatObj }
	let _mode    = null   // 'copy' | 'cut'
	let _srcSel  = null   // { r0, c0, r1, c1 } of the source

	// ── Capture ───────────────────────────────────────────────────────────────

	function _capture(sel, mode) {
		const { r0, c0, r1, c1 } = sel
		_data = {}; _fmts = {}; _mode = mode; _srcSel = sel
		for (let r = r0; r <= r1; r++) {
			for (let c = c0; c <= c1; c++) {
				const key = `${r - r0},${c - c0}`
				const id  = colLabel(c) + (r + 1)
				_data[key] = sheet.getCell(id)
				_fmts[key] = formats ? { ...formats.get(id, sheet.getCurrentSheet()) } : {}
			}
		}
	}

	// Write TSV to system clipboard (display values, tab-separated)
	function _writeSystem(sel) {
		const { r0, c0, r1, c1 } = sel
		const rows = []
		for (let r = r0; r <= r1; r++) {
			const cells = []
			for (let c = c0; c <= c1; c++)
				cells.push(String(sheet.getDisplayValue(colLabel(c) + (r + 1))).replace(/\t|\n/g, ' '))
			rows.push(cells.join('\t'))
		}
		navigator.clipboard?.writeText(rows.join('\n')).catch(() => {})
	}

	// ── Public ────────────────────────────────────────────────────────────────

	function copy(sel) {
		_capture(sel, 'copy')
		_writeSystem(sel)
	}

	function cut(sel) {
		_capture(sel, 'cut')
		_writeSystem(sel)
	}

	// Paste the internal buffer at anchor cell.
	//   kind = 'all'      → values + formulas + formats (default)
	//        = 'values'   → captured display values only, no formulas or formats
	//        = 'formulas' → raw values/formulas only, leave formats untouched
	//        = 'formats'  → only formats; cell content untouched
	function paste(anchorId, historyPush, kind = 'all') {
		if (!_data) return
		const anch = parseCellId(anchorId)
		if (!anch) return
		const sh = sheet.getCurrentSheet()
		for (const key of Object.keys(_data)) {
			const [dr, dc] = key.split(',').map(Number)
			const id = colLabel(anch.col + dc) + (anch.row + dr + 1)
			const raw = _data[key]
			if (kind === 'all' || kind === 'formulas') {
				sheet.setCell(id, raw)
			} else if (kind === 'values') {
				// Strip formulas — evaluate at the source then store the result.
				const isFormula = typeof raw === 'string' && raw.startsWith('=')
				const v = isFormula ? _displayAt(key) : raw
				sheet.setCell(id, v)
			}
			if (formats && _fmts[key] && (kind === 'all' || kind === 'formats')) {
				formats.set(id, _fmts[key], sh)
			}
		}
		// Only consume the cut buffer when we actually moved content.
		if (_mode === 'cut' && _srcSel && (kind === 'all' || kind === 'values' || kind === 'formulas')) {
			const { r0, c0, r1, c1 } = _srcSel
			for (let r = r0; r <= r1; r++)
				for (let c = c0; c <= c1; c++) {
					const id = colLabel(c) + (r + 1)
					sheet.setCell(id, '')
					if (formats) formats.clear(id, sh)
				}
			_data = _fmts = _mode = _srcSel = null
		}
		// Post-mutate snapshot — history.push() must run after the data has
		// settled so undo restores the correct state.
		historyPush?.()
	}

	// Display value captured at the time the source cell was copied/cut. Falls
	// back to the raw string when the captured value isn't a formula.
	function _displayAt(key) {
		const raw = _data[key]
		if (typeof raw !== 'string' || !raw.startsWith('=')) return raw
		// Use the sheet engine to evaluate against current state. The user may
		// have edited the source after copy — we accept that race for simplicity.
		const [dr, dc] = key.split(',').map(Number)
		if (!_srcSel) return raw
		const srcId = colLabel(_srcSel.c0 + dc) + (_srcSel.r0 + dr + 1)
		return sheet.getDisplayValue(srcId)
	}

	// Paste raw text (from system clipboard / external app).
	function pasteFromText(text, anchorId, historyPush) {
		if (!text?.trim()) return
		const anch = parseCellId(anchorId)
		if (!anch) return
		const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd().split('\n')
		lines.forEach((line, dr) => {
			line.split('\t').forEach((val, dc) => {
				sheet.setCell(colLabel(anch.col + dc) + (anch.row + dr + 1), val)
			})
		})
		historyPush?.()   // post-mutate snapshot
	}

	// Expand selection to fit pasted content (used for visual feedback).
	function hasData() { return !!_data }
	function getMode() { return _mode }
	function getSourceSel() { return _data ? _srcSel : null }
	function clear() { _data = _fmts = _mode = _srcSel = null }

	return { copy, cut, paste, pasteFromText, hasData, getMode, getSourceSel, clear }
}
