// Thin wrapper around Frappe's REST API.
// Reads the CSRF token from window.csrf_token (injected by the Jinja www template).

// `keepalive: true` lets the request outlive the current document — needed for
// fire-and-forget saves from `onBeforeUnmount`, otherwise the browser cancels
// the fetch when the SheetEditor unmounts during navigation.
export async function call(method, args = {}, { keepalive = false } = {}) {
	const res = await fetch(`/api/method/${method}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Frappe-CSRF-Token': window.csrf_token ?? '',
		},
		body: JSON.stringify(args),
		keepalive,
	})
	const json = await res.json()
	if (!res.ok || json.exc) {
		let msg = json.exc_type || 'Server error'
		if (json._server_messages) {
			try {
				const parsed = JSON.parse(json._server_messages)
				const first  = Array.isArray(parsed) ? JSON.parse(parsed[0]) : parsed
				msg = first.message || msg
			} catch (_) {
				msg = json._server_messages
			}
		}
		throw new Error(msg)
	}
	return json.message
}
