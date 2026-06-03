// Config surface for the collab server. Everything is env-driven so the
// same image runs in dev, on a bench, and in CI without code changes.
//
// Required at boot — if any of these are missing the process exits with a
// clear message rather than serving traffic in a half-configured state.

function required(key) {
	const v = process.env[key]
	if (!v || !v.trim()) {
		throw new Error(`collab-server: missing required env var ${key}`)
	}
	return v.trim()
}

function int(key, fallback) {
	const raw = process.env[key]
	if (raw === undefined || raw === '') return fallback
	const n = parseInt(raw, 10)
	if (Number.isNaN(n)) throw new Error(`collab-server: ${key} must be an integer`)
	return n
}

export const config = {
	// Hocuspocus v4 ignores its own `address` option and always binds to
	// `0.0.0.0`. nginx is expected to terminate TLS and proxy `/collab/`
	// upstream — production benches don't expose this port to the
	// public internet, so the all-interfaces bind is acceptable.
	port: int('COLLAB_PORT', 1234),

	// Frappe HTTP base — e.g. http://localhost:8000. The collab server
	// talks to Frappe over plain HTTP on the loopback interface; auth is
	// either the user's `sid` cookie (forwarded from the browser) or the
	// shared secret below.
	frappeBaseUrl: required('FRAPPE_BASE_URL').replace(/\/$/, ''),

	// Shared secret for server-to-server calls (load/persist Y.Doc state).
	// MUST match `collab_server_secret` in the Frappe site_config.json.
	collabSecret: required('COLLAB_SERVER_SECRET'),

	// Optional Redis pub/sub for scaling beyond one collab process. When
	// unset we run as a single instance — perfectly fine for small fleets;
	// every connection still hits the same in-memory Y.Doc.
	redisHost: process.env.REDIS_HOST || '',
	redisPort: int('REDIS_PORT', 6379),
}
