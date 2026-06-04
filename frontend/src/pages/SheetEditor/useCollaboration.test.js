// @vitest-environment node
//
// Integration tests for the Yjs-backed `useCollaboration` composable.
//
// Lower-level CRDT semantics are covered by `collab/*.test.js` (bindCells
// convergence, provider state-sync, awareness TTL, etc.). Here we verify
// the composable wires those pieces together correctly:
//   * lifecycle: doc/provider/awareness create on sheet open, dispose on close
//   * cell sync: local sheet.setCell still works after binding
//   * presence: awareness peers show up in presentUsers
//   * cursors:  awareness peers show up in remoteCursors with stable colours
//   * cleanup:  refs reset to empty on stop, peer events stop firing

import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useCollaboration, CURSOR_PALETTE } from './useCollaboration.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fakeSheet() {
	const cells = {}
	const setCell = vi.fn((id, value, sheet = 'Sheet1') => {
		cells[`${sheet}:${id}`] = value
	})
	return {
		setCell,
		getCell:         (id, sheet = 'Sheet1') => cells[`${sheet}:${id}`] ?? '',
		getCurrentSheet: () => 'Sheet1',
		snapshot:        () => ({ sheets: { Sheet1: {} }, current: 'Sheet1' }),
		_cells:          cells,
	}
}

function fakeRealtime() {
	const handlers = new Map()
	return {
		on:  vi.fn((event, cb) => {
			let s = handlers.get(event)
			if (!s) { s = new Set(); handlers.set(event, s) }
			s.add(cb)
		}),
		off: vi.fn((event, cb) => handlers.get(event)?.delete(cb)),
		_emit: (event, msg) => {
			const s = handlers.get(event)
			if (s) for (const cb of [...s]) cb(msg)
		},
		_handlers: handlers,
	}
}

function makeDeps(overrides = {}) {
	const sheetId      = ref('doc-abc')
	const currentSheet = ref('Sheet1')
	const sheet        = fakeSheet()
	const realtime     = fakeRealtime()
	const callFn       = vi.fn(() => Promise.resolve())
	const repopulate   = vi.fn()
	const onUnmounted  = vi.fn()

	let watchCallback
	const watchFn = (source, callback, options) => {
		watchCallback = callback
		if (options?.immediate) callback(source.value, undefined)
	}

	const deps = {
		sheetId,
		currentSheet,
		getSheet:       () => sheet,
		repopulateGrid: repopulate,
		_self:          'alice@example.com',
		_realtime:      realtime,
		_callFn:        callFn,
		_watch:         watchFn,
		_onUnmounted:   onUnmounted,
		...overrides,
	}
	const result = useCollaboration(deps)
	return {
		...result,
		sheetId, currentSheet, sheet, realtime, callFn, repopulate, onUnmounted, watchCallback,
	}
}

// Helper to emit a remote awareness state through the realtime bus exactly
// as the server-side relay would: server payload wraps the JSON inside a
// `payload` field, the adapter unwraps it before delivering to awareness.
function emitRemoteAwareness(realtime, { from, sheet = 'doc-abc', state }) {
	realtime._emit('yjs_awareness', {
		sheet,
		user: 'bob@example.com',
		payload: JSON.stringify({ sheet, from, state }),
	})
}

const flush = () => new Promise(resolve => queueMicrotask(resolve))

// ── Lifecycle ─────────────────────────────────────────────────────────────────

describe('useCollaboration — lifecycle', () => {
	it('subscribes to Yjs realtime events on start', () => {
		const { realtime } = makeDeps()
		const events = [...realtime._handlers.keys()]
		expect(events).toContain('yjs_update')
		expect(events).toContain('yjs_state_request')
		expect(events).toContain('yjs_state')
		expect(events).toContain('yjs_awareness')
		expect(events).toContain('yjs_awareness_bye')
	})

	it('does not start when sheetId is "new"', () => {
		const realtime = fakeRealtime()
		useCollaboration({
			sheetId: ref('new'), currentSheet: ref('Sheet1'),
			getSheet: () => fakeSheet(), repopulateGrid: vi.fn(),
			_self: 'u@x.com', _realtime: realtime, _callFn: vi.fn(),
			_watch:        (src, cb, opts) => { if (opts?.immediate) cb(src.value, undefined) },
			_onUnmounted:  vi.fn(),
		})
		expect(realtime.on).not.toHaveBeenCalled()
	})

	it('unsubscribes from all realtime events when the sheet id is cleared', () => {
		const { realtime, watchCallback } = makeDeps()
		watchCallback(undefined, 'doc-abc')
		// After stop the handler set for each event should be empty.
		for (const [event, set] of realtime._handlers.entries()) {
			expect(set.size, `event ${event} still has handlers`).toBe(0)
		}
	})

	it('unsubscribes from all realtime events on unmount', () => {
		const { realtime, onUnmounted } = makeDeps()
		const unmountFn = onUnmounted.mock.calls[0][0]
		unmountFn()
		for (const [event, set] of realtime._handlers.entries()) {
			expect(set.size, `event ${event} still has handlers`).toBe(0)
		}
	})

	it('switching to a new sheetId disposes the previous Y.Doc cleanly', () => {
		const { realtime, watchCallback } = makeDeps()
		// Simulate a sheet switch: stop happens implicitly via _start re-entry.
		const beforeCount = realtime.on.mock.calls.length
		watchCallback('doc-xyz', 'doc-abc')
		// New subscriptions get added; old ones got cleaned up. The handler
		// count after is roughly equal to before (replaced 1:1).
		const finalHandlerCounts = [...realtime._handlers.values()].map(s => s.size)
		expect(finalHandlerCounts.every(n => n >= 1)).toBe(true)
		expect(realtime.on.mock.calls.length).toBeGreaterThan(beforeCount)
	})
})

// ── Outbound broadcast API ────────────────────────────────────────────────────

describe('useCollaboration — broadcast functions', () => {
	it('broadcastCellChange is a no-op (Y.Doc handles cell sync internally)', () => {
		const { broadcastCellChange, callFn } = makeDeps()
		const before = callFn.mock.calls.length
		broadcastCellChange('Sheet1', 'A1', '42')
		// Should not call the old broadcast_op endpoint or any other API.
		const newCalls = callFn.mock.calls.slice(before)
		expect(newCalls.find(([m]) => m === 'spreadsheet.api.broadcast_op')).toBeUndefined()
	})

	it('broadcastBatchChange is a no-op', () => {
		const { broadcastBatchChange, callFn } = makeDeps()
		const before = callFn.mock.calls.length
		broadcastBatchChange('Sheet1', [{ id: 'A1', value: 'x' }])
		const newCalls = callFn.mock.calls.slice(before)
		expect(newCalls.find(([m]) => m === 'spreadsheet.api.broadcast_op')).toBeUndefined()
	})

	it('broadcastCursor publishes the cursor via yjs_relay → yjs_awareness', () => {
		const { broadcastCursor, callFn } = makeDeps()
		broadcastCursor(3, 5, 'Sheet1')
		// Awareness publishes on join (with cursor: null) AND on every
		// setLocalState — so we grab the *latest* awareness call, which
		// should carry the cursor we just set.
		const awarenessCalls = callFn.mock.calls.filter(
			([m, args]) => m === 'spreadsheet.api.yjs_relay' && args.event === 'yjs_awareness',
		)
		expect(awarenessCalls.length).toBeGreaterThan(0)
		const last = awarenessCalls[awarenessCalls.length - 1]
		const published = JSON.parse(last[1].payload)
		expect(published.state.cursor).toEqual({ row: 3, col: 5, range: null, subSheet: 'Sheet1' })
	})

	it('broadcastCursor includes the selection range when provided', () => {
		const { broadcastCursor, callFn } = makeDeps()
		broadcastCursor(3, 5, 'Sheet1', { r0: 2, c0: 4, r1: 6, c1: 8 })
		const awarenessCalls = callFn.mock.calls.filter(
			([m, args]) => m === 'spreadsheet.api.yjs_relay' && args.event === 'yjs_awareness',
		)
		const last = awarenessCalls[awarenessCalls.length - 1]
		const published = JSON.parse(last[1].payload)
		expect(published.state.cursor).toEqual({
			row: 3, col: 5,
			range: { r0: 2, c0: 4, r1: 6, c1: 8 },
			subSheet: 'Sheet1',
		})
	})
})

// ── Cell sync via patched setCell ────────────────────────────────────────────

describe('useCollaboration — local cell writes mirror to Y.Doc', () => {
	it('local sheet.setCell still updates the engine after binding', () => {
		const { sheet } = makeDeps()
		sheet.setCell('A1', 99, 'Sheet1')
		// The engine's underlying store sees the value (verifies the patched
		// setCell calls through to the original).
		expect(sheet._cells['Sheet1:A1']).toBe(99)
	})

	it('local setCell triggers a yjs_relay publish (provider sends update)', async () => {
		const { sheet, callFn } = makeDeps()
		const before = callFn.mock.calls.length
		sheet.setCell('A1', 'hello', 'Sheet1')
		// Outbound publishes are now debounced (~16ms) so bulk operations
		// don't exhaust browser HTTP connection slots. Wait past the
		// debounce window before asserting.
		await new Promise(r => setTimeout(r, 50))
		const after = callFn.mock.calls.slice(before)
		const updates = after.filter(
			([m, args]) => m === 'spreadsheet.api.yjs_relay' && args.event === 'yjs_update',
		)
		expect(updates.length).toBeGreaterThan(0)
	})
})

// ── Presence via awareness ────────────────────────────────────────────────────

describe('useCollaboration — presentUsers from awareness', () => {
	it('adds a peer to presentUsers when an awareness event arrives', async () => {
		const { realtime, presentUsers } = makeDeps()
		emitRemoteAwareness(realtime, {
			from: 'peer-bob',
			state: { user: { id: 'bob@example.com', fullName: 'Bob Smith', initials: 'BS', image: '' } },
		})
		await flush()
		expect(presentUsers.value).toHaveLength(1)
		expect(presentUsers.value[0].user).toBe('bob@example.com')
		expect(presentUsers.value[0].full_name).toBe('Bob Smith')
		expect(presentUsers.value[0].initials).toBe('BS')
	})

	it('ignores awareness events for self', async () => {
		const { realtime, presentUsers } = makeDeps()
		emitRemoteAwareness(realtime, {
			from: 'peer-self',
			state: { user: { id: 'alice@example.com', fullName: 'Alice', initials: 'A' } },
		})
		await flush()
		expect(presentUsers.value).toHaveLength(0)
	})

	it('ignores awareness events for a different sheet', async () => {
		const { realtime, presentUsers } = makeDeps()
		emitRemoteAwareness(realtime, {
			sheet: 'other-doc', from: 'peer-bob',
			state: { user: { id: 'bob@example.com', fullName: 'Bob', initials: 'B' } },
		})
		await flush()
		expect(presentUsers.value).toHaveLength(0)
	})

	it('dedupes presence by user.id (multiple tabs of same user → one entry)', async () => {
		const { realtime, presentUsers } = makeDeps()
		emitRemoteAwareness(realtime, {
			from: 'tab-A',
			state: { user: { id: 'bob@example.com', fullName: 'Bob', initials: 'B' } },
		})
		emitRemoteAwareness(realtime, {
			from: 'tab-B',
			state: { user: { id: 'bob@example.com', fullName: 'Bob', initials: 'B' } },
		})
		await flush()
		expect(presentUsers.value).toHaveLength(1)
	})

	it('clears presentUsers on stop', async () => {
		const { realtime, presentUsers, watchCallback } = makeDeps()
		emitRemoteAwareness(realtime, {
			from: 'peer-bob',
			state: { user: { id: 'bob@example.com', fullName: 'Bob', initials: 'B' } },
		})
		await flush()
		expect(presentUsers.value).toHaveLength(1)
		watchCallback(undefined, 'doc-abc')
		expect(presentUsers.value).toHaveLength(0)
	})
})

// ── Cursors via awareness ─────────────────────────────────────────────────────

describe('useCollaboration — remoteCursors from awareness', () => {
	it('maps awareness cursor state into remoteCursors keyed by user.id', async () => {
		const { realtime, remoteCursors } = makeDeps()
		emitRemoteAwareness(realtime, {
			from: 'peer-bob',
			state: {
				user:   { id: 'bob@example.com', fullName: 'Bob Smith', initials: 'BS' },
				cursor: { row: 3, col: 5, subSheet: 'Sheet1' },
			},
		})
		await flush()
		const cursor = remoteCursors.value.get('bob@example.com')
		expect(cursor.row).toBe(3)
		expect(cursor.col).toBe(5)
		expect(cursor.subSheet).toBe('Sheet1')
		expect(cursor.initials).toBe('BS')
	})

	it('assigns a color from the collaboration palette', async () => {
		const { realtime, remoteCursors } = makeDeps()
		emitRemoteAwareness(realtime, {
			from: 'peer-bob',
			state: {
				user:   { id: 'bob@example.com', fullName: 'Bob', initials: 'B' },
				cursor: { row: 0, col: 0, subSheet: 'Sheet1' },
			},
		})
		await flush()
		const color = remoteCursors.value.get('bob@example.com').color
		expect(CURSOR_PALETTE).toContain(color)
	})

	it('same user gets the same color across separate awareness updates', async () => {
		const { realtime, remoteCursors } = makeDeps()
		const state = {
			user:   { id: 'bob@example.com', fullName: 'Bob', initials: 'B' },
			cursor: { row: 1, col: 1, subSheet: 'Sheet1' },
		}
		emitRemoteAwareness(realtime, { from: 'peer-bob', state })
		await flush()
		const first = remoteCursors.value.get('bob@example.com').color
		emitRemoteAwareness(realtime, { from: 'peer-bob', state: { ...state, cursor: { ...state.cursor, row: 9 } } })
		await flush()
		expect(remoteCursors.value.get('bob@example.com').color).toBe(first)
	})

	it('ignores cursor states without a user object', async () => {
		const { realtime, remoteCursors } = makeDeps()
		emitRemoteAwareness(realtime, {
			from: 'peer-anon',
			state: { cursor: { row: 1, col: 2, subSheet: 'Sheet1' } },
		})
		await flush()
		expect(remoteCursors.value.size).toBe(0)
	})

	it('exposes firstName on the cursor for the GS-style name flag', async () => {
		const { realtime, remoteCursors } = makeDeps()
		emitRemoteAwareness(realtime, {
			from: 'peer-bob',
			state: {
				user:   { id: 'bob@example.com', fullName: 'Bob Smith', initials: 'BS' },
				cursor: { row: 1, col: 1, subSheet: 'Sheet1' },
			},
		})
		await flush()
		expect(remoteCursors.value.get('bob@example.com').firstName).toBe('Bob')
	})

	it('propagates a peer\'s current sub_sheet onto presentUsers for tab indicators', async () => {
		const { realtime, presentUsers } = makeDeps()
		emitRemoteAwareness(realtime, {
			from: 'peer-bob',
			state: {
				user:   { id: 'bob@example.com', fullName: 'Bob', initials: 'B' },
				cursor: { row: 0, col: 0, subSheet: 'Sheet2' },
			},
		})
		await flush()
		expect(presentUsers.value[0].sub_sheet).toBe('Sheet2')
		expect(presentUsers.value[0].first_name).toBe('Bob')
		// The avatar pile colours each peer by their cursor colour — keep
		// the contract that presentUsers carries that colour, not just
		// the cursors map.
		expect(CURSOR_PALETTE).toContain(presentUsers.value[0].color)
	})

	it('clears remoteCursors on stop', async () => {
		const { realtime, remoteCursors, watchCallback } = makeDeps()
		emitRemoteAwareness(realtime, {
			from: 'peer-bob',
			state: {
				user:   { id: 'bob@example.com', fullName: 'Bob', initials: 'B' },
				cursor: { row: 0, col: 0, subSheet: 'Sheet1' },
			},
		})
		await flush()
		expect(remoteCursors.value.size).toBe(1)
		watchCallback(undefined, 'doc-abc')
		expect(remoteCursors.value.size).toBe(0)
	})
})
