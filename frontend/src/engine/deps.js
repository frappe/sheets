// Dependency engine — tracks which cells depend on which other cells.
// Used to cascade re-evaluation when a source cell changes.

import { tokenize } from './formula.js'
import { parseCellId, colLabel } from '../utils/cells.js'

export function createDepsEngine() {
	const depMap     = {} // { sheet: { cellId: Set<ref> } }   — cells this cell reads
	const reverseDep = {} // { sheet: { cellId: Set<cellId> } } — cells that read this cell

	function ensure(sheet) {
		if (!depMap[sheet])     depMap[sheet]     = {}
		if (!reverseDep[sheet]) reverseDep[sheet] = {}
	}

	function extractRefs(formula) {
		const refs = new Set()
		try {
			const tokens = tokenize(formula)
			for (let i = 0; i < tokens.length; i++) {
				if (tokens[i].t === 'REF') {
					if (tokens[i+1]?.t === 'COLON' && tokens[i+2]?.t === 'REF') {
						const s = parseCellId(tokens[i].v), e = parseCellId(tokens[i+2].v)
						if (s && e)
							for (let r = Math.min(s.row, e.row); r <= Math.max(s.row, e.row); r++)
								for (let c = Math.min(s.col, e.col); c <= Math.max(s.col, e.col); c++)
									refs.add(colLabel(c) + (r + 1))
						i += 2
					} else {
						refs.add(tokens[i].v)
					}
				}
			}
		} catch(_) {}
		return refs
	}

	function removeEdges(cellId, sheet) {
		const old = depMap[sheet]?.[cellId]
		if (!old) return
		for (const ref of old) reverseDep[sheet]?.[ref]?.delete(cellId)
		delete depMap[sheet][cellId]
	}

	function register(cellId, value, sheet = 'Sheet1') {
		ensure(sheet)
		removeEdges(cellId, sheet)
		if (typeof value !== 'string' || !value.startsWith('=')) return
		const refs = extractRefs(value.slice(1))
		depMap[sheet][cellId] = refs
		for (const ref of refs)
			(reverseDep[sheet][ref] || (reverseDep[sheet][ref] = new Set())).add(cellId)
	}

	// Returns all cells that (transitively) depend on cellId, in BFS order.
	function getDependents(cellId, sheet = 'Sheet1') {
		ensure(sheet)
		const visited = new Set([cellId]), order = [], queue = [cellId]
		while (queue.length) {
			const cell = queue.shift()
			for (const dep of (reverseDep[sheet]?.[cell] || [])) {
				if (!visited.has(dep)) { visited.add(dep); order.push(dep); queue.push(dep) }
			}
		}
		return order
	}

	// Rebuild the entire dep graph for a sheet from raw data.
	function rebuild(sheetData, sheet = 'Sheet1') {
		ensure(sheet)
		depMap[sheet]     = {}
		reverseDep[sheet] = {}
		for (const [cellId, value] of Object.entries(sheetData || {}))
			register(cellId, value, sheet)
	}

	return { register, getDependents, rebuild }
}
