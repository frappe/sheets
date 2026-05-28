// Undo / redo history stack.
//
// Two entry kinds live on the same stack:
//   1. SNAPSHOT — produced by push(). Captures every engine's full state via
//      the host's snapshot() callback. Heavy (deep-clones the entire sheet,
//      ~17 MB for 5k rows) but works for any mutation.
//   2. OP — produced by pushOp(op). Records just the inverse data for one
//      mutation: { opType, cellRefs, before, after, subSheet, ... }. Cheap
//      (~100 bytes). Undo/redo dispatch through applyOp / revertOp
//      callbacks the host supplies.
//
// High-frequency mutations (cell edits, fills, pastes) push ops; the user
// experiences instant undo + zero per-edit lag. Other mutations (sheet
// add, freeze toggle, anything without natural diff data) still push
// snapshots — they're rare enough that the 750 ms hit doesn't matter.
//
// Conflict-aware undo (optional):
//   Pass `getLocalTouches: () => Set<string>` and each *snapshot* push
//   captures the set of "sheet|cellId" keys this client touched. restore()
//   then receives the touches so it reverts only those cells. Op entries
//   don't need this — they already target exactly the cells they changed.

export function createHistory({ snapshot, restore, applyOp, revertOp, maxSize = 50, getLocalTouches } = {}) {
	const stack = []
	let index   = -1

	// Snapshot push. Used by mutations that don't have a natural op
	// representation (yet). Slow path.
	function push() {
		if (index < stack.length - 1) stack.splice(index + 1)
		const touches = getLocalTouches ? getLocalTouches() : null
		stack.push({ kind: 'snap', snap: snapshot(), touches })
		index++
		_evict()
	}

	// Op push. Used by mutations that ship a `{ before, after }` diff.
	// Tens of bytes per entry instead of tens of MB.
	function pushOp(op) {
		if (index < stack.length - 1) stack.splice(index + 1)
		stack.push({ kind: 'op', op })
		index++
		_evict()
	}

	function _evict() {
		// Keep at most maxSize entries — drop the oldest. After truncation
		// the stack base might be an op entry whose "before" data assumes a
		// state that's no longer recoverable from earlier history; undoing
		// past that point is a no-op (canUndo returns false) so this is
		// safe. Pure snapshot mode behaves identically to before.
		if (stack.length > maxSize) { stack.shift(); index-- }
	}

	function undo() {
		if (index <= 0) return false
		const entry = stack[index]
		if (entry.kind === 'op') {
			// Step PAST the op (apply its inverse), but leave the stack
			// entry intact so redo can re-apply forward.
			revertOp?.(entry.op)
			index--
		} else {
			// Snapshot path: step back, restore the previous snapshot. The
			// touches hint travels with the entry being undone.
			const undoingTouches = entry.touches || null
			index--
			// The entry we land on might also be an op — but a snapshot
			// undo is "restore to that point in time" regardless, so we
			// only restore from snapshot entries. If we land on an op
			// entry, the engine state is already coherent (we just
			// reverted the op above; there's no separate state to restore).
			if (stack[index].kind === 'snap') {
				restore?.(stack[index].snap, { touches: undoingTouches })
			}
		}
		return true
	}

	function redo() {
		if (index >= stack.length - 1) return false
		index++
		const entry = stack[index]
		if (entry.kind === 'op') applyOp?.(entry.op)
		else                     restore?.(entry.snap, { touches: null })
		return true
	}

	function canUndo() { return index > 0 }
	function canRedo() { return index < stack.length - 1 }

	// Seed the initial snapshot so the first undo lands on the blank state.
	function init() { if (stack.length === 0) push() }

	return { push, pushOp, undo, redo, canUndo, canRedo, init }
}
