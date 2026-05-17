// Undo / redo history stack.
// Works with any object that implements snapshot() / restore(snap).

export function createHistory({ snapshot, restore, maxSize = 50 } = {}) {
	const stack = []
	let index   = -1

	// Save current state before a mutation.
	function push() {
		if (index < stack.length - 1) stack.splice(index + 1)
		stack.push(snapshot())
		index++
		if (stack.length > maxSize) { stack.shift(); index-- }
	}

	function undo() {
		if (index <= 0) return false
		restore(stack[--index])
		return true
	}

	function redo() {
		if (index >= stack.length - 1) return false
		restore(stack[++index])
		return true
	}

	function canUndo() { return index > 0 }
	function canRedo() { return index < stack.length - 1 }

	// Seed the initial snapshot so the first undo lands on the blank state.
	function init() { if (stack.length === 0) push() }

	return { push, undo, redo, canUndo, canRedo, init }
}
