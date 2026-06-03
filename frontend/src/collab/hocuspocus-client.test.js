import { describe, it, expect, vi } from 'vitest'
import * as Y from 'yjs'

import { createHocuspocusClient } from './hocuspocus-client.js'

// Minimal stand-in for HocuspocusProvider that captures the hooks and exposes
// helpers to fire them. y-protocols Awareness has the right shape natively, so
// we use a real one — that way `setLocalStateField` / `getStates` work.
function makeFakeProvider(passthroughs = {}) {
	const ctorArgs = []
	class FakeProvider {
		constructor(opts) {
			ctorArgs.push(opts)
			this._opts     = opts
			this.awareness = passthroughs.awareness || makeFakeAwareness()
			this.destroyed = false
		}
		destroy() { this.destroyed = true }
		_fireSynced() { this._opts.onSynced?.() }
		_fireStatus(status) { this._opts.onStatus?.({ status }) }
		_fireAuthFail(reason = 'forbidden') {
			this._opts.onAuthenticationFailed?.({ reason })
		}
	}
	return { FakeProvider, ctorArgs }
}

function makeFakeAwareness() {
	const states = new Map()
	return {
		getStates: () => states,
		setLocalStateField: vi.fn(),
		on: vi.fn(),
		_states: states,
	}
}

describe('createHocuspocusClient', () => {
	it('passes config through to HocuspocusProvider', () => {
		const doc = new Y.Doc()
		const { FakeProvider, ctorArgs } = makeFakeProvider()
		createHocuspocusClient({
			doc,
			sheetId:   'SH-1',
			url:       'ws://x/collab/',
			token:     'tok-123',
			getSnapshot: () => null,
			_Provider: FakeProvider,
		})
		expect(ctorArgs).toHaveLength(1)
		expect(ctorArgs[0].url).toBe('ws://x/collab/')
		expect(ctorArgs[0].name).toBe('SH-1')
		expect(ctorArgs[0].document).toBe(doc)
		expect(ctorArgs[0].token).toBe('tok-123')
	})

	it('throws on missing required args', () => {
		expect(() => createHocuspocusClient({})).toThrow(/doc, sheetId and url/)
	})

	it('hydrates the doc on first synced when it is the leader', () => {
		const doc = new Y.Doc()
		const snapshot = { sheets: { Sheet1: { 'A1': 42 } } }
		const { FakeProvider } = makeFakeProvider()

		const client = createHocuspocusClient({
			doc,
			sheetId:   'SH-1',
			url:       'ws://x/collab/',
			token:     'tok',
			getSnapshot: () => snapshot,
			_Provider: FakeProvider,
		})

		// Solo opener: awareness states is empty → we are by definition the
		// leader → onSynced triggers hydrate.
		client.provider._fireSynced()

		const meta = doc.getMap('__collab_meta')
		expect(meta.get('bootstrapped')).toBe(true)
		const cells = doc.getMap('cells').get('Sheet1')
		expect(cells.get('A1')).toBe(42)
	})

	it('does not re-hydrate when the bootstrapped flag is already set', () => {
		const doc = new Y.Doc()
		doc.getMap('__collab_meta').set('bootstrapped', true)
		const snapshot = { sheets: { Sheet1: { 'A1': 99 } } }
		const { FakeProvider } = makeFakeProvider()

		const client = createHocuspocusClient({
			doc, sheetId: 'SH-1', url: 'ws://x/', token: 't',
			getSnapshot: () => snapshot, _Provider: FakeProvider,
		})
		client.provider._fireSynced()

		// `cells` map should remain empty — we trusted the existing state.
		const cells = doc.getMap('cells').get('Sheet1')
		expect(cells).toBeUndefined()
	})

	it('does not hydrate when another peer has a lower clientID (leader rule)', () => {
		const doc = new Y.Doc()
		const awareness = makeFakeAwareness()
		// Inject a peer with clientID = 1; ours is always >= some value > 1.
		awareness._states.set(1, { user: { id: 'peer' } })
		const { FakeProvider } = makeFakeProvider({ awareness })

		const client = createHocuspocusClient({
			doc, sheetId: 'SH-1', url: 'ws://x/', token: 't',
			getSnapshot: () => ({ sheets: { Sheet1: { 'A1': 1 } } }),
			_Provider: FakeProvider,
		})
		client.provider._fireSynced()

		const meta = doc.getMap('__collab_meta')
		expect(meta.get('bootstrapped')).toBeUndefined()
	})

	it('skips hydration when no snapshot getter is provided', () => {
		const doc = new Y.Doc()
		const { FakeProvider } = makeFakeProvider()
		const client = createHocuspocusClient({
			doc, sheetId: 'SH-1', url: 'ws://x/', token: 't',
			_Provider: FakeProvider,
		})
		client.provider._fireSynced()
		expect(doc.getMap('__collab_meta').get('bootstrapped')).toBeUndefined()
	})

	it('forwards status changes to onStatusChange', () => {
		const doc = new Y.Doc()
		const { FakeProvider } = makeFakeProvider()
		const onStatusChange = vi.fn()
		const client = createHocuspocusClient({
			doc, sheetId: 'SH-1', url: 'ws://x/', token: 't',
			onStatusChange, _Provider: FakeProvider,
		})
		client.provider._fireStatus('connected')
		client.provider._fireStatus('disconnected')
		client.provider._fireAuthFail('forbidden')

		expect(onStatusChange).toHaveBeenNthCalledWith(1, 'connected')
		expect(onStatusChange).toHaveBeenNthCalledWith(2, 'disconnected')
		expect(onStatusChange).toHaveBeenNthCalledWith(3, 'authentication-failed')
	})

	it('destroys the underlying provider', () => {
		const doc = new Y.Doc()
		const { FakeProvider } = makeFakeProvider()
		const client = createHocuspocusClient({
			doc, sheetId: 'SH-1', url: 'ws://x/', token: 't',
			_Provider: FakeProvider,
		})
		client.destroy()
		expect(client.provider.destroyed).toBe(true)
	})
})
