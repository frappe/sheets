import { describe, it, expect, vi } from 'vitest'
import { createRealtimeAdapter } from './realtime-adapter.js'

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

describe('createRealtimeAdapter', () => {
	it('publish() calls the yjs_relay API with stringified payload', async () => {
		const callFn = vi.fn(async () => null)
		const adapter = createRealtimeAdapter({
			sheetId: 'SHEET-1', realtime: fakeRealtime(), callFn,
		})
		await adapter.publish('yjs_update', { from: 'A', update: 'abc' })
		expect(callFn).toHaveBeenCalledWith(
			'sheets.api.yjs_relay',
			{ name: 'SHEET-1', event: 'yjs_update', payload: '{"from":"A","update":"abc"}' },
		)
	})

	it('publish() swallows relay errors so editor never blocks', async () => {
		const callFn = vi.fn(async () => { throw new Error('500') })
		const adapter = createRealtimeAdapter({
			sheetId: 'S', realtime: fakeRealtime(), callFn,
		})
		// Should not throw.
		await expect(adapter.publish('yjs_update', {})).resolves.toBeUndefined()
	})

	it('on() unwraps the server payload back to JSON for the consumer', () => {
		const rt = fakeRealtime()
		const cb = vi.fn()
		const adapter = createRealtimeAdapter({
			sheetId: 'S', realtime: rt, callFn: async () => null,
		})
		adapter.on('yjs_update', cb)
		rt._emit('yjs_update', { sheet: 'S', user: 'u', payload: '{"from":"A","x":1}' })
		expect(cb).toHaveBeenCalledWith({ from: 'A', x: 1 })
	})

	it('on() skips malformed payloads silently', () => {
		const rt = fakeRealtime()
		const cb = vi.fn()
		const adapter = createRealtimeAdapter({
			sheetId: 'S', realtime: rt, callFn: async () => null,
		})
		adapter.on('yjs_update', cb)
		rt._emit('yjs_update', { payload: 'not-json' })
		expect(cb).not.toHaveBeenCalled()
	})

	it('off() removes the wrapped callback the same on() registered', () => {
		const rt = fakeRealtime()
		const cb = vi.fn()
		const adapter = createRealtimeAdapter({
			sheetId: 'S', realtime: rt, callFn: async () => null,
		})
		adapter.on('yjs_update', cb)
		expect(rt._handlers.get('yjs_update').size).toBe(1)
		adapter.off('yjs_update', cb)
		expect(rt._handlers.get('yjs_update').size).toBe(0)
	})

	it('off() is a no-op when the callback was never registered', () => {
		const adapter = createRealtimeAdapter({
			sheetId: 'S', realtime: fakeRealtime(), callFn: async () => null,
		})
		expect(() => adapter.off('yjs_update', () => {})).not.toThrow()
	})
})
