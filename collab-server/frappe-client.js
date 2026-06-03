// Thin wrapper around the three Frappe endpoints that back collab:
//
//   * checkAccess(sid, sheet)  — POST /api/method/spreadsheet.collab.check_collab_access
//                                forwarding the user's session cookie
//   * loadState(sheet)         — GET-equivalent for the persisted Y.Doc binary
//   * persistState(sheet, b64) — debounced write of the Y.Doc binary
//
// The first call uses cookie auth (so it inherits the user's permissions);
// the last two use the shared secret in the X-Collab-Secret header.
//
// We deliberately *don't* retry — the caller (Hocuspocus) treats a failed
// auth check as a connection refusal, and a failed persist is fine to drop
// (the next debounce window will write the latest state again).

import { config } from './env.js'

async function call(method, params = {}, { headers = {} } = {}) {
	const url = `${config.frappeBaseUrl}/api/method/${method}`
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...headers },
		body: JSON.stringify(params),
	})
	if (!res.ok) {
		const body = await res.text().catch(() => '')
		throw new Error(
			`collab-server: ${method} → ${res.status} ${body.slice(0, 200)}`,
		)
	}
	const json = await res.json()
	return json.message
}

export async function checkAccess(sid, sheetName) {
	if (!sid) throw new Error('checkAccess: missing sid')
	return call(
		'spreadsheet.collab.check_collab_access',
		{ name: sheetName },
		{ headers: { Cookie: `sid=${sid}` } },
	)
}

export async function loadState(sheetName) {
	return call(
		'spreadsheet.collab.load_collab_state',
		{ name: sheetName },
		{ headers: { 'X-Collab-Secret': config.collabSecret } },
	)
}

export async function persistState(sheetName, ydocStateB64, byteSize) {
	return call(
		'spreadsheet.collab.persist_collab_state',
		{ name: sheetName, ydoc_state: ydocStateB64, byte_size: byteSize },
		{ headers: { 'X-Collab-Secret': config.collabSecret } },
	)
}
