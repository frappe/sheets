// Tests for the Frappe HTTP wrapper. We stub global `fetch` and assert
// what each helper sends — URL, headers, body — and how it handles errors.
//
// Env vars are seeded before importing the module under test because
// `env.js` validates them at import time.

process.env.FRAPPE_BASE_URL ||= 'http://localhost:8000/'
process.env.COLLAB_SERVER_SECRET ||= 'test-secret'

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const { checkAccess, loadState, persistState } = await import('../frappe-client.js')

function stubFetch(responder) {
	const calls = []
	globalThis.fetch = async (url, init) => {
		calls.push({ url, init })
		return responder({ url, init })
	}
	return calls
}

function jsonOk(body) {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	})
}

describe('checkAccess', () => {
	beforeEach(() => { delete globalThis.fetch })

	it('forwards sid as a Cookie header and returns the unwrapped message', async () => {
		const calls = stubFetch(() => jsonOk({ message: { canRead: true, canWrite: true } }))
		const out = await checkAccess('SID-XYZ', 'SH-1')

		assert.equal(out.canRead, true)
		assert.equal(out.canWrite, true)
		assert.equal(calls.length, 1)
		assert.equal(
			calls[0].url,
			'http://localhost:8000/api/method/spreadsheet.collab.check_collab_access',
		)
		assert.equal(calls[0].init.headers.Cookie, 'sid=SID-XYZ')
		// No shared secret on the user-auth call.
		assert.equal(calls[0].init.headers['X-Collab-Secret'], undefined)
		assert.deepEqual(JSON.parse(calls[0].init.body), { name: 'SH-1' })
	})

	it('refuses to call without a sid (would silently turn into a guest hit)', async () => {
		await assert.rejects(() => checkAccess('', 'SH-1'), /missing sid/)
	})

	it('throws a helpful error on non-2xx', async () => {
		stubFetch(() => new Response('Internal Server Error', { status: 500 }))
		await assert.rejects(() => checkAccess('SID', 'SH-1'), /500/)
	})
})

describe('loadState / persistState', () => {
	beforeEach(() => { delete globalThis.fetch })

	it('loadState sends the shared secret header and never a cookie', async () => {
		const calls = stubFetch(() =>
			jsonOk({ message: { sheet: 'SH-1', ydoc_state: null, byte_size: 0 } }))
		const out = await loadState('SH-1')

		assert.equal(out.ydoc_state, null)
		assert.equal(calls[0].init.headers['X-Collab-Secret'], 'test-secret')
		assert.equal(calls[0].init.headers.Cookie, undefined)
	})

	it('persistState posts the base64 blob + byte size', async () => {
		const calls = stubFetch(() => jsonOk({ message: { sheet: 'SH-1', byte_size: 42 } }))
		await persistState('SH-1', 'AAAA', 42)

		assert.equal(calls[0].init.headers['X-Collab-Secret'], 'test-secret')
		assert.deepEqual(JSON.parse(calls[0].init.body), {
			name: 'SH-1', ydoc_state: 'AAAA', byte_size: 42,
		})
	})
})
