import { describe, it, expect, vi } from 'vitest'
import * as Y from 'yjs'
import { createYDoc } from './ydoc.js'
import { createFrappeProvider } from './frappe-provider.js'

// Existing convergence/echo tests below treat the outbound publish as
// effectively synchronous — they predate the debounced coalescer. Swap
// the debounce timer for a microtask via the test seam so `await flush()`
// (a queueMicrotask wait) still drains pending updates as before.
const _microSetTimeout   = (cb) => { queueMicrotask(cb); return 1 }
const _microClearTimeout = () => {}
const _testOpts = { _setTimeout: _microSetTimeout, _clearTimeout: _microClearTimeout }

// In-memory realtime bus — peers attached to the same bus see each other's
// publishes. Mirrors the contract of frappe.realtime: `on(event, cb)`,
// `off(event, cb)`, `publish(event, payload)`.
function createBus() {
	const subs = new Map()  // event → Set<cb>
	return {
		_subs: subs,
		on:  (event, cb) => {
			let s = subs.get(event)
			if (!s) { s = new Set(); subs.set(event, s) }
			s.add(cb)
		},
		off: (event, cb) => subs.get(event)?.delete(cb),
		publish: (event, payload) => {
			// Defer to mimic real network async-ness without setTimeouts.
			queueMicrotask(() => {
				const s = subs.get(event)
				if (s) for (const cb of [...s]) cb(payload)
			})
		},
	}
}

const flush = () => new Promise(resolve => queueMicrotask(resolve))

describe('createFrappeProvider', () => {
	it('publishes local doc updates over the realtime bus', async () => {
		const bus = createBus()
		const doc = createYDoc()
		createFrappeProvider({ doc, sheetId: 'SHEET-1', realtime: bus, selfTag: 'A', ..._testOpts })
		// First call on connect: yjs_state_request
		await flush()
		expect(bus._subs.get('yjs_update')).toBeTruthy()

		// Make a local write — should publish a yjs_update.
		const received = []
		bus.on('yjs_update', p => { received.push(p) })
		doc.getMap('cells').set('Sheet1', new Y.Map())
		await flush()
		// First publish from the provider, plus our own listener saw it.
		expect(received.length).toBeGreaterThan(0)
		expect(received[0].sheet).toBe('SHEET-1')
		expect(received[0].from).toBe('A')
	})

	it('ignores its own echo (same `from` tag)', async () => {
		const bus = createBus()
		const doc = createYDoc()
		createFrappeProvider({ doc, sheetId: 'SHEET-1', realtime: bus, selfTag: 'A', ..._testOpts })
		await flush()

		// Re-publish a fake echo with our own tag — doc state must not change.
		const sizeBefore = Y.encodeStateAsUpdate(doc).length
		bus.publish('yjs_update', {
			sheet: 'SHEET-1', from: 'A',
			update: btoa(String.fromCharCode(...Y.encodeStateAsUpdate(doc))),
		})
		await flush()
		expect(Y.encodeStateAsUpdate(doc).length).toBe(sizeBefore)
	})

	it('two providers on the same bus converge', async () => {
		const bus = createBus()
		const docA = createYDoc()
		const docB = createYDoc()
		createFrappeProvider({ doc: docA, sheetId: 'SHEET-1', realtime: bus, selfTag: 'A', ..._testOpts })
		createFrappeProvider({ doc: docB, sheetId: 'SHEET-1', realtime: bus, selfTag: 'B', ..._testOpts })
		await flush()

		// A writes a cell.
		const cellsA = docA.getMap('cells')
		const m = new Y.Map()
		docA.transact(() => cellsA.set('Sheet1', m), 'test')
		docA.transact(() => m.set('A1', 'hi'), 'test')

		// Wait for the bus to flush.
		await flush(); await flush(); await flush()

		const cellsB = docB.getMap('cells')
		expect(cellsB.get('Sheet1')?.get('A1')).toBe('hi')
	})

	it('a late joiner receives the current state via yjs_state_request', async () => {
		const bus = createBus()
		const docA = createYDoc()
		createFrappeProvider({ doc: docA, sheetId: 'SHEET-1', realtime: bus, selfTag: 'A', ..._testOpts })
		await flush()
		// A populates the doc before B joins.
		const m = new Y.Map()
		docA.transact(() => docA.getMap('cells').set('Sheet1', m), 'pre')
		docA.transact(() => m.set('A1', 'pre-joined'), 'pre')
		await flush()

		// B joins late — should receive state replay.
		const docB = createYDoc()
		createFrappeProvider({ doc: docB, sheetId: 'SHEET-1', realtime: bus, selfTag: 'B', ..._testOpts })
		await flush(); await flush()
		expect(docB.getMap('cells').get('Sheet1')?.get('A1')).toBe('pre-joined')
	})

	it('filters out cross-sheet traffic', async () => {
		const bus = createBus()
		const docA = createYDoc()
		const docB = createYDoc()
		createFrappeProvider({ doc: docA, sheetId: 'SHEET-1', realtime: bus, selfTag: 'A', ..._testOpts })
		createFrappeProvider({ doc: docB, sheetId: 'SHEET-2', realtime: bus, selfTag: 'B' })
		await flush()

		const m = new Y.Map()
		docA.transact(() => docA.getMap('cells').set('Sheet1', m), 'test')
		docA.transact(() => m.set('A1', 'A-only'), 'test')
		await flush(); await flush()

		// Doc B is on a different sheet — must not have received anything.
		expect(docB.getMap('cells').get('Sheet1')).toBeUndefined()
	})

	// ── Outbound coalescing ─────────────────────────────────────────────────────
	//
	// Frappe Cloud's www path turns every Yjs update into one HTTP POST.
	// Bulk operations (split-text-to-columns on 1k+ rows, paste, fill)
	// used to fire thousands of POSTs in seconds — Chrome returned
	// ERR_INSUFFICIENT_RESOURCES and the relay queue collapsed. The provider
	// now buffers local updates and publishes a single merged payload on a
	// short debounce. Tests exercise that contract with `flushIntervalMs`
	// controlled via the test-seam timer.

	it('coalesces multiple rapid local updates into one publish', async () => {
		const bus = createBus()
		const doc = createYDoc()
		const publishes = []
		// Capture every outbound yjs_update; the merged update should land
		// in exactly one of these once we flush.
		bus.on('yjs_update', p => publishes.push(p))

		createFrappeProvider({
			doc, sheetId: 'SHEET-1', realtime: bus, selfTag: 'A',
			..._testOpts,
		})
		await flush()
		publishes.length = 0   // ignore the connect-time state_request side-effects

		// Fire ~50 writes back-to-back. With the test-seam timer they all
		// land in the same buffer; the flush is one microtask away.
		doc.transact(() => doc.getMap('cells').set('Sheet1', new Y.Map()), 'pre')
		const m = doc.getMap('cells').get('Sheet1')
		for (let i = 0; i < 50; i++) {
			doc.transact(() => m.set(`A${i}`, `v${i}`), 'bulk')
		}
		await flush(); await flush()
		// One merged publish — not 50.
		expect(publishes.length).toBe(1)
		// And the merged payload, applied to a fresh doc, materialises all 50 keys.
		const docB = createYDoc()
		Y.applyUpdate(docB, Uint8Array.from(atob(publishes[0].update), c => c.charCodeAt(0)))
		const cellsB = docB.getMap('cells').get('Sheet1')
		expect(cellsB?.size).toBe(50)
	})

	it('hard-flushes when the queue exceeds maxQueuedUpdates', async () => {
		const bus = createBus()
		const doc = createYDoc()
		const publishes = []
		bus.on('yjs_update', p => publishes.push(p))
		// `setTimeout` is replaced by a no-op so the queue can only drain
		// via the size cap — this is what guards a runaway-loop scenario
		// that never yields to the event loop.
		const noopTimer = vi.fn(() => 1)
		createFrappeProvider({
			doc, sheetId: 'SHEET-1', realtime: bus, selfTag: 'A',
			maxQueuedUpdates: 10,
			_setTimeout: noopTimer, _clearTimeout: () => {},
		})
		await flush()
		publishes.length = 0

		doc.transact(() => doc.getMap('cells').set('Sheet1', new Y.Map()), 'pre')
		const m = doc.getMap('cells').get('Sheet1')
		// 25 writes with a cap of 10 → at least 2 forced flushes happen
		// synchronously (one at the 10th update inside the cap trip, then
		// the next 10 trip it again).
		for (let i = 0; i < 25; i++) {
			doc.transact(() => m.set(`A${i}`, `v${i}`), 'bulk')
		}
		// Drain the bus's deferred dispatch so subscribers see the publishes.
		await flush(); await flush()
		// At least two forced flushes have fired; the count is implementation-
		// internal but must be a small constant, not 25.
		expect(publishes.length).toBeGreaterThanOrEqual(2)
		expect(publishes.length).toBeLessThan(25)
	})

	it('flush() drains pending updates synchronously', async () => {
		const bus = createBus()
		const doc = createYDoc()
		const publishes = []
		bus.on('yjs_update', p => publishes.push(p))
		// Long debounce window so the only way to drain is an explicit flush.
		const provider = createFrappeProvider({
			doc, sheetId: 'SHEET-1', realtime: bus, selfTag: 'A',
			flushIntervalMs: 60_000,
			_setTimeout: () => 1, _clearTimeout: () => {},
		})
		await flush()
		publishes.length = 0

		doc.transact(() => doc.getMap('cells').set('Sheet1', new Y.Map()), 'pre')
		doc.transact(() => doc.getMap('cells').get('Sheet1').set('A1', 'manual'), 'manual')
		expect(publishes.length).toBe(0)
		provider.flush()
		await flush(); await flush()
		expect(publishes.length).toBe(1)
	})

	it('destroy() flushes any in-flight buffer before disconnecting', async () => {
		const bus = createBus()
		const doc = createYDoc()
		const publishes = []
		bus.on('yjs_update', p => publishes.push(p))
		const provider = createFrappeProvider({
			doc, sheetId: 'SHEET-1', realtime: bus, selfTag: 'A',
			flushIntervalMs: 60_000,
			_setTimeout: () => 1, _clearTimeout: () => {},
		})
		await flush()
		publishes.length = 0

		doc.transact(() => doc.getMap('cells').set('Sheet1', new Y.Map()), 'pre')
		doc.transact(() => doc.getMap('cells').get('Sheet1').set('A1', 'last'), 'last')
		provider.destroy()
		await flush(); await flush()
		// The user's last keystroke before navigating away must still land.
		expect(publishes.length).toBe(1)
	})

	it('destroy() unsubscribes from the bus', async () => {
		const bus = createBus()
		const doc = createYDoc()
		const { destroy } = createFrappeProvider({
			doc, sheetId: 'SHEET-1', realtime: bus, selfTag: 'A', ..._testOpts,
		})
		await flush()
		expect(bus._subs.get('yjs_update').size).toBeGreaterThan(0)
		destroy()
		expect(bus._subs.get('yjs_update').size).toBe(0)
	})
})
